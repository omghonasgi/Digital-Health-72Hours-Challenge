import type {
  AssignedRole,
  Caregiver,
  CaregiverAvailability,
  CaregiverCapability,
  ClinicalInstruction,
  Interval,
  ISODate,
  Patient,
  PatientEquipment,
  RecoveryGap,
  RecoveryTask,
  ServiceRequest,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '../types';
import { HOUR_MS, contains, iso, localHour, ms, recoveryWindow, subtract, intersect, normalize } from '../time';
import { WAKING_HOURS } from './catalog';
import { confirmedServiceIntervals } from './gaps';

export interface CalendarInput {
  patient: Patient;
  instructions: ClinicalInstruction[];
  caregivers: Caregiver[];
  availability: CaregiverAvailability[];
  equipment: PatientEquipment[];
  serviceRequests: ServiceRequest[];
  gaps: RecoveryGap[];
  /** Previously generated tasks: status, assignee and history are preserved by id. */
  existingTasks?: RecoveryTask[];
  now?: ISODate;
}

export interface CalendarResult {
  tasks: RecoveryTask[];
  /** Instruction ids that were approved but could not be scheduled without guessing. */
  reviewItems: { instructionId: string; reasonKey: string }[];
}

type Draft = Omit<RecoveryTask, 'patientId' | 'createdAt' | 'status' | 'title' | 'description'> & {
  status?: TaskStatus;
  capability?: CaregiverCapability;
};

const isActive = (c: Caregiver) => c.acceptedInvitation && c.consentStatus === 'granted';

/**
 * Generates the 72-hour plan from approved instructions only.
 *
 * Rules:
 *  - The window starts at the actual discharge instant, never at midnight.
 *  - Relative instructions ("every 6 hours", "24 hours of supervision") are
 *    anchored to discharge; absolute ones are used as written.
 *  - If a document gives no explicit timing, no task is created; a review
 *    item is returned instead.
 *  - Tasks needing a capability are offered to an active caregiver who is
 *    available at that moment. The caregiver still has to accept.
 */
export function generateCalendar(input: CalendarInput): CalendarResult {
  const { patient, caregivers, availability, equipment, serviceRequests } = input;
  const now = input.now ?? new Date().toISOString();
  const window = recoveryWindow(patient.dischargeAt);
  const tz = patient.timezone;
  const drafts: Draft[] = [];
  const reviewItems: CalendarResult['reviewItems'] = [];
  const approved = input.instructions.filter((i) => i.reviewStatus === 'approved');

  const equipmentAvailable = (name: string) => equipment.some((e) => e.equipmentName === name && e.availabilityStatus === 'available');
  const openGapFor = (requirementId: string) =>
    input.gaps.find((g) => g.requirementId === requirementId && g.status !== 'verified_resolved');

  const confirmedServices = serviceRequests.filter((r) => r.status === 'provider_confirmed');

  const caregiverAt = (t: number, capability: CaregiverCapability) => {
    for (const c of caregivers) {
      if (!isActive(c) || !c.capabilities.includes(capability) || !c.willingForAssigned) continue;
      const slots = availability.filter((a) => a.caregiverId === c.id);
      if (slots.some((s) => contains({ start: ms(s.startAt), end: ms(s.endAt) }, t))) return c;
    }
    return undefined;
  };

  const times = (first: number, every: number, until: number, wakingOnly?: boolean): number[] => {
    const out: number[] = [];
    for (let t = first; t < until && t < window.end; t += every * HOUR_MS) {
      if (wakingOnly) {
        const h = localHour(t, tz);
        if (h < WAKING_HOURS.start || h >= WAKING_HOURS.end) continue;
      }
      out.push(t);
    }
    return out;
  };

  const add = (d: Draft) => drafts.push(d);

  for (const ins of approved) {
    const s = ins.structured;
    const base = { instructionId: ins.id, sourceText: ins.originalText };
    switch (s.kind) {
      case 'medication': {
        if (s.asNeeded) {
          add({
            ...base,
            id: `task_${ins.id}_prn`,
            requirementId: `req_${ins.id}_med`,
            category: 'medication',
            titleKey: 'tasks.medication_prn',
            titleParams: { name: s.name, dose: s.dose ?? '' },
            scheduledAt: patient.dischargeAt,
            dueAt: iso(window.end),
            assignedRole: 'patient',
            requiredResources: [s.name],
            priority: 'normal',
          });
          break;
        }
        if (!s.timingExplicit || !s.frequencyHours) {
          reviewItems.push({ instructionId: ins.id, reasonKey: 'review.medication_timing' });
          break;
        }
        const first = window.start + (s.firstDoseOffsetHours ?? 0) * HOUR_MS;
        const until = s.durationHours ? window.start + s.durationHours * HOUR_MS : window.end;
        times(first, s.frequencyHours, until).forEach((t, n) =>
          add({
            ...base,
            id: `task_${ins.id}_${n}`,
            requirementId: `req_${ins.id}_med`,
            category: 'medication',
            titleKey: 'tasks.medication_dose',
            titleParams: { name: s.name, dose: s.dose ?? '' },
            scheduledAt: iso(t),
            dueAt: iso(t + HOUR_MS),
            assignedRole: 'patient',
            requiredResources: [s.name],
            priority: 'critical',
          }),
        );
        break;
      }
      case 'mobility': {
        if (s.walkFrequencyHours) {
          times(window.start + 2 * HOUR_MS, s.walkFrequencyHours, window.end, s.wakingHoursOnly ?? true).forEach((t, n) =>
            add({
              ...base,
              id: `task_${ins.id}_${n}`,
              requirementId: s.requiredEquipment[0] ? `req_eq_${s.requiredEquipment[0]}` : undefined,
              category: 'mobility',
              titleKey: 'tasks.mobility_walk',
              titleParams: { equipment: s.requiredEquipment.join(', ') },
              scheduledAt: iso(t),
              dueAt: iso(t + HOUR_MS),
              assignedRole: 'patient',
              requiredResources: s.requiredEquipment,
              priority: 'normal',
            }),
          );
        }
        break;
      }
      case 'equipment': {
        for (const item of s.requiredEquipment) {
          const due = window.start + s.neededByOffsetHours * HOUR_MS;
          add({
            ...base,
            id: `task_${ins.id}_${item}`,
            requirementId: `req_eq_${item}`,
            category: 'equipment',
            titleKey: 'tasks.equipment_confirm',
            titleParams: { item },
            scheduledAt: iso(Math.min(due, window.start)),
            dueAt: iso(due),
            assignedRole: 'patient',
            requiredResources: [item],
            priority: 'high',
          });
        }
        break;
      }
      case 'caregiver': {
        const start = window.start + s.supervisionStartOffsetHours * HOUR_MS;
        const req: Interval = { start, end: start + s.supervisionDurationHours * HOUR_MS };
        const reqId = `req_${ins.id}_supervision`;
        let n = 0;
        // One shift per active caregiver availability block within the window.
        for (const c of caregivers.filter(isActive)) {
          if (!c.capabilities.includes('supervision')) continue;
          for (const a of availability.filter((x) => x.caregiverId === c.id)) {
            const x = intersect(req, { start: ms(a.startAt), end: ms(a.endAt) });
            if (!x) continue;
            add({
              ...base,
              id: `task_${ins.id}_shift_${c.id}_${n++}`,
              requirementId: reqId,
              category: 'caregiver_assistance',
              titleKey: 'tasks.supervision_shift',
              titleParams: { name: c.name },
              scheduledAt: iso(x.start),
              dueAt: iso(x.end),
              assignedRole: 'family_caregiver',
              assignedCaregiverId: c.id,
              assignedUserId: c.profileId,
              requiredResources: [],
              priority: 'critical',
              capability: 'supervision',
            });
          }
        }
        // Confirmed provider shifts.
        for (const r of confirmedServices) {
          const x = intersect(req, { start: ms(r.windowStart), end: ms(r.windowEnd) });
          if (!x) continue;
          add({
            ...base,
            id: `task_${ins.id}_provider_${r.id}`,
            requirementId: reqId,
            category: 'caregiver_assistance',
            titleKey: 'tasks.supervision_provider',
            titleParams: {},
            scheduledAt: iso(x.start),
            dueAt: iso(x.end),
            assignedRole: 'professional_caregiver',
            serviceRequestId: r.id,
            requiredResources: [],
            priority: 'critical',
            status: 'assigned',
          });
        }
        // Uncovered stretches become open shifts awaiting a responsible person.
        const covered = normalize([
          ...availability
            .filter((a) => caregivers.some((c) => c.id === a.caregiverId && isActive(c) && c.capabilities.includes('supervision')))
            .map((a) => ({ start: ms(a.startAt), end: ms(a.endAt) })),
          ...confirmedServiceIntervals(serviceRequests),
        ]);
        subtract(req, covered).forEach((u, i) =>
          add({
            ...base,
            id: `task_${ins.id}_open_${i}`,
            requirementId: reqId,
            category: 'caregiver_assistance',
            titleKey: 'tasks.supervision_open',
            titleParams: {},
            scheduledAt: iso(u.start),
            dueAt: iso(u.end),
            assignedRole: 'professional_caregiver',
            requiredResources: [],
            priority: 'critical',
            status: 'awaiting_resources',
          }),
        );
        break;
      }
      case 'transportation': {
        const t = window.start + s.offsetHours * HOUR_MS;
        const reqId = `req_${ins.id}_${s.purpose}`;
        const status = s.purpose === 'ride_home' ? patient.homeEnvironment.rideHome : patient.homeEnvironment.followUpTransport;
        add({
          ...base,
          id: `task_${ins.id}_ride`,
          requirementId: reqId,
          category: 'transportation',
          titleKey: s.purpose === 'ride_home' ? 'tasks.ride_home' : 'tasks.ride_follow_up',
          titleParams: {},
          scheduledAt: iso(t),
          dueAt: iso(t + HOUR_MS),
          assignedRole: 'patient',
          requiredResources: ['ride'],
          priority: 'critical',
          capability: 'transport',
          status: status === 'confirmed' ? undefined : 'awaiting_resources',
        });
        break;
      }
      case 'follow_up': {
        const t = window.start + s.offsetHours * HOUR_MS;
        add({
          ...base,
          id: `task_${ins.id}_appt`,
          requirementId: `req_${ins.id}_followup`,
          category: 'follow_up',
          titleKey: 'tasks.follow_up',
          titleParams: { location: s.location ?? '', withWhom: s.withWhom ?? '' },
          scheduledAt: iso(t),
          dueAt: iso(t + HOUR_MS),
          assignedRole: 'patient',
          requiredResources: s.transportRequired ? ['ride'] : [],
          priority: 'high',
        });
        if (s.transportRequired)
          add({
            ...base,
            id: `task_${ins.id}_appt_ride`,
            requirementId: `req_${ins.id}_followup_transport`,
            category: 'transportation',
            titleKey: 'tasks.ride_follow_up',
            titleParams: {},
            scheduledAt: iso(t - HOUR_MS),
            dueAt: iso(t),
            assignedRole: 'patient',
            requiredResources: ['ride'],
            priority: 'high',
            capability: 'transport',
            status: patient.homeEnvironment.followUpTransport === 'confirmed' ? undefined : 'awaiting_resources',
          });
        break;
      }
      case 'wound_care': {
        if (!s.timingExplicit || !s.frequencyHours) {
          reviewItems.push({ instructionId: ins.id, reasonKey: 'review.wound_care_timing' });
          break;
        }
        times(
          window.start + (s.firstOffsetHours ?? 0) * HOUR_MS,
          s.frequencyHours,
          s.durationHours ? window.start + s.durationHours * HOUR_MS : window.end,
          s.wakingHoursOnly,
        ).forEach((t, n) =>
          add({
            ...base,
            id: `task_${ins.id}_${n}`,
            requirementId: s.requiredEquipment[0] ? `req_eq_${s.requiredEquipment[0]}` : undefined,
            category: 'wound_care',
            titleKey: s.label ? 'tasks.wound_care_labeled' : 'tasks.wound_care',
            titleParams: { label: s.label ?? '' },
            scheduledAt: iso(t),
            dueAt: iso(t + 2 * HOUR_MS),
            assignedRole: 'patient',
            requiredResources: s.requiredEquipment,
            priority: 'high',
            capability: 'basic_tasks',
          }),
        );
        break;
      }
      case 'diet': {
        if (s.hydrationReminderHours)
          times(window.start + HOUR_MS, s.hydrationReminderHours, window.end, s.wakingHoursOnly ?? true).forEach((t, n) =>
            add({
              ...base,
              id: `task_${ins.id}_h${n}`,
              category: 'meals_hydration',
              titleKey: 'tasks.hydration',
              titleParams: {},
              scheduledAt: iso(t),
              dueAt: iso(t + HOUR_MS),
              assignedRole: 'patient',
              requiredResources: [],
              priority: 'normal',
            }),
          );
        if (s.mealReminderHours)
          times(window.start + 3 * HOUR_MS, s.mealReminderHours, window.end, s.wakingHoursOnly ?? true).forEach((t, n) =>
            add({
              ...base,
              id: `task_${ins.id}_m${n}`,
              requirementId: `req_${ins.id}_meals`,
              category: 'meals_hydration',
              titleKey: 'tasks.meal',
              titleParams: {},
              scheduledAt: iso(t),
              dueAt: iso(t + 2 * HOUR_MS),
              assignedRole: 'patient',
              requiredResources: patient.homeEnvironment.reliableFood ? [] : ['meals'],
              priority: 'normal',
              capability: 'meals',
            }),
          );
        break;
      }
      case 'check_in': {
        s.offsetsHours.forEach((h, n) => {
          const t = window.start + h * HOUR_MS;
          if (t > window.end) return;
          add({
            ...base,
            id: `task_${ins.id}_${n}`,
            category: 'check_in',
            titleKey: 'tasks.check_in',
            titleParams: { hours: h },
            scheduledAt: iso(t),
            dueAt: iso(t + 2 * HOUR_MS),
            assignedRole: 'patient',
            requiredResources: [],
            priority: 'high',
          });
        });
        break;
      }
      case 'warning_signs':
        break;
    }
  }

  // -- assignment and resource status ------------------------------------------
  const existing = new Map((input.existingTasks ?? []).map((t) => [t.id, t]));
  const tasks: RecoveryTask[] = drafts.map((d) => {
    const prev = existing.get(d.id);
    let assignedRole: AssignedRole = d.assignedRole;
    let assignedCaregiverId = d.assignedCaregiverId;
    let assignedUserId = d.assignedUserId;
    let status: TaskStatus = d.status ?? 'scheduled';

    if (!assignedCaregiverId && d.capability && d.assignedRole === 'patient') {
      const c = caregiverAt(ms(d.scheduledAt), d.capability);
      if (c) {
        assignedRole = 'family_caregiver';
        assignedCaregiverId = c.id;
        assignedUserId = c.profileId;
      }
    }
    // Equipment and unconfirmed resources hold the task.
    const missingEquipment = d.requiredResources.some(
      (r) => r !== 'ride' && r !== 'meals' && !isMedication(d) && !equipmentAvailable(r),
    );
    const openGap = d.requirementId ? openGapFor(d.requirementId) : undefined;
    if (status === 'scheduled' && (missingEquipment || (d.category === 'equipment' && openGap))) status = 'awaiting_resources';
    if (status === 'scheduled' && d.category === 'medication' && openGap) status = 'awaiting_resources';
    if (status === 'scheduled' && d.capability && assignedRole === 'patient' && d.requiredResources.includes('meals')) status = 'awaiting_resources';

    const { capability: _c, status: _s, ...rest } = d;
    const task: RecoveryTask = {
      ...rest,
      patientId: patient.id,
      assignedRole,
      assignedCaregiverId,
      assignedUserId,
      status,
      title: d.titleKey,
      description: '',
      createdAt: prev?.createdAt ?? now,
    };
    if (prev) {
      // Human-driven state wins over regeneration; resource/assignment state is recomputed.
      const humanStates: TaskStatus[] = [
        'assigned',
        'in_progress',
        'patient_reported_complete',
        'caregiver_reported_complete',
        'verified_complete',
        'missed',
        'blocked',
        'escalated',
      ];
      if (humanStates.includes(prev.status)) {
        task.status = prev.status;
        task.completedAt = prev.completedAt;
        task.verifiedBy = prev.verifiedBy;
        task.blockedReason = prev.blockedReason;
        task.assignedCaregiverId = prev.assignedCaregiverId ?? task.assignedCaregiverId;
        task.assignedUserId = prev.assignedUserId ?? task.assignedUserId;
        task.assignedRole = prev.assignedRole;
      }
    }
    return task;
  });

  tasks.sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt) || priorityRank(a.priority) - priorityRank(b.priority));
  return { tasks, reviewItems };
}

const isMedication = (d: { category: TaskCategory }) => d.category === 'medication';
const priorityRank = (p: TaskPriority) => (p === 'critical' ? 0 : p === 'high' ? 1 : 2);

export const nextTasks = (tasks: RecoveryTask[], now: string, n = 3) =>
  tasks
    .filter((t) => Date.parse(t.dueAt) >= Date.parse(now) && !t.status.endsWith('complete'))
    .slice(0, n);
