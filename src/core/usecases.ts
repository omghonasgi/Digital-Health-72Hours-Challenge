import type { Repository } from '@/data/repository';
import { newId } from '@/data/repository';
import { generateCalendar } from './engines/calendar';
import { detectConflicts } from './engines/conflicts';
import { computeFinancials, matchAssistancePrograms, type ProgramMatch } from './engines/finance';
import { detectGaps, type CoverageSummary } from './engines/gaps';
import { matchProviders } from './engines/matching';
import { escalationNotification, dueReminders } from './engines/notifications';
import { applyTransition, markMissed } from './engines/tasks';
import { capabilityToService } from './engines/catalog';
import { isPlanCode, makeInviteCode, makePlanCode, normalizeCode } from './codes';
import type { IntakeInput, InstructionInput } from './schemas';
import { ms } from './time';
import type {
  AssistanceRequest,
  AssistanceStatus,
  CalendarConflict,
  Caregiver,
  CaregiverAvailability,
  ClinicalInstruction,
  DischargeDocument,
  FinancialSummary,
  GapStatus,
  Interval,
  Patient,
  PatientEquipment,
  ProviderMatch,
  ProviderService,
  ReadinessStatus,
  RecoveryGap,
  RecoveryRequirement,
  RecoveryTask,
  ServiceRequest,
  Session,
  TaskEvent,
  TaskEventType,
} from './types';

export interface PlanView {
  patient: Patient;
  equipment: PatientEquipment[];
  caregivers: Caregiver[];
  availability: CaregiverAvailability[];
  documents: DischargeDocument[];
  instructions: ClinicalInstruction[];
  requirements: RecoveryRequirement[];
  gaps: RecoveryGap[];
  readiness: ReadinessStatus;
  coverage: CoverageSummary;
  finance: FinancialSummary;
  programs: ProgramMatch[];
  serviceRequests: ServiceRequest[];
  assistanceRequests: AssistanceRequest[];
  tasks: RecoveryTask[];
  conflicts: CalendarConflict[];
  reviewItems: { instructionId: string; reasonKey: string }[];
}

const nowIso = () => new Date().toISOString();

async function loadInputs(repo: Repository, patientId: string) {
  const patient = await repo.getPatient(patientId);
  if (!patient) throw new Error('Patient not found');
  const [equipment, caregivers, instructions, serviceRequests, assistanceRequests, existingGaps, existingTasks] = await Promise.all([
    repo.listEquipment(patientId),
    repo.listCaregivers(patientId),
    repo.listInstructions(patientId),
    repo.listServiceRequests(patientId),
    repo.listAssistanceRequests(patientId),
    repo.listGaps(patientId),
    repo.listTasks(patientId),
  ]);
  const availability = await repo.listAvailability(caregivers.map((c) => c.id));
  return { patient, equipment, caregivers, availability, instructions, serviceRequests, assistanceRequests, existingGaps, existingTasks };
}

/**
 * Re-runs the deterministic pipeline and persists the result:
 * requirements + gaps (readiness) and tasks (calendar). Human-set statuses
 * on gaps and tasks survive because both engines key by stable ids.
 */
export async function refreshPlan(repo: Repository, patientId: string, now = nowIso()) {
  const inp = await loadInputs(repo, patientId);
  const readiness = detectGaps({ ...inp, now });
  await repo.replaceRequirements(patientId, readiness.requirements);
  await repo.replaceGaps(patientId, readiness.gaps);

  const cal = generateCalendar({
    patient: inp.patient,
    instructions: inp.instructions,
    caregivers: inp.caregivers,
    availability: inp.availability,
    equipment: inp.equipment,
    serviceRequests: inp.serviceRequests,
    gaps: readiness.gaps,
    existingTasks: inp.existingTasks,
    now,
  });
  await repo.replaceTasks(patientId, cal.tasks);
  const known = new Set(inp.existingTasks.map((t) => t.id));
  for (const t of cal.tasks)
    if (!known.has(t.id))
      await repo.addTaskEvent({
        id: `evt_${t.id}_created`,
        taskId: t.id,
        actorId: 'system',
        actorRole: 'system',
        eventType: 'created',
        toStatus: t.status,
        createdAt: now,
      });
  return { readiness, calendar: cal };
}

export async function getPlan(repo: Repository, patientId: string, now = nowIso()): Promise<PlanView> {
  const inp = await loadInputs(repo, patientId);
  const [requirements, gaps, tasks, documents, programs] = await Promise.all([
    repo.listRequirements(patientId),
    repo.listGaps(patientId),
    repo.listTasks(patientId),
    repo.listDocuments(patientId),
    repo.listPrograms(),
  ]);
  // Coverage and readiness status are cheap to recompute from the same inputs.
  const readiness = detectGaps({ ...inp, existingGaps: gaps, now });
  const finance = computeFinancials({
    patient: inp.patient,
    equipment: inp.equipment,
    requirements,
    gaps,
    serviceRequests: inp.serviceRequests,
    assistanceRequests: inp.assistanceRequests,
  });
  const cal = generateCalendar({ ...inp, gaps, existingTasks: tasks, now });
  return {
    patient: inp.patient,
    equipment: inp.equipment,
    caregivers: inp.caregivers,
    availability: inp.availability,
    documents,
    instructions: inp.instructions,
    requirements,
    gaps,
    readiness: readiness.status,
    coverage: readiness.coverage,
    finance,
    programs: matchAssistancePrograms(inp.patient, programs, finance, inp.assistanceRequests),
    serviceRequests: inp.serviceRequests,
    assistanceRequests: inp.assistanceRequests,
    tasks,
    conflicts: detectConflicts({ tasks, gaps, serviceRequests: inp.serviceRequests, dischargeAt: inp.patient.dischargeAt }),
    reviewItems: cal.reviewItems,
  };
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export async function submitIntake(repo: Repository, session: Session, input: IntakeInput, existing?: Patient) {
  const now = nowIso();
  const patientId = existing?.id ?? newId('pat');
  const patient: Patient = {
    id: patientId,
    profileId: existing?.profileId ?? session.profile.id,
    organizationId: existing?.organizationId ?? session.profile.organizationId,
    displayName: input.displayName,
    ageRange: input.ageRange,
    preferredLanguage: input.preferredLanguage,
    zip: input.zip,
    city: input.city,
    procedureName: input.procedureName,
    facility: input.facility,
    surgeryDate: input.surgeryDate,
    dischargeAt: input.dischargeAt,
    timezone: input.timezone,
    insuranceType: input.insuranceType,
    recoveryBudget: input.recoveryBudget,
    incomeRange: input.incomeRange,
    financialConcerns: input.financialConcerns,
    homeEnvironment: input.homeEnvironment,
    intakeCompletedAt: now,
    accessCode: existing?.accessCode ?? makePlanCode(input.displayName),
    createdAt: existing?.createdAt ?? now,
  };
  await repo.savePatient(patient);
  if (session.profile.role === 'patient') {
    await repo.saveProfile({ ...session.profile, displayName: input.displayName, preferredLanguage: input.preferredLanguage });
  }

  const prevEquipment = existing ? await repo.listEquipment(patientId) : [];
  await repo.replaceEquipment(
    patientId,
    input.equipment.map((e) => {
      const prev = prevEquipment.find((p) => p.equipmentName === e.equipmentName);
      return {
        id: prev?.id ?? `eq_${patientId}_${e.equipmentName}`,
        patientId,
        equipmentName: e.equipmentName,
        otherLabel: e.otherLabel,
        availabilityStatus: e.availabilityStatus,
        receivedAt: e.availabilityStatus === 'available' ? (prev?.receivedAt ?? now) : undefined,
      };
    }),
  );

  const prevCaregivers = existing ? await repo.listCaregivers(patientId) : [];
  const keep = new Set<string>();
  for (const c of input.caregivers) {
    const prev = prevCaregivers.find((p) => p.id === c.id);
    const id = prev?.id ?? newId('cg');
    keep.add(id);
    const caregiver: Caregiver = {
      id,
      patientId,
      profileId: prev?.profileId,
      name: c.name,
      relationship: c.relationship,
      languages: c.languages,
      capabilities: c.capabilities,
      willingForAssigned: c.willingForAssigned,
      needsTranslatedInstructions: c.needsTranslatedInstructions,
      inviteCode: prev?.inviteCode ?? makeInviteCode(c.name),
      // Entering a name is not consent. Both flip only when the caregiver accepts.
      acceptedInvitation: prev?.acceptedInvitation ?? false,
      consentStatus: prev?.consentStatus ?? 'pending',
      proxyAccess: prev?.proxyAccess ?? false,
      createdAt: prev?.createdAt ?? now,
    };
    await repo.saveCaregiver(caregiver);
    await repo.replaceAvailability(
      id,
      c.availability.map((b, i) => ({ id: `av_${id}_${i}_${Date.parse(b.startAt).toString(36)}`, caregiverId: id, startAt: b.startAt, endAt: b.endAt, confirmed: false })),
    );
  }
  for (const p of prevCaregivers) {
    if (keep.has(p.id)) continue;
    // Linked accounts (invite or plan code) are not removed by editing the intake list.
    if (p.profileId) continue;
    await repo.deleteCaregiver(p.id);
  }

  await refreshPlan(repo, patientId, now);
  return patient;
}


// ---------------------------------------------------------------------------
// Instructions and review
// ---------------------------------------------------------------------------

export async function addDocument(repo: Repository, session: Session, patientId: string, file: { name: string; mimeType?: string; size?: number; uri?: string }, readable: boolean) {
  const doc: DischargeDocument = {
    id: newId('doc'),
    patientId,
    fileName: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.size,
    extractionStatus: readable ? 'uploaded' : 'unreadable',
    uploadedBy: session.profile.id,
    uploadedAt: nowIso(),
  };
  return repo.addDocument(doc, file.uri ? { uri: file.uri } : undefined);
}

export async function saveInstruction(repo: Repository, session: Session, input: InstructionInput, existing?: ClinicalInstruction) {
  const now = nowIso();
  const instruction: ClinicalInstruction = {
    id: existing?.id ?? input.id ?? newId('ins'),
    patientId: input.patientId,
    documentId: input.documentId,
    category: input.category,
    originalText: input.originalText,
    sourcePage: input.sourcePage,
    structured: input.structured,
    // Any edit returns the instruction to draft: the reviewer approved the previous text, not this one.
    reviewStatus: 'draft',
    enteredBy: existing?.enteredBy ?? session.profile.id,
    createdAt: existing?.createdAt ?? now,
  };
  await repo.saveInstruction(instruction);
  await refreshPlan(repo, input.patientId, now);
  return instruction;
}

export async function reviewInstruction(
  repo: Repository,
  session: Session,
  instruction: ClinicalInstruction,
  status: 'approved' | 'needs_clarification' | 'rejected',
  notes?: string,
) {
  if (session.profile.role !== 'coordinator') throw new Error('Only a coordinator can review instructions');
  const now = nowIso();
  const reviewed: ClinicalInstruction = { ...instruction, reviewStatus: status, reviewNotes: notes, reviewedBy: session.profile.id, reviewedAt: now };
  await repo.saveInstruction(reviewed);
  await repo.addReview({
    id: newId('rev'),
    patientId: instruction.patientId,
    reviewerId: session.profile.id,
    reviewType: 'instruction_extraction',
    status: 'completed',
    notes: `${status}: ${instruction.originalText.slice(0, 80)}${notes ? ` — ${notes}` : ''}`,
    reviewedAt: now,
  });
  await refreshPlan(repo, instruction.patientId, now);
  return reviewed;
}

// ---------------------------------------------------------------------------
// Gaps and resources
// ---------------------------------------------------------------------------

export async function confirmResource(repo: Repository, session: Session, gap: RecoveryGap, notes?: string) {
  const now = nowIso();
  const patient = await repo.getPatient(gap.patientId);
  if (!patient) throw new Error('Patient not found');
  switch (gap.gapType) {
    case 'equipment': {
      const item = String(gap.descriptionParams?.item ?? '');
      const list = await repo.listEquipment(gap.patientId);
      const prev = list.find((e) => e.equipmentName === item);
      await repo.saveEquipment({
        id: prev?.id ?? `eq_${gap.patientId}_${item}`,
        patientId: gap.patientId,
        equipmentName: item as PatientEquipment['equipmentName'],
        availabilityStatus: 'available',
        receivedAt: now,
      });
      break;
    }
    case 'transportation': {
      const purpose = gap.descriptionParams?.purpose;
      await repo.savePatient({
        ...patient,
        homeEnvironment: {
          ...patient.homeEnvironment,
          ...(purpose === 'ride_home' ? { rideHome: 'confirmed' as const } : { followUpTransport: 'confirmed' as const }),
        },
      });
      break;
    }
    default:
      await repo.saveGap({ ...gap, status: 'verified_resolved', resolutionNotes: notes ?? `Confirmed by ${session.profile.displayName}`, updatedAt: now });
  }
  await refreshPlan(repo, gap.patientId, now);
}

export async function updateGap(repo: Repository, session: Session, gap: RecoveryGap, status: GapStatus, notes?: string) {
  if (session.profile.role !== 'coordinator') throw new Error('Only a coordinator can update gap status');
  await repo.saveGap({ ...gap, status, resolutionNotes: notes ?? gap.resolutionNotes, assignedCoordinator: session.profile.id, updatedAt: nowIso() });
  if (status === 'escalated')
    await repo.addReview({ id: newId('rev'), patientId: gap.patientId, reviewerId: session.profile.id, reviewType: 'escalation', status: 'open', notes: `Escalated: ${gap.description}`, reviewedAt: nowIso() });
  await refreshPlan(repo, gap.patientId);
}

// ---------------------------------------------------------------------------
// Providers and assistance
// ---------------------------------------------------------------------------

export function windowsForGap(plan: PlanView, gap?: RecoveryGap): { windows: Interval[]; services: ProviderService[] } {
  if (gap?.windowStart && gap.windowEnd) {
    const req = plan.requirements.find((r) => r.id === gap.requirementId);
    const svc = req?.requiredCapability ? capabilityToService[req.requiredCapability] : 'supervision';
    return { windows: [{ start: ms(gap.windowStart), end: ms(gap.windowEnd) }], services: [svc] };
  }
  if (gap?.gapType === 'transportation') {
    const t = gap.windowStart ? ms(gap.windowStart) : ms(plan.patient.dischargeAt);
    return { windows: [{ start: t, end: t + 2 * 3600_000 }], services: ['transport'] };
  }
  if (gap?.descriptionKey.startsWith('gaps.meals')) {
    return { windows: [{ start: ms(plan.patient.dischargeAt), end: ms(plan.patient.dischargeAt) + 72 * 3600_000 }], services: ['meals'] };
  }
  return { windows: plan.coverage.uncoveredIntervals, services: ['supervision'] };
}

export async function matchProvidersFor(repo: Repository, plan: PlanView, gap?: RecoveryGap): Promise<ProviderMatch[]> {
  const [providers, availability] = await Promise.all([repo.listProviders(), repo.listProviderAvailability()]);
  const { windows, services } = windowsForGap(plan, gap);
  return matchProviders({
    patient: plan.patient,
    providers,
    availability,
    requiredWindows: windows,
    requiredServices: services,
    budgetRemaining: Math.max(0, plan.finance.confirmedFunding - plan.finance.totalEstimatedCost + (gap?.estimatedCost ?? 0)),
  });
}

export async function requestService(repo: Repository, session: Session, plan: PlanView, match: ProviderMatch, gap?: RecoveryGap) {
  const now = nowIso();
  const first = match.coveredWindows[0] ?? windowsForGap(plan, gap).windows[0];
  const last = match.coveredWindows[match.coveredWindows.length - 1] ?? first;
  const req: ServiceRequest = {
    id: newId('sr'),
    patientId: plan.patient.id,
    providerId: match.provider.id,
    gapId: gap?.id,
    requirementId: gap?.requirementId,
    windowStart: new Date(first.start).toISOString(),
    windowEnd: new Date(last.end).toISOString(),
    quotedCost: match.estimatedCost,
    status: 'requested',
    requestedAt: now,
  };
  await repo.saveServiceRequest(req);
  if (gap) await repo.saveGap({ ...gap, status: 'awaiting_confirmation', updatedAt: now });
  await refreshPlan(repo, plan.patient.id, now);
  return req;
}

/** Demo stand-in for a provider's booking system calling back. Clearly labelled in the UI. */
export async function simulateProviderResponse(repo: Repository, request: ServiceRequest, response: 'provider_confirmed' | 'declined') {
  const now = nowIso();
  await repo.saveServiceRequest({ ...request, status: response, confirmedAt: response === 'provider_confirmed' ? now : undefined });
  if (request.gapId) {
    const gaps = await repo.listGaps(request.patientId);
    const gap = gaps.find((g) => g.id === request.gapId);
    if (gap && response === 'declined') await repo.saveGap({ ...gap, status: 'identified', updatedAt: now });
  }
  await refreshPlan(repo, request.patientId, now);
}

export async function requestAssistance(repo: Repository, session: Session, plan: PlanView, program: ProgramMatch) {
  const now = nowIso();
  const line = plan.finance.lines.find((l) => program.applicableLineIds.includes(l.id));
  const req: AssistanceRequest = {
    id: newId('ar'),
    patientId: plan.patient.id,
    programId: program.program.id,
    requirementId: line?.requirementId,
    requestedAmount: program.suggestedAmount,
    status: 'application_needed',
    updatedAt: now,
  };
  await repo.saveAssistanceRequest(req);
  await refreshPlan(repo, plan.patient.id, now);
  return req;
}

export async function updateAssistance(repo: Repository, session: Session, request: AssistanceRequest, status: AssistanceStatus, approvedAmount?: number) {
  if (session.profile.role !== 'coordinator') throw new Error('Only a coordinator can update assistance status');
  await repo.saveAssistanceRequest({ ...request, status, approvedAmount: status === 'approved' ? (approvedAmount ?? request.requestedAmount) : undefined, updatedAt: nowIso() });
  await refreshPlan(repo, request.patientId);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function transitionTask(
  repo: Repository,
  session: Session,
  task: RecoveryTask,
  event: TaskEventType,
  opts: { notes?: string; assignedCaregiverId?: string } = {},
): Promise<{ task: RecoveryTask; event: TaskEvent }> {
  const now = nowIso();
  const result = applyTransition(task, event, { id: session.profile.id, role: session.profile.role }, { ...opts, now });
  if (event === 'reassigned' && opts.assignedCaregiverId) {
    const cg = await repo.getCaregiver(opts.assignedCaregiverId);
    result.task.assignedRole = 'family_caregiver';
    result.task.assignedUserId = cg?.profileId;
  }
  await repo.saveTask(result.task);
  await repo.addTaskEvent(result.event);

  if (event === 'blocked' || event === 'missed' || event === 'escalated') {
    const coordinators = await repo.listCoordinators();
    const recipients = new Set<string>(coordinators.map((c) => c.id));
    const patient = await repo.getPatient(task.patientId);
    if (patient) recipients.add(patient.profileId);
    if (task.assignedUserId) recipients.add(task.assignedUserId);
    recipients.delete(session.profile.id);
    await repo.addNotifications([...recipients].map((r) => escalationNotification(result.task, r, now, event === 'missed' ? 'missed' : 'blocked')));
  }
  if (event === 'resolved' || event === 'resource_confirmed' || event === 'reassigned') await refreshAsSystem(repo, task.patientId);
  return result;
}

export const reportBarrier = (repo: Repository, session: Session, task: RecoveryTask, reason: string) =>
  transitionTask(repo, session, task, 'blocked', { notes: reason });

/** Housekeeping run on load: mark overdue tasks missed and emit reminders. */
export async function runHousekeeping(repo: Repository, session: Session, patientId: string, lastRun?: string, now = nowIso()) {
  const tasks = await repo.listTasks(patientId);
  const missed = markMissed(tasks, now);
  for (const m of missed) {
    await repo.saveTask(m.task);
    await repo.addTaskEvent(m.event);
  }
  const caregivers = await repo.listCaregivers(patientId);
  const patient = await repo.getPatient(patientId);
  const recipients = (t: RecoveryTask) => {
    const out = new Set<string>();
    if (patient) out.add(patient.profileId);
    if (t.assignedUserId) out.add(t.assignedUserId);
    else if (t.assignedCaregiverId) {
      const cg = caregivers.find((c) => c.id === t.assignedCaregiverId);
      if (cg?.profileId) out.add(cg.profileId);
    }
    return [...out];
  };
  const reminders = dueReminders(tasks, recipients, now, lastRun);
  if (reminders.length) await repo.addNotifications(reminders);
  if (missed.length) {
    const coordinators = await repo.listCoordinators();
    await repo.addNotifications(
      missed.flatMap((m) => [...new Set([...coordinators.map((c) => c.id), ...recipients(m.task)])].map((r) => escalationNotification(m.task, r, now, 'missed'))),
    );
  }
  return { missed: missed.length, reminders: reminders.length };
}

// ---------------------------------------------------------------------------
// Caregiver view (deliberately narrow: only what they are responsible for)
// ---------------------------------------------------------------------------

export interface CaregiverView {
  records: Caregiver[];
  patients: Patient[];
  tasks: RecoveryTask[];
  instructions: ClinicalInstruction[];
  availability: CaregiverAvailability[];
}

export async function getCaregiverView(repo: Repository, session: Session): Promise<CaregiverView> {
  const records = await repo.listCaregiversByProfile(session.profile.id);
  const active = records.filter((c) => c.acceptedInvitation && c.consentStatus === 'granted');
  const patients: Patient[] = [];
  const tasks: RecoveryTask[] = [];
  const instructions: ClinicalInstruction[] = [];
  for (const c of active) {
    const p = await repo.getPatient(c.patientId);
    if (p) patients.push(p);
    tasks.push(...(await repo.listTasksForCaregiver(c.id)));
    instructions.push(...(await repo.listInstructions(c.patientId)));
  }
  const availability = await repo.listAvailability(records.map((c) => c.id));
  tasks.sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));
  return { records, patients, tasks, instructions, availability };
}

// ---------------------------------------------------------------------------
// Caregiver invitation and availability
// ---------------------------------------------------------------------------

export async function acceptInvite(repo: Repository, session: Session, code: string) {
  if (session.profile.role !== 'caregiver') throw new Error('Only a caregiver account can accept an invitation');
  const cg = await repo.getCaregiverByInvite(code);
  if (!cg) throw new Error('Invitation code not found');
  const accepted: Caregiver = { ...cg, profileId: session.profile.id, acceptedInvitation: true, consentStatus: 'granted', proxyAccess: cg.proxyAccess ?? false };
  await repo.saveCaregiver(accepted);
  await refreshAsSystem(repo, cg.patientId);
  return accepted;
}

/**
 * Patient plan code: the patient shared it so this caregiver may enter their
 * assessment, instructions and resources. Consent is the code plus the toggle on the form.
 */
export async function acceptPatientAccess(
  repo: Repository, session: Session, code: string, extras?: { relationship?: string },
) {
  if (session.profile.role !== 'caregiver') throw new Error('Only a caregiver account can use a plan code');
  const patient = await repo.getPatientByAccessCode(code);
  if (!patient) throw new Error('Plan code not found');
  const existing = (await repo.listCaregiversByProfile(session.profile.id)).find((c) => c.patientId === patient.id);
  const cg: Caregiver = existing
    ? { ...existing, acceptedInvitation: true, consentStatus: 'granted', proxyAccess: true, relationship: extras?.relationship?.trim() || existing.relationship }
    : {
        id: newId('cg'),
        patientId: patient.id,
        profileId: session.profile.id,
        name: session.profile.displayName,
        relationship: extras?.relationship?.trim() || 'Caregiver',
        languages: [session.profile.preferredLanguage],
        capabilities: ['supervision', 'transport', 'meals', 'basic_tasks'],
        willingForAssigned: true,
        needsTranslatedInstructions: false,
        inviteCode: makeInviteCode(session.profile.displayName),
        acceptedInvitation: true,
        consentStatus: 'granted',
        proxyAccess: true,
        createdAt: nowIso(),
      };
  await repo.saveCaregiver(cg);
  await refreshAsSystem(repo, patient.id);
  return { caregiver: cg, patient };
}

/** One entry point for both plan codes (PLAN-…) and task invite codes. */
export async function redeemCode(repo: Repository, session: Session, code: string, extras?: { relationship?: string }) {
  const normalized = normalizeCode(code);
  if (isPlanCode(normalized) || (await repo.getPatientByAccessCode(normalized))) {
    return { kind: 'plan' as const, ...(await acceptPatientAccess(repo, session, normalized, extras)) };
  }
  const caregiver = await acceptInvite(repo, session, normalized);
  return { kind: 'invite' as const, caregiver, patient: await repo.getPatient(caregiver.patientId) };
}

/** Caregivers can't read the whole plan, so their actions re-run it with a system-scoped view. */
async function refreshAsSystem(repo: Repository, patientId: string) {
  try {
    await refreshPlan(repo.elevate(), patientId);
  } catch {
    // Supabase client mode: RLS blocks the caregiver; the server or the next patient/coordinator load refreshes.
  }
}

export async function setAvailability(repo: Repository, caregiver: Caregiver, blocks: { startAt: string; endAt: string }[], confirmed: boolean) {
  await repo.replaceAvailability(
    caregiver.id,
    blocks.map((b, i) => ({ id: `av_${caregiver.id}_${i}_${Date.parse(b.startAt).toString(36)}`, caregiverId: caregiver.id, startAt: b.startAt, endAt: b.endAt, confirmed })),
  );
  await refreshAsSystem(repo, caregiver.patientId);
}

export async function addCaregiver(repo: Repository, patientId: string, input: Omit<Caregiver, 'id' | 'patientId' | 'inviteCode' | 'acceptedInvitation' | 'consentStatus' | 'createdAt' | 'proxyAccess'>, blocks: { startAt: string; endAt: string }[]) {
  const cg: Caregiver = {
    ...input,
    id: newId('cg'),
    patientId,
    inviteCode: makeInviteCode(input.name),
    acceptedInvitation: false,
    consentStatus: 'pending',
    proxyAccess: false,
    createdAt: nowIso(),
  };
  await repo.saveCaregiver(cg);
  await setAvailability(repo, cg, blocks, false);
  return cg;
}
