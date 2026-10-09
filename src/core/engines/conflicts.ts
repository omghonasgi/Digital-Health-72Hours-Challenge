import type { CalendarConflict, RecoveryGap, RecoveryTask, ServiceRequest } from '../types';
import { ms } from '../time';

export interface ConflictInput {
  tasks: RecoveryTask[];
  gaps: RecoveryGap[];
  serviceRequests: ServiceRequest[];
  dischargeAt: string;
}

/**
 * Conflicts are the calendar's view of unresolved gaps: the same facts,
 * placed on the timeline where they bite. Each one carries a next step.
 */
export function detectConflicts(input: ConflictInput): CalendarConflict[] {
  const { tasks, gaps, serviceRequests } = input;
  const out: CalendarConflict[] = [];
  const open = gaps.filter((g) => g.status !== 'verified_resolved');

  for (const g of open) {
    const firstTask = tasks.find((t) => t.requirementId === g.requirementId);
    switch (g.gapType) {
      case 'caregiving':
        if (g.windowStart && g.windowEnd)
          out.push({
            id: `conflict_${g.id}`,
            type: 'caregiver_unavailable',
            gapId: g.id,
            windowStart: g.windowStart,
            windowEnd: g.windowEnd,
            messageKey: g.status === 'awaiting_confirmation' ? 'conflicts.caregiver_pending' : 'conflicts.caregiver_unavailable',
            messageParams: g.descriptionParams,
            message:
              g.status === 'awaiting_confirmation'
                ? 'Coverage for the required assistance period is pending acceptance or confirmation.'
                : 'Caregiver unavailable during the required assistance period. Alternative coverage has not been confirmed.',
            actions: g.actions,
          });
        else if (g.descriptionKey.startsWith('gaps.meals'))
          out.push(simple(g, 'unassigned_required_task', 'conflicts.meals_unassigned', 'Meal support is required but no one has been confirmed to help.', firstTask));
        break;
      case 'equipment':
        out.push(simple(g, 'equipment_missing', 'conflicts.equipment_missing', 'Required equipment has not been obtained before the first task that needs it.', firstTask));
        break;
      case 'transportation':
        out.push(simple(g, 'transport_unconfirmed', 'conflicts.transport_unconfirmed', 'Transportation is not confirmed before it is needed.', firstTask));
        break;
      case 'medication_access':
        if (firstTask)
          out.push(simple(g, 'medication_unconfirmed', 'conflicts.medication_unconfirmed', 'A prescribed medication has not been confirmed as obtained before the first dose.', firstTask));
        break;
      default:
        break;
    }
  }

  for (const r of serviceRequests.filter((r) => r.status === 'requested')) {
    out.push({
      id: `conflict_sr_${r.id}`,
      type: 'service_unconfirmed',
      windowStart: r.windowStart,
      windowEnd: r.windowEnd,
      messageKey: 'conflicts.service_unconfirmed',
      message: 'A requested service has not been confirmed by the provider before its start time.',
      actions: [{ key: 'actions.follow_up_provider', route: '/patient/caregivers' }],
    });
  }

  for (const t of tasks) {
    if (
      (t.priority === 'critical' || t.priority === 'high') &&
      t.status === 'awaiting_resources' &&
      t.assignedRole !== 'patient' &&
      !t.assignedCaregiverId &&
      !t.serviceRequestId &&
      !out.some((c) => c.taskId === t.id || (c.gapId && gaps.find((g) => g.id === c.gapId)?.requirementId === t.requirementId))
    ) {
      out.push({
        id: `conflict_task_${t.id}`,
        type: 'unassigned_required_task',
        taskId: t.id,
        windowStart: t.scheduledAt,
        windowEnd: t.dueAt,
        messageKey: 'conflicts.unassigned',
        message: 'A required task has no assigned responsible person.',
        actions: [{ key: 'actions.find_caregiver', route: '/patient/caregivers' }],
      });
    }
  }

  return out.sort((a, b) => ms(a.windowStart) - ms(b.windowStart));
}

function simple(
  g: RecoveryGap,
  type: CalendarConflict['type'],
  messageKey: string,
  message: string,
  task?: RecoveryTask,
): CalendarConflict {
  return {
    id: `conflict_${g.id}`,
    type,
    gapId: g.id,
    taskId: task?.id,
    windowStart: task?.scheduledAt ?? g.windowStart ?? g.windowEnd ?? g.updatedAt,
    windowEnd: task?.dueAt ?? g.windowEnd ?? g.updatedAt,
    messageKey,
    messageParams: g.descriptionParams,
    message,
    actions: g.actions,
  };
}
