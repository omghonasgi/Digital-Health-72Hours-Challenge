import type {
  AssistanceRequest,
  Caregiver,
  CaregiverAvailability,
  CaregiverCapability,
  ClinicalInstruction,
  EquipmentName,
  GapAction,
  GapCategory,
  GapStatus,
  Interval,
  ISODate,
  Patient,
  PatientEquipment,
  ReadinessStatus,
  RecoveryGap,
  RecoveryRequirement,
  ServiceRequest,
} from '../types';
import { HOUR_MS, iso, ms, offsetFromDischarge, subtract, totalHours, intersect, durationHours } from '../time';
import { COST_CATALOG } from './catalog';

export interface ReadinessInput {
  patient: Patient;
  equipment: PatientEquipment[];
  caregivers: Caregiver[];
  availability: CaregiverAvailability[];
  instructions: ClinicalInstruction[];
  serviceRequests: ServiceRequest[];
  assistanceRequests: AssistanceRequest[];
  /** Previous gaps, so manual statuses (escalated, resolved by coordinator, confirmed receipt) survive re-analysis. */
  existingGaps?: RecoveryGap[];
  now?: ISODate;
}

export interface CoverageSummary {
  /** Supervision windows the clinician requires. */
  requiredWindows: Interval[];
  /** Covered by accepted, consenting caregivers or confirmed providers. */
  coveredIntervals: Interval[];
  /** Covered only by caregivers who have not yet accepted, or by pending service requests. */
  pendingIntervals: Interval[];
  uncoveredIntervals: Interval[];
  requiredHours: number;
  coveredHours: number;
  uncoveredHours: number;
}

export interface ReadinessResult {
  requirements: RecoveryRequirement[];
  gaps: RecoveryGap[];
  status: ReadinessStatus;
  coverage: CoverageSummary;
}

const SUPPORTED_LANGUAGES = ['en', 'es'];

/** Statuses a human set that the deterministic pass must not clobber. */
const STICKY: GapStatus[] = ['assigned', 'assistance_requested', 'escalated', 'unresolved'];

const isActiveCaregiver = (c: Caregiver) => c.acceptedInvitation && c.consentStatus === 'granted';

export function caregiverIntervals(
  caregivers: Caregiver[],
  availability: CaregiverAvailability[],
  capability: CaregiverCapability,
  filter: (c: Caregiver) => boolean,
): Interval[] {
  const ids = new Set(caregivers.filter((c) => filter(c) && c.capabilities.includes(capability)).map((c) => c.id));
  return availability
    .filter((a) => ids.has(a.caregiverId))
    .map((a) => ({ start: ms(a.startAt), end: ms(a.endAt) }));
}

export const confirmedServiceIntervals = (requests: ServiceRequest[]) =>
  requests
    .filter((r) => r.status === 'provider_confirmed')
    .map((r) => ({ start: ms(r.windowStart), end: ms(r.windowEnd) }));

export const pendingServiceIntervals = (requests: ServiceRequest[]) =>
  requests.filter((r) => r.status === 'requested').map((r) => ({ start: ms(r.windowStart), end: ms(r.windowEnd) }));

export function detectGaps(input: ReadinessInput): ReadinessResult {
  const { patient, equipment, caregivers, availability, instructions, serviceRequests } = input;
  const now = input.now ?? new Date().toISOString();
  const existing = new Map((input.existingGaps ?? []).map((g) => [g.id, g]));
  const requirements: RecoveryRequirement[] = [];
  const gaps: RecoveryGap[] = [];

  const approved = instructions.filter((i) => i.reviewStatus === 'approved');
  const unreviewed = instructions.filter((i) => i.reviewStatus === 'draft' || i.reviewStatus === 'needs_clarification');

  const equipmentByName = new Map(equipment.map((e) => [e.equipmentName, e]));

  // -- helpers ---------------------------------------------------------------
  const pushGap = (
    reqId: string,
    gapType: GapCategory,
    descriptionKey: string,
    description: string,
    computedStatus: GapStatus,
    extra: Partial<RecoveryGap> = {},
  ) => {
    const id = extra.id ?? `gap_${reqId}_${gapType}`;
    const prev = existing.get(id);
    let status = computedStatus;
    if (prev && STICKY.includes(prev.status) && computedStatus !== 'verified_resolved') status = prev.status;
    const { id: _ignored, ...rest } = extra;
    gaps.push({
      patientId: patient.id,
      requirementId: reqId,
      gapType,
      descriptionKey,
      description,
      actions: [],
      updatedAt: prev && prev.status === status ? prev.updatedAt : now,
      assignedCoordinator: prev?.assignedCoordinator,
      resolutionNotes: prev?.resolutionNotes,
      ...rest,
      id,
      status,
    });
  };

  const pushReq = (r: Omit<RecoveryRequirement, 'patientId'>) => {
    requirements.push({ patientId: patient.id, ...r });
    return r.id;
  };

  const act = (key: string, route?: string): GapAction => ({ key, route });

  // -- unreviewed instructions block activation ------------------------------
  for (const ins of unreviewed) {
    const reqId = pushReq({
      id: `req_${ins.id}_review`,
      instructionId: ins.id,
      requirementType: 'scheduling',
      description: `Clinical review of: ${ins.originalText.slice(0, 80)}`,
      requiredResources: [],
      status: 'review_required',
    });
    pushGap(reqId, 'scheduling', 'gaps.review_required', 'Instruction awaits clinical review before it can be scheduled.', 'identified', {
      actions: [act('actions.coordinator_review', '/coordinator')],
    });
  }

  // -- equipment -------------------------------------------------------------
  // One requirement per item, patient-wide: several instructions may mention the same walker.
  const seenEquipment = new Set<EquipmentName>();
  const requireEquipment = (ins: ClinicalInstruction, items: EquipmentName[], neededByHours: number) => {
    for (const item of items) {
      if (seenEquipment.has(item)) continue;
      seenEquipment.add(item);
      const reqId = pushReq({
        id: `req_eq_${item}`,
        instructionId: ins.id,
        requirementType: 'equipment',
        description: `Required equipment: ${item.replace(/_/g, ' ')}`,
        requiredResources: [item],
        requiredEnd: offsetFromDischarge(patient.dischargeAt, neededByHours),
        status: 'unmet',
      });
      const have = equipmentByName.get(item);
      const arranged = serviceRequests.some(
        (r) => r.status === 'provider_confirmed' && r.requirementId === reqId,
      );
      const req = requirements[requirements.length - 1];
      if (have?.availabilityStatus === 'available') {
        req.status = 'met';
        if (existing.has(`gap_${reqId}_equipment`))
          pushGap(reqId, 'equipment', 'gaps.equipment_resolved', `${item} confirmed at home.`, 'verified_resolved', {
            descriptionParams: { item },
          });
        continue;
      }
      if (have?.availabilityStatus === 'can_borrow' || arranged) {
        req.status = 'pending';
        pushGap(reqId, 'equipment', 'gaps.equipment_pending', `Required ${item} is not yet confirmed at home.`, 'awaiting_confirmation', {
          descriptionParams: { item },
          estimatedCost: COST_CATALOG.equipment[item],
          actions: [act('actions.confirm_equipment_received', '/patient/resources')],
          windowEnd: req.requiredEnd,
        });
        continue;
      }
      pushGap(
        reqId,
        'equipment',
        'gaps.equipment_missing',
        `Equipment gap detected. Required ${item.replace(/_/g, ' ')} has not been confirmed.`,
        'identified',
        {
          descriptionParams: { item },
          estimatedCost: COST_CATALOG.equipment[item],
          actions: [act('actions.find_equipment_assistance', '/patient/finance'), act('actions.confirm_equipment_received', '/patient/resources')],
          windowEnd: req.requiredEnd,
        },
      );
    }
  };

  // -- supervision coverage ------------------------------------------------------
  const requiredWindows: Interval[] = [];
  const supervisionReqIds: string[] = [];
  const activeSupervision = caregiverIntervals(caregivers, availability, 'supervision', isActiveCaregiver);
  const pendingSupervision = caregiverIntervals(caregivers, availability, 'supervision', (c) => !isActiveCaregiver(c));
  const confirmedServices = confirmedServiceIntervals(serviceRequests);
  const pendingServices = pendingServiceIntervals(serviceRequests);

  for (const ins of approved) {
    const s = ins.structured;
    switch (s.kind) {
      case 'equipment':
        requireEquipment(ins, s.requiredEquipment, s.neededByOffsetHours);
        break;
      case 'mobility': {
        if (s.requiredEquipment.length) requireEquipment(ins, s.requiredEquipment, 0);
        if (s.noStairs && patient.homeEnvironment.hasStairs) {
          const reqId = pushReq({
            id: `req_${ins.id}_stairs`,
            instructionId: ins.id,
            requirementType: 'home_accessibility',
            description: 'Stair restriction vs. stairs at home',
            requiredResources: [],
            status: 'unmet',
          });
          const prev = existing.get(`gap_${reqId}_home_accessibility`);
          const resolved = prev?.status === 'verified_resolved';
          requirements[requirements.length - 1].status = resolved ? 'met' : 'unmet';
          pushGap(
            reqId,
            'home_accessibility',
            'gaps.stairs',
            'Home accessibility gap: the care plan limits stairs and the patient reports stairs at home.',
            resolved ? 'verified_resolved' : 'identified',
            { actions: [act('actions.plan_ground_floor', '/patient/resources'), act('actions.coordinator_review', '/coordinator')] },
          );
        }
        break;
      }
      case 'wound_care':
        if (s.requiredEquipment.length) requireEquipment(ins, s.requiredEquipment, s.firstOffsetHours ?? 0);
        if (!s.timingExplicit) scheduleReview(ins);
        break;
      case 'medication': {
        const reqId = pushReq({
          id: `req_${ins.id}_med`,
          instructionId: ins.id,
          requirementType: 'medication_access',
          description: `Obtain ${s.name}${s.dose ? ` ${s.dose}` : ''}`,
          requiredResources: [s.name],
          requiredEnd: offsetFromDischarge(patient.dischargeAt, s.firstDoseOffsetHours ?? 0),
          status: 'pending',
        });
        const prev = existing.get(`gap_${reqId}_medication_access`);
        const confirmed = prev?.status === 'verified_resolved';
        requirements[requirements.length - 1].status = confirmed ? 'met' : 'pending';
        pushGap(
          reqId,
          'medication_access',
          confirmed ? 'gaps.medication_confirmed' : 'gaps.medication_unconfirmed',
          confirmed ? `${s.name} confirmed in hand.` : `${s.name} has not been confirmed as picked up.`,
          confirmed ? 'verified_resolved' : 'identified',
          {
            descriptionParams: { name: s.name },
            estimatedCost: confirmed ? 0 : COST_CATALOG.medicationCopay,
            actions: [act('actions.confirm_medication_received', '/patient/resources'), act('actions.find_medication_assistance', '/patient/finance')],
            windowEnd: requirements[requirements.length - 1].requiredEnd,
          },
        );
        if (!s.asNeeded && !s.timingExplicit) scheduleReview(ins);
        break;
      }
      case 'caregiver': {
        const start = ms(patient.dischargeAt) + s.supervisionStartOffsetHours * HOUR_MS;
        const window: Interval = { start, end: start + s.supervisionDurationHours * HOUR_MS };
        requiredWindows.push(window);
        const reqId = pushReq({
          id: `req_${ins.id}_supervision`,
          instructionId: ins.id,
          requirementType: 'caregiving',
          description: `Responsible adult present for ${s.supervisionDurationHours}h after discharge`,
          requiredStart: iso(window.start),
          requiredEnd: iso(window.end),
          requiredResources: [],
          requiredCapability: 'supervision',
          status: 'unmet',
        });
        supervisionReqIds.push(reqId);
        const covered = [...activeSupervision, ...confirmedServices];
        const uncovered = subtract(window, covered);
        const req = requirements[requirements.length - 1];
        if (uncovered.length === 0) {
          req.status = 'met';
          // Previously-detected coverage gaps for this requirement are now resolved.
          for (const g of input.existingGaps ?? [])
            if (g.requirementId === reqId && g.gapType === 'caregiving')
              pushGap(reqId, 'caregiving', 'gaps.coverage_resolved', 'Supervision window fully covered.', 'verified_resolved', { id: g.id });
          break;
        }
        req.status = 'unmet';
        // Split each uncovered stretch into what is pending (unaccepted caregiver,
        // unconfirmed provider) and what nobody has offered to cover at all.
        const pending = [...pendingSupervision, ...pendingServices];
        const pieces: { interval: Interval; pending: boolean }[] = [];
        for (const u of uncovered) {
          for (const p of pending) {
            const x = intersect(u, p);
            if (x) pieces.push({ interval: x, pending: true });
          }
          for (const m of subtract(u, pending)) pieces.push({ interval: m, pending: false });
        }
        pieces.sort((a, b) => a.interval.start - b.interval.start);
        pieces.forEach(({ interval: u, pending: pendingCover }, idx) => {
          const hours = Math.round(durationHours(u) * 10) / 10;
          pushGap(
            reqId,
            'caregiving',
            pendingCover ? 'gaps.coverage_pending' : 'gaps.coverage_missing',
            pendingCover
              ? `Caregiver coverage for ${hours}h is pending acceptance or provider confirmation.`
              : `Caregiver coverage gap detected: ${hours}h of the required supervision period has no confirmed responsible adult.${patient.homeEnvironment.livesAlone ? ' Patient lives alone.' : ''}`,
            pendingCover ? 'awaiting_confirmation' : 'identified',
            {
              id: `gap_${reqId}_caregiving_${idx}`,
              descriptionParams: { hours },
              windowStart: iso(u.start),
              windowEnd: iso(u.end),
              estimatedCost: Math.ceil(durationHours(u)) * COST_CATALOG.caregivingHourly,
              actions: [act('actions.find_caregiver', '/patient/caregivers'), act('actions.invite_caregiver', '/patient/caregivers')],
            },
          );
        });
        break;
      }
      case 'transportation': {
        const status = s.purpose === 'ride_home' ? patient.homeEnvironment.rideHome : patient.homeEnvironment.followUpTransport;
        const reqId = pushReq({
          id: `req_${ins.id}_${s.purpose}`,
          instructionId: ins.id,
          requirementType: 'transportation',
          description: s.purpose === 'ride_home' ? 'Ride home from the facility' : 'Transportation to follow-up',
          requiredStart: offsetFromDischarge(patient.dischargeAt, s.offsetHours),
          requiredResources: ['ride'],
          requiredCapability: 'transport',
          status: status === 'confirmed' ? 'met' : status === 'pending' ? 'pending' : 'unmet',
        });
        if (status === 'confirmed') {
          if (existing.has(`gap_${reqId}_transportation`))
            pushGap(reqId, 'transportation', 'gaps.transport_resolved', 'Ride confirmed.', 'verified_resolved');
          break;
        }
        pushGap(
          reqId,
          'transportation',
          status === 'pending' ? 'gaps.transport_pending' : 'gaps.transport_missing',
          status === 'pending'
            ? `${s.purpose === 'ride_home' ? 'Ride home' : 'Follow-up transportation'} is arranged but not yet confirmed${s.escortRequired ? ' to meet the escort requirement' : ''}.`
            : `No ${s.purpose === 'ride_home' ? 'ride home' : 'transportation to the follow-up'} has been arranged.`,
          status === 'pending' ? 'awaiting_confirmation' : 'identified',
          {
            descriptionParams: { purpose: s.purpose },
            estimatedCost: COST_CATALOG.rideOneWay,
            windowStart: offsetFromDischarge(patient.dischargeAt, s.offsetHours),
            actions: [act('actions.confirm_ride', '/patient/resources'), act('actions.find_transport_provider', '/patient/caregivers')],
          },
        );
        break;
      }
      case 'follow_up': {
        pushReq({
          id: `req_${ins.id}_followup`,
          instructionId: ins.id,
          requirementType: 'scheduling',
          description: `Follow-up appointment${s.location ? ` at ${s.location}` : ''}`,
          requiredStart: offsetFromDischarge(patient.dischargeAt, s.offsetHours),
          requiredResources: [],
          status: 'met',
        });
        if (s.transportRequired) {
          const tStatus = patient.homeEnvironment.followUpTransport;
          const reqId = pushReq({
            id: `req_${ins.id}_followup_transport`,
            instructionId: ins.id,
            requirementType: 'transportation',
            description: 'Transportation to follow-up appointment',
            requiredStart: offsetFromDischarge(patient.dischargeAt, s.offsetHours - 1),
            requiredResources: ['ride'],
            requiredCapability: 'transport',
            status: tStatus === 'confirmed' ? 'met' : tStatus === 'pending' ? 'pending' : 'unmet',
          });
          if (tStatus !== 'confirmed')
            pushGap(
              reqId,
              'transportation',
              tStatus === 'pending' ? 'gaps.transport_pending' : 'gaps.transport_missing',
              tStatus === 'pending'
                ? 'Follow-up transportation is arranged but not yet confirmed.'
                : 'No transportation to the follow-up appointment has been arranged.',
              tStatus === 'pending' ? 'awaiting_confirmation' : 'identified',
              {
                descriptionParams: { purpose: 'follow_up' },
                estimatedCost: COST_CATALOG.rideOneWay * 2,
                windowStart: offsetFromDischarge(patient.dischargeAt, s.offsetHours - 1),
                actions: [act('actions.confirm_ride', '/patient/resources'), act('actions.find_transport_provider', '/patient/caregivers')],
              },
            );
        }
        break;
      }
      case 'diet': {
        if (!patient.homeEnvironment.reliableFood) {
          const reqId = pushReq({
            id: `req_${ins.id}_meals`,
            instructionId: ins.id,
            requirementType: 'caregiving',
            description: 'Reliable access to meals during recovery',
            requiredResources: ['meals'],
            requiredCapability: 'meals',
            status: 'unmet',
          });
          const mealsHelp =
            caregivers.some((c) => isActiveCaregiver(c) && c.capabilities.includes('meals')) ||
            serviceRequests.some((r) => r.status === 'provider_confirmed' && r.requirementId === reqId);
          requirements[requirements.length - 1].status = mealsHelp ? 'met' : 'unmet';
          if (!mealsHelp)
            pushGap(reqId, 'caregiving', 'gaps.meals_missing', 'No confirmed help with meals, and the patient reports unreliable access to food.', 'identified', {
              estimatedCost: COST_CATALOG.mealsPerDay * 3,
              actions: [act('actions.find_meal_support', '/patient/caregivers'), act('actions.find_meal_assistance', '/patient/finance')],
            });
        }
        break;
      }
      case 'check_in':
      case 'warning_signs':
        break;
    }
  }

  function scheduleReview(ins: ClinicalInstruction) {
    const reqId = pushReq({
      id: `req_${ins.id}_timing`,
      instructionId: ins.id,
      requirementType: 'scheduling',
      description: 'Timing not explicit in the clinician document',
      requiredResources: [],
      status: 'review_required',
    });
    pushGap(reqId, 'scheduling', 'gaps.timing_ambiguous', 'Timing is not explicit in the document. Clinical review required before scheduling.', 'identified', {
      actions: [act('actions.coordinator_review', '/coordinator')],
    });
  }

  // -- language ----------------------------------------------------------------
  for (const c of caregivers) {
    const understood = c.languages.some((l) => SUPPORTED_LANGUAGES.includes(l));
    if (c.needsTranslatedInstructions || !c.languages.includes('en')) {
      const reqId = pushReq({
        id: `req_lang_${c.id}`,
        instructionId: '',
        requirementType: 'language',
        description: `${c.name} needs instructions in ${c.languages.join('/')}`,
        requiredResources: [],
        status: understood ? 'met' : 'unmet',
      });
      pushGap(
        reqId,
        'language',
        understood ? 'gaps.language_supported' : 'gaps.language_unsupported',
        understood
          ? `${c.name} will see task instructions in their language, with the original alongside.`
          : `${c.name} needs instructions in a language this build does not support.`,
        understood ? 'verified_resolved' : 'identified',
        { descriptionParams: { name: c.name }, actions: understood ? [] : [act('actions.coordinator_review', '/coordinator')] },
      );
    }
  }

  // -- coverage summary ---------------------------------------------------------
  const coveredAll = [...activeSupervision, ...confirmedServices];
  const uncoveredAll = requiredWindows.flatMap((w) => subtract(w, coveredAll));
  const coveredWithin = requiredWindows.flatMap((w) => coveredAll.map((c) => intersect(w, c)).filter((x): x is Interval => !!x));
  const pendingWithin = uncoveredAll.flatMap((u) =>
    [...pendingSupervision, ...pendingServices].map((p) => intersect(u, p)).filter((x): x is Interval => !!x),
  );
  const coverage: CoverageSummary = {
    requiredWindows,
    coveredIntervals: coveredWithin,
    pendingIntervals: pendingWithin,
    uncoveredIntervals: uncoveredAll,
    requiredHours: totalHours(requiredWindows),
    coveredHours: totalHours(coveredWithin),
    uncoveredHours: totalHours(uncoveredAll),
  };

  // -- financial -------------------------------------------------------------------
  const estimated = gaps
    .filter((g) => g.status !== 'verified_resolved' && g.gapType !== 'financial')
    .reduce((s, g) => s + (g.estimatedCost ?? 0), 0);
  const approvedAssistance = input.assistanceRequests
    .filter((a) => a.status === 'approved')
    .reduce((s, a) => s + (a.approvedAmount ?? 0), 0);
  const remaining = Math.max(0, estimated - patient.recoveryBudget - approvedAssistance);
  if (estimated > 0) {
    const reqId = pushReq({
      id: `req_${patient.id}_financial`,
      instructionId: '',
      requirementType: 'financial',
      description: 'Recovery expenses within confirmed funding',
      requiredResources: [],
      status: remaining > 0 ? 'unmet' : 'met',
    });
    const pendingAssist = input.assistanceRequests.some((a) => a.status === 'under_review' || a.status === 'application_needed');
    if (remaining > 0)
      pushGap(
        reqId,
        'financial',
        'gaps.financial',
        `Estimated recovery costs exceed confirmed funding by $${remaining}.`,
        pendingAssist ? 'assistance_requested' : 'identified',
        {
          descriptionParams: { amount: remaining },
          estimatedCost: remaining,
          actions: [act('actions.find_financial_assistance', '/patient/finance')],
        },
      );
    else if (existing.has(`gap_${reqId}_financial`))
      pushGap(reqId, 'financial', 'gaps.financial_resolved', 'Estimated costs are within confirmed funding.', 'verified_resolved');
  }

  // -- readiness status ------------------------------------------------------------
  const open = gaps.filter((g) => g.status !== 'verified_resolved');
  let status: ReadinessStatus = 'no_reported_gaps';
  if (requirements.some((r) => r.status === 'review_required')) status = 'clinical_review_required';
  else if (open.some((g) => ['identified', 'unresolved', 'escalated'].includes(g.status))) status = 'gaps_identified';
  else if (open.length) status = 'assistance_being_arranged';

  return { requirements, gaps, status, coverage };
}

export const openGaps = (gaps: RecoveryGap[]) => gaps.filter((g) => g.status !== 'verified_resolved');
