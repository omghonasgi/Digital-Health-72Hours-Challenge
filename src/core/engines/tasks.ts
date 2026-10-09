import type { RecoveryTask, Role, TaskEvent, TaskEventType, TaskStatus } from '../types';

/**
 * Task lifecycle. A checked box is a *report*, not a verification:
 * patients and caregivers can only reach `*_reported_complete`; only a
 * coordinator moves a task to `verified_complete`. Blocked and missed tasks
 * stay that way until someone documents what was done about them.
 */
const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskEventType, TaskStatus>>> = {
  scheduled: {
    assignment_accepted: 'assigned',
    started: 'in_progress',
    reported_complete: 'patient_reported_complete',
    missed: 'missed',
    blocked: 'blocked',
    reassigned: 'scheduled',
  },
  awaiting_resources: {
    resource_confirmed: 'scheduled',
    blocked: 'blocked',
    escalated: 'escalated',
    reassigned: 'awaiting_resources',
  },
  assigned: {
    started: 'in_progress',
    reported_complete: 'caregiver_reported_complete',
    missed: 'missed',
    blocked: 'blocked',
    reassigned: 'scheduled',
  },
  in_progress: {
    reported_complete: 'patient_reported_complete',
    blocked: 'blocked',
    missed: 'missed',
  },
  patient_reported_complete: { verified: 'verified_complete', note: 'patient_reported_complete' },
  caregiver_reported_complete: { verified: 'verified_complete', note: 'caregiver_reported_complete' },
  verified_complete: { note: 'verified_complete' },
  missed: { escalated: 'escalated', reported_complete: 'patient_reported_complete', resolved: 'scheduled' },
  blocked: { escalated: 'escalated', resolved: 'scheduled' },
  escalated: { resolved: 'scheduled', verified: 'verified_complete' },
};

export interface TransitionActor {
  id: string;
  role: Role | 'system';
}

export class TransitionError extends Error {}

export function canTransition(status: TaskStatus, event: TaskEventType) {
  return !!TRANSITIONS[status][event];
}

export function applyTransition(
  task: RecoveryTask,
  event: TaskEventType,
  actor: TransitionActor,
  opts: { notes?: string; now?: string; assignedCaregiverId?: string; assignedUserId?: string } = {},
): { task: RecoveryTask; event: TaskEvent } {
  const now = opts.now ?? new Date().toISOString();
  let to = TRANSITIONS[task.status][event];
  if (!to) throw new TransitionError(`Cannot apply ${event} to a task that is ${task.status}`);

  if (event === 'reported_complete') {
    to = actor.role === 'caregiver' ? 'caregiver_reported_complete' : actor.role === 'coordinator' ? 'verified_complete' : 'patient_reported_complete';
  }
  if (event === 'verified' && actor.role !== 'coordinator') throw new TransitionError('Only a coordinator can verify completion');
  if ((event === 'resolved' || event === 'escalated') && actor.role !== 'coordinator' && actor.role !== 'system')
    throw new TransitionError('Only a coordinator can resolve or escalate');
  if (event === 'resolved' && !opts.notes?.trim()) throw new TransitionError('Resolution must be documented');
  if (event === 'blocked' && !opts.notes?.trim()) throw new TransitionError('Describe what is blocking the task');

  const next: RecoveryTask = {
    ...task,
    status: to,
    completedAt: to.endsWith('complete') ? (task.completedAt ?? now) : task.completedAt,
    verifiedBy: to === 'verified_complete' ? actor.id : task.verifiedBy,
    blockedReason: event === 'blocked' ? opts.notes : to === 'blocked' ? task.blockedReason : undefined,
    assignedCaregiverId: opts.assignedCaregiverId ?? task.assignedCaregiverId,
    assignedUserId: opts.assignedUserId ?? task.assignedUserId,
  };
  if (event === 'reassigned') {
    next.assignedRole = opts.assignedCaregiverId ? 'family_caregiver' : next.assignedRole;
  }
  return {
    task: next,
    event: {
      id: `evt_${task.id}_${Date.parse(now).toString(36)}_${event}`,
      taskId: task.id,
      actorId: actor.id,
      actorRole: actor.role,
      eventType: event,
      fromStatus: task.status,
      toStatus: to,
      notes: opts.notes,
      createdAt: now,
    },
  };
}

export const isComplete = (s: TaskStatus) =>
  s === 'verified_complete' || s === 'patient_reported_complete' || s === 'caregiver_reported_complete';

export const isOpen = (s: TaskStatus) => !isComplete(s);

export const needsAttention = (s: TaskStatus) => s === 'missed' || s === 'blocked' || s === 'escalated' || s === 'awaiting_resources';

/** Tasks past due that nobody reported on become `missed`. Idempotent. */
export function markMissed(tasks: RecoveryTask[], now: string): { task: RecoveryTask; event: TaskEvent }[] {
  const t = Date.parse(now);
  const out: { task: RecoveryTask; event: TaskEvent }[] = [];
  for (const task of tasks) {
    if (Date.parse(task.dueAt) < t && (task.status === 'scheduled' || task.status === 'assigned' || task.status === 'in_progress')) {
      out.push(applyTransition(task, 'missed', { id: 'system', role: 'system' }, { now }));
    }
  }
  return out;
}
