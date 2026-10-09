import type { RecoveryTask, Role } from '@/core/types';

export type ReminderKind = 'due' | 'check_in';

export interface PlannedReminder {
  /** Stable per task + kind so a re-sync replaces rather than duplicates. */
  id: string;
  taskId: string;
  patientId: string;
  kind: ReminderKind;
  fireAt: number;
  task: RecoveryTask;
}

/** iOS keeps at most 64 pending local notifications per app; stay under it. */
export const MAX_SCHEDULED = 60;

const OPEN: RecoveryTask['status'][] = ['scheduled', 'assigned', 'in_progress', 'awaiting_resources'];

/**
 * Which device reminders a signed-in person should have, derived only from
 * tasks the calendar already generated from approved instructions. Nothing
 * here invents a time: `due` fires at the task's scheduled instant, and
 * `check_in` fires at its due instant so a caregiver can step in if the
 * patient has not reported it.
 */
export function planReminders(tasks: RecoveryTask[], viewer: { role: Role; profileId: string }, now: number): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const task of tasks) {
    if (!OPEN.includes(task.status)) continue;
    const mine = viewer.role === 'patient' ? task.assignedRole === 'patient' || !task.assignedUserId : task.assignedUserId === viewer.profileId;
    const at = Date.parse(task.scheduledAt);
    const due = Date.parse(task.dueAt);
    if (mine && at > now) out.push({ id: `task:${task.id}:due`, taskId: task.id, patientId: task.patientId, kind: 'due', fireAt: at, task });
    // Caregivers get a second nudge for the patient's own tasks once they are overdue.
    if (viewer.role === 'caregiver' && !mine && due > now) out.push({ id: `task:${task.id}:check_in`, taskId: task.id, patientId: task.patientId, kind: 'check_in', fireAt: due, task });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, MAX_SCHEDULED);
}
