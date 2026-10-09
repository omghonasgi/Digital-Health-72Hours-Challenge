import type { Notification, RecoveryTask } from '../types';

export const DEFAULT_LEAD_MINUTES = 30;

/**
 * Reminders are derived from approved task timing and a configurable lead
 * time. Returns notifications for tasks whose reminder moment falls inside
 * (lastRun, now]. Idempotent across runs when the caller passes `lastRun`.
 */
export function dueReminders(
  tasks: RecoveryTask[],
  recipients: (task: RecoveryTask) => string[],
  now: string,
  lastRun?: string,
  leadMinutes = DEFAULT_LEAD_MINUTES,
): Notification[] {
  const nowMs = Date.parse(now);
  const lastMs = lastRun ? Date.parse(lastRun) : nowMs - 60 * 60 * 1000;
  const out: Notification[] = [];
  for (const t of tasks) {
    if (t.status.endsWith('complete') || t.status === 'blocked' || t.status === 'escalated') continue;
    const fireAt = Date.parse(t.scheduledAt) - leadMinutes * 60 * 1000;
    if (fireAt > lastMs && fireAt <= nowMs) {
      for (const r of recipients(t))
        out.push({
          id: `ntf_${t.id}_${r}_reminder`,
          recipientId: r,
          taskId: t.id,
          messageKey: 'notifications.reminder',
          messageParams: { title: t.titleKey, minutes: leadMinutes },
          message: `Upcoming in ${leadMinutes} minutes: ${t.title}`,
          status: 'unread',
          createdAt: now,
        });
    }
  }
  return out;
}

export function escalationNotification(task: RecoveryTask, recipientId: string, now: string, kind: 'missed' | 'blocked'): Notification {
  return {
    id: `ntf_${task.id}_${recipientId}_${kind}_${Date.parse(now).toString(36)}`,
    recipientId,
    taskId: task.id,
    messageKey: kind === 'missed' ? 'notifications.missed' : 'notifications.blocked',
    messageParams: { title: task.titleKey },
    message: kind === 'missed' ? `Task missed: ${task.title}` : `Task blocked: ${task.title}${task.blockedReason ? ` — ${task.blockedReason}` : ''}`,
    status: 'unread',
    createdAt: now,
  };
}
