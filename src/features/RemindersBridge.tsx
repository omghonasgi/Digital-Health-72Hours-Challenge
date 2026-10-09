import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { canTransition } from '@/core/engines/tasks';
import { transitionTask } from '@/core/usecases';
import { cancelReminders, dismissReminder, initReminders, useReminderResponse } from '@/notifications/device';
import { planChanged } from '@/notifications/events';
import { useSession } from '@/state/SessionProvider';

/**
 * Headless. Turns a tap on a task reminder into the same report the in-app
 * button makes: "Done" records a patient- or caregiver-reported completion
 * (never a verification), and either tap opens the task.
 */
export function RemindersBridge() {
  const { session, repo } = useSession();
  const router = useRouter();
  const response = useReminderResponse();
  const handled = useRef<string | null>(null);
  const role = session?.profile.role;

  useEffect(() => {
    void initReminders();
  }, []);

  // Reminders belong to whoever is signed in on this phone.
  useEffect(() => {
    if (!session) void cancelReminders().catch(() => undefined);
  }, [session]);

  useEffect(() => {
    if (!response || !session || handled.current === response.key) return;
    if (role !== 'patient' && role !== 'caregiver') return;
    handled.current = response.key;
    void (async () => {
      try {
        const task = await repo.getTask(response.taskId);
        if (!task) return;
        if (response.done && canTransition(task.status, 'reported_complete')) {
          await transitionTask(repo, session, task, 'reported_complete', { notes: 'Reported from the reminder notification' });
          await dismissReminder(response.notificationId);
          planChanged.emit();
        }
        router.push(role === 'patient' ? { pathname: '/patient/task/[id]', params: { id: task.id } } : { pathname: '/caregiver/task/[id]', params: { id: task.id } });
      } catch {
        // The reminder was for a task this account can no longer see (signed in as someone else).
      }
    })();
  }, [response, session, role, repo, router]);

  return null;
}
