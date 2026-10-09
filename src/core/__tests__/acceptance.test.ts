import { describe, expect, it } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';
import { DEMO_IDS, DEMO_TZ } from '@/data/local/seed';
import { AccessDenied } from '@/data/repository';
import { detectGaps } from '../engines/gaps';
import { generateCalendar } from '../engines/calendar';
import { matchProviders } from '../engines/matching';
import { computeFinancials } from '../engines/finance';
import { applyTransition, TransitionError } from '../engines/tasks';
import { detectConflicts } from '../engines/conflicts';
import { getPlan, refreshPlan, requestService, matchProvidersFor, reportBarrier, transitionTask, confirmResource, acceptInvite } from '../usecases';
import { tTitle } from '@/i18n';
import { asJordan, asMaria, asSofia, asJames, demoStore, FIXED_NOW } from './helpers';
import type { AssistanceRequest, Caregiver } from '../types';

const NOW = FIXED_NOW.toISOString();

function inputsFor(store: ReturnType<typeof demoStore>, patientId: string) {
  const patient = store.patients.find((p) => p.id === patientId)!;
  const caregivers = store.caregivers.filter((c) => c.patientId === patientId);
  return {
    patient,
    equipment: store.equipment.filter((e) => e.patientId === patientId),
    caregivers,
    availability: store.availability.filter((a) => caregivers.some((c) => c.id === a.caregiverId)),
    instructions: store.instructions.filter((i) => i.patientId === patientId),
    serviceRequests: store.serviceRequests.filter((r) => r.patientId === patientId),
    assistanceRequests: store.assistanceRequests.filter((r) => r.patientId === patientId),
    now: NOW,
  };
}

describe('1–2. Equipment gaps', () => {
  it('does not raise a missing-equipment alert when the patient already owns the item', () => {
    const store = demoStore();
    const r = detectGaps(inputsFor(store, DEMO_IDS.james)); // James owns a walker
    expect(r.gaps.filter((g) => g.gapType === 'equipment' && g.status !== 'verified_resolved')).toHaveLength(0);
    expect(r.requirements.find((q) => q.id === 'req_eq_walker')?.status).toBe('met');
  });

  it('raises an equipment gap when a required item is missing', () => {
    const store = demoStore();
    const r = detectGaps(inputsFor(store, DEMO_IDS.maria)); // Maria needs a walker
    const gap = r.gaps.find((g) => g.gapType === 'equipment' && g.descriptionParams?.item === 'walker');
    expect(gap).toBeDefined();
    expect(gap!.status).toBe('identified');
    expect(gap!.actions.length).toBeGreaterThan(0); // never a dead end
  });
});

describe('3–4. Caregiver coverage', () => {
  it('produces a coverage conflict when the caregiver is unavailable during the required window', () => {
    const store = demoStore();
    const r = detectGaps(inputsFor(store, DEMO_IDS.maria));
    const coverageGaps = r.gaps.filter((g) => g.gapType === 'caregiving' && g.descriptionKey === 'gaps.coverage_missing');
    expect(coverageGaps.length).toBe(2); // Fri 14:30–18:00 and Sat 08:00–14:30
    expect(r.coverage.uncoveredHours).toBeCloseTo(10, 1);
    const cal = generateCalendar({ ...inputsFor(store, DEMO_IDS.maria), gaps: r.gaps });
    const conflicts = detectConflicts({ tasks: cal.tasks, gaps: r.gaps, serviceRequests: [], dischargeAt: store.patients[0].dischargeAt });
    expect(conflicts.some((c) => c.type === 'caregiver_unavailable')).toBe(true);
  });

  it('does not count a caregiver who has not accepted as confirmed coverage', () => {
    const store = demoStore();
    const inp = inputsFor(store, DEMO_IDS.maria);
    const unaccepted: Caregiver = { ...inp.caregivers[0], acceptedInvitation: false, consentStatus: 'pending' };
    const r = detectGaps({ ...inp, caregivers: [unaccepted] });
    expect(r.coverage.coveredHours).toBe(0);
    expect(r.coverage.uncoveredHours).toBeCloseTo(24, 1);
    // Hours she *would* cover are pending, not confirmed.
    expect(r.gaps.some((g) => g.gapType === 'caregiving' && g.status === 'awaiting_confirmation')).toBe(true);
  });
});

describe('5–6. Provider matching constraints', () => {
  const windowFor = (store: ReturnType<typeof demoStore>) => {
    const r = detectGaps(inputsFor(store, DEMO_IDS.maria));
    return r.coverage.uncoveredIntervals;
  };

  it('never recommends a provider that lacks the required qualification', () => {
    const store = demoStore();
    const matches = matchProviders({
      patient: store.patients[0],
      providers: store.providers,
      availability: store.providerAvailability,
      requiredWindows: windowFor(store),
      requiredServices: ['supervision'],
      budgetRemaining: 100,
    });
    const ids = matches.map((m) => m.provider.id);
    expect(ids).not.toContain('prov_a5'); // transport only
    expect(ids).not.toContain('prov_a6'); // meals only
    expect(ids).not.toContain('prov_b3'); // unverified
    expect(matches.every((m) => m.provider.services.includes('supervision'))).toBe(true);
  });

  it('never matches a provider outside the service area', () => {
    const store = demoStore();
    const matches = matchProviders({
      patient: store.patients[0], // ZIP 60623
      providers: store.providers,
      availability: store.providerAvailability,
      requiredWindows: windowFor(store),
      requiredServices: ['supervision'],
      budgetRemaining: 100,
    });
    expect(matches.map((m) => m.provider.id)).not.toContain('prov_a4'); // north suburbs only
    expect(matches.every((m) => m.provider.serviceAreaZipPrefixes.includes('606'))).toBe(true);
    // Ranking exposes reasons, never a percentage.
    expect(matches[0].reasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(matches[0])).not.toMatch(/percent|score/i);
  });
});

describe('7. Financial assistance', () => {
  it('does not let unapproved assistance reduce the confirmed funding gap', () => {
    const store = demoStore();
    const inp = inputsFor(store, DEMO_IDS.maria);
    const r = detectGaps(inp);
    const base = computeFinancials({ ...inp, requirements: r.requirements, gaps: r.gaps });
    const pending: AssistanceRequest = {
      id: 'ar_1',
      patientId: inp.patient.id,
      programId: 'prog_2',
      requirementId: r.gaps.find((g) => g.gapType === 'caregiving')!.requirementId,
      requestedAmount: 300,
      status: 'under_review',
      updatedAt: NOW,
    };
    const withPending = computeFinancials({ ...inp, requirements: r.requirements, gaps: r.gaps, assistanceRequests: [pending] });
    expect(withPending.remainingGap).toBe(base.remainingGap);
    expect(withPending.potentialAssistance).toBe(300);
    expect(withPending.confirmedAssistance).toBe(0);

    const approved = computeFinancials({ ...inp, requirements: r.requirements, gaps: r.gaps, assistanceRequests: [{ ...pending, status: 'approved', approvedAmount: 100 }] });
    expect(approved.confirmedAssistance).toBe(100);
    expect(approved.remainingGap).toBe(Math.max(0, base.remainingGap - 100));
  });
});

describe('8–9. Clinical safety', () => {
  it('does not create active calendar tasks from unreviewed instructions', () => {
    const store = demoStore();
    const inp = inputsFor(store, DEMO_IDS.maria);
    const r = detectGaps(inp);
    const cal = generateCalendar({ ...inp, gaps: r.gaps });
    const draftIds = new Set(inp.instructions.filter((i) => i.reviewStatus !== 'approved').map((i) => i.id));
    expect(draftIds.size).toBeGreaterThan(0);
    expect(cal.tasks.some((t) => draftIds.has(t.instructionId))).toBe(false);
    // Drafts surface as review-required requirements instead.
    expect(r.requirements.some((q) => q.status === 'review_required')).toBe(true);
    expect(r.status).toBe('clinical_review_required');
  });

  it('flags ambiguous medication timing for review instead of guessing a schedule', () => {
    const store = demoStore();
    const inp = inputsFor(store, DEMO_IDS.maria);
    const antibiotic = inp.instructions.find((i) => i.id.endsWith('_antibiotic'))!;
    const approvedAnyway = inp.instructions.map((i) => (i.id === antibiotic.id ? { ...i, reviewStatus: 'approved' as const } : i));
    const r = detectGaps({ ...inp, instructions: approvedAnyway });
    const cal = generateCalendar({ ...inp, instructions: approvedAnyway, gaps: r.gaps });
    expect(cal.tasks.filter((t) => t.instructionId === antibiotic.id)).toHaveLength(0);
    expect(cal.reviewItems).toContainEqual({ instructionId: antibiotic.id, reasonKey: 'review.medication_timing' });
    expect(r.gaps.some((g) => g.gapType === 'scheduling' && g.requirementId === `req_${antibiotic.id}_timing`)).toBe(true);
  });
});

describe('10. Blocked tasks', () => {
  it('keeps a blocked task unresolved until a coordinator documents the resolution', async () => {
    const store = demoStore();
    const maria = asMaria(store);
    await refreshPlan(maria.repo, DEMO_IDS.maria, NOW);
    const task = (await maria.repo.listTasks(DEMO_IDS.maria)).find((t) => t.status === 'scheduled')!;
    const blocked = await reportBarrier(maria.repo, maria.session, task, 'Pharmacy was closed');
    expect(blocked.task.status).toBe('blocked');
    expect(blocked.task.blockedReason).toBe('Pharmacy was closed');

    // Patient cannot un-block it, and nobody can resolve without notes.
    await expect(transitionTask(maria.repo, maria.session, blocked.task, 'resolved', { notes: 'x' })).rejects.toBeInstanceOf(TransitionError);
    const jordan = asJordan(store);
    expect(() => applyTransition(blocked.task, 'resolved', { id: 'prof_jordan', role: 'coordinator' })).toThrow(TransitionError);

    const after = await transitionTask(jordan.repo, jordan.session, blocked.task, 'resolved', { notes: 'Called in to a 24h pharmacy; picked up 21:10' });
    expect(after.task.status).toBe('scheduled');
    const history = await jordan.repo.listTaskEvents(task.id);
    expect(history.map((e) => e.eventType)).toEqual(expect.arrayContaining(['created', 'blocked', 'resolved']));
    // Coordinator was notified of the block.
    expect((await jordan.repo.listNotifications(DEMO_IDS.jordanProfile)).some((n) => n.taskId === task.id)).toBe(true);
  });
});

describe('11. Language switching', () => {
  it('does not alter medication amounts or task timing', () => {
    const store = demoStore();
    const inp = inputsFor(store, DEMO_IDS.maria);
    const cal = generateCalendar({ ...inp, gaps: detectGaps(inp).gaps });
    const dose = cal.tasks.find((t) => t.titleKey === 'tasks.medication_dose')!;
    const en = tTitle(dose.titleKey, dose.titleParams, 'en');
    const es = tTitle(dose.titleKey, dose.titleParams, 'es');
    expect(en).toContain('1000 mg');
    expect(es).toContain('1000 mg');
    expect(en).toContain('Acetaminophen');
    expect(es).toContain('Acetaminophen'); // clinical name is never translated
    // Timing lives on the task, independent of language.
    const again = generateCalendar({ ...inp, gaps: detectGaps(inp).gaps });
    expect(again.tasks.map((t) => t.scheduledAt)).toEqual(cal.tasks.map((t) => t.scheduledAt));
    const prn = cal.tasks.find((t) => t.titleKey === 'tasks.medication_prn')!;
    expect(tTitle(prn.titleKey, prn.titleParams, 'es')).toContain('5 mg');
  });
});

describe('12–13. Authorization', () => {
  it('prevents a patient from reading another patient’s records', async () => {
    const store = demoStore();
    const james = asJames(store);
    await expect(james.repo.getPatient(DEMO_IDS.maria)).rejects.toBeInstanceOf(AccessDenied);
    await expect(james.repo.listTasks(DEMO_IDS.maria)).rejects.toBeInstanceOf(AccessDenied);
    await expect(james.repo.listGaps(DEMO_IDS.maria)).rejects.toBeInstanceOf(AccessDenied);
    expect((await james.repo.listPatients()).map((p) => p.id)).toEqual([DEMO_IDS.james]);
  });

  it('limits a caregiver to tasks assigned to them and the instructions behind those tasks', async () => {
    const store = demoStore();
    const maria = asMaria(store);
    await refreshPlan(maria.repo, DEMO_IDS.maria, NOW);
    const sofia = asSofia(store);
    const tasks = await sofia.repo.listTasks(DEMO_IDS.maria);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.assignedCaregiverId === DEMO_IDS.sofia)).toBe(true);
    const all = await maria.repo.listTasks(DEMO_IDS.maria);
    expect(all.length).toBeGreaterThan(tasks.length);

    const instructions = await sofia.repo.listInstructions(DEMO_IDS.maria);
    const allowed = new Set(tasks.map((t) => t.instructionId));
    expect(instructions.every((i) => allowed.has(i.id) || i.category === 'warning_signs')).toBe(true);
    expect(instructions.some((i) => i.reviewStatus !== 'approved')).toBe(false);

    // No finances, gaps or provider directory for caregivers.
    const patient = await sofia.repo.getPatient(DEMO_IDS.maria);
    expect(patient?.recoveryBudget).toBe(0);
    expect(patient?.incomeRange).toBe('prefer_not_to_say');
    await expect(sofia.repo.listGaps(DEMO_IDS.maria)).rejects.toBeInstanceOf(AccessDenied);
    await expect(sofia.repo.listProviders()).rejects.toBeInstanceOf(AccessDenied);
    await expect(sofia.repo.getTask(all.find((t) => t.assignedCaregiverId !== DEMO_IDS.sofia)!.id)).rejects.toBeInstanceOf(AccessDenied);
    // Unrelated patient: nothing.
    await expect(sofia.repo.listTasks(DEMO_IDS.james)).rejects.toBeInstanceOf(AccessDenied);
  });

  it('gives a caregiver nothing until they accept and consent', async () => {
    const store = demoStore();
    store.caregivers.find((c) => c.id === DEMO_IDS.sofia)!.acceptedInvitation = false;
    store.caregivers.find((c) => c.id === DEMO_IDS.sofia)!.consentStatus = 'pending';
    const sofia = asSofia(store);
    await expect(sofia.repo.listTasks(DEMO_IDS.maria)).rejects.toBeInstanceOf(AccessDenied);
    const accepted = await acceptInvite(sofia.repo, sofia.session, 'sofia-2026');
    expect(accepted.consentStatus).toBe('granted');
    expect((await sofia.repo.listTasks(DEMO_IDS.maria)).length).toBeGreaterThan(0);
  });
});

describe('14. Calendar anchoring', () => {
  it('starts the 72-hour calendar at the actual discharge time, not midnight', () => {
    const store = demoStore();
    const inp = inputsFor(store, DEMO_IDS.maria);
    const cal = generateCalendar({ ...inp, gaps: detectGaps(inp).gaps });
    const first = cal.tasks[0];
    expect(first.scheduledAt).toBe(inp.patient.dischargeAt);
    expect(formatInTimeZone(new Date(inp.patient.dischargeAt), DEMO_TZ, 'HH:mm')).toBe('14:30');
    const last = Math.max(...cal.tasks.map((t) => Date.parse(t.dueAt)));
    expect(last).toBeLessThanOrEqual(Date.parse(inp.patient.dischargeAt) + 72 * 3600_000 + 2 * 3600_000);
    // Acetaminophen: first dose 18:00 local on the day of surgery, then every 6h.
    const doses = cal.tasks.filter((t) => t.titleKey === 'tasks.medication_dose');
    expect(formatInTimeZone(new Date(doses[0].scheduledAt), DEMO_TZ, 'HH:mm')).toBe('18:00');
    expect(Date.parse(doses[1].scheduledAt) - Date.parse(doses[0].scheduledAt)).toBe(6 * 3600_000);
  });
});

describe('15. Service requests', () => {
  it('does not show a simulated request as a confirmed booking until the provider confirms', async () => {
    const store = demoStore();
    const maria = asMaria(store);
    await refreshPlan(maria.repo, DEMO_IDS.maria, NOW);
    let plan = await getPlan(maria.repo, DEMO_IDS.maria, NOW);
    const gap = plan.gaps.find((g) => g.gapType === 'caregiving' && g.descriptionKey === 'gaps.coverage_missing')!;
    const matches = await matchProvidersFor(maria.repo, plan, gap);
    expect(matches.length).toBeGreaterThan(0);
    const req = await requestService(maria.repo, maria.session, plan, matches[0], gap);
    expect(req.status).toBe('requested');

    plan = await getPlan(maria.repo, DEMO_IDS.maria, NOW);
    const updated = plan.gaps.find((g) => g.id === gap.id)!;
    expect(updated.status).toBe('awaiting_confirmation');
    expect(updated.status).not.toBe('verified_resolved');
    // The uncovered hours are still uncovered in the coverage math.
    expect(plan.coverage.uncoveredHours).toBeCloseTo(10, 1);
    expect(plan.conflicts.some((c) => c.type === 'service_unconfirmed')).toBe(true);
    // Open shift still awaits a responsible person.
    expect(plan.tasks.some((t) => t.titleKey === 'tasks.supervision_open' && t.status === 'awaiting_resources')).toBe(true);
  });

  it('confirming a resource updates gaps and calendar in place', async () => {
    const store = demoStore();
    const maria = asMaria(store);
    await refreshPlan(maria.repo, DEMO_IDS.maria, NOW);
    let plan = await getPlan(maria.repo, DEMO_IDS.maria, NOW);
    const walkerGap = plan.gaps.find((g) => g.gapType === 'equipment' && g.descriptionParams?.item === 'walker')!;
    expect(plan.tasks.filter((t) => t.requiredResources.includes('walker')).every((t) => t.status === 'awaiting_resources')).toBe(true);
    await confirmResource(maria.repo, maria.session, walkerGap);
    plan = await getPlan(maria.repo, DEMO_IDS.maria, NOW);
    expect(plan.gaps.find((g) => g.id === walkerGap.id)?.status).toBe('verified_resolved');
    expect(plan.tasks.filter((t) => t.requiredResources.includes('walker')).every((t) => t.status === 'scheduled')).toBe(true);
  });
});
