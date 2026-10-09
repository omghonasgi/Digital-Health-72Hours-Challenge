import { describe, expect, it } from 'vitest';
import { DEMO_IDS } from '@/data/local/seed';
import { getCaregiverView, getPlan, refreshPlan, startLiveDemo, transitionTask } from '@/core/usecases';
import { asJordan, asMaria, asSofia, demoStore, FIXED_NOW } from '@/core/__tests__/helpers';
import { MAX_SCHEDULED, planReminders } from '../plan';

const NOW = FIXED_NOW.toISOString();
const nowMs = FIXED_NOW.getTime();

async function seeded() {
  const store = demoStore();
  const maria = asMaria(store);
  await refreshPlan(maria.repo, DEMO_IDS.maria, NOW);
  return { store, maria, sofia: asSofia(store), jordan: asJordan(store) };
}

describe('Device reminders', () => {
  it('schedules the patient a reminder at the exact scheduled instant of each open task', async () => {
    const { maria } = await seeded();
    const tasks = await maria.repo.listTasks(DEMO_IDS.maria);
    const planned = planReminders(tasks, { role: 'patient', profileId: DEMO_IDS.mariaProfile }, nowMs);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.length).toBeLessThanOrEqual(MAX_SCHEDULED);
    for (const r of planned) {
      expect(r.kind).toBe('due');
      expect(r.fireAt).toBe(Date.parse(r.task.scheduledAt));
      expect(r.fireAt).toBeGreaterThan(nowMs);
    }
    const med = planned.find((r) => r.task.category === 'medication');
    expect(med).toBeDefined();
  });

  it('gives the caregiver their own tasks on time and an overdue check-in for the patient’s tasks', async () => {
    const { sofia } = await seeded();
    const view = await getCaregiverView(sofia.repo, sofia.session);
    const planned = planReminders(view.tasks, { role: 'caregiver', profileId: DEMO_IDS.sofiaProfile }, nowMs);
    const own = planned.filter((r) => r.kind === 'due');
    const checks = planned.filter((r) => r.kind === 'check_in');
    expect(checks.length).toBeGreaterThan(0);
    expect(own.every((r) => r.task.assignedUserId === DEMO_IDS.sofiaProfile)).toBe(true);
    expect(checks.every((r) => r.task.assignedUserId !== DEMO_IDS.sofiaProfile && r.fireAt === Date.parse(r.task.dueAt))).toBe(true);
  });

  it('drops the reminder once the task is reported done, and the coordinator sees who reported it', async () => {
    const { maria, sofia, jordan } = await seeded();
    const tasks = await maria.repo.listTasks(DEMO_IDS.maria);
    const [first, second] = tasks.filter((t) => t.status === 'scheduled' && t.assignedRole === 'patient');
    expect(second).toBeDefined();

    await transitionTask(maria.repo, maria.session, first, 'reported_complete');
    // The caregiver steps in for a task that was the patient's own.
    await transitionTask(sofia.repo, sofia.session, second, 'reported_complete');

    const after = await maria.repo.listTasks(DEMO_IDS.maria);
    const planned = planReminders(after, { role: 'patient', profileId: DEMO_IDS.mariaProfile }, nowMs);
    expect(planned.some((r) => r.taskId === first.id || r.taskId === second.id)).toBe(false);

    const plan = await getPlan(jordan.repo, DEMO_IDS.maria, NOW);
    expect(plan.tasks.find((t) => t.id === first.id)?.status).toBe('patient_reported_complete');
    expect(plan.tasks.find((t) => t.id === second.id)?.status).toBe('caregiver_reported_complete');
    const inbox = await jordan.repo.listNotifications(DEMO_IDS.jordanProfile);
    expect(inbox.some((n) => n.taskId === first.id && n.messageKey === 'notifications.doneByPatient')).toBe(true);
    expect(inbox.some((n) => n.taskId === second.id && n.messageKey === 'notifications.doneByCaregiver')).toBe(true);
    const events = await jordan.repo.listTaskEvents(second.id);
    expect(events.at(-1)).toMatchObject({ actorId: DEMO_IDS.sofiaProfile, actorRole: 'caregiver', toStatus: 'caregiver_reported_complete' });
  });
});

describe('Live demo', () => {
  it('moves the window so the first reminder is one minute away without changing any interval', async () => {
    const { maria } = await seeded();
    const before = await maria.repo.listTasks(DEMO_IDS.maria);
    const now = Date.parse('2026-10-09T18:00:00.000Z'); // 13:00 in Chicago
    const next = await startLiveDemo(maria.repo, DEMO_IDS.maria, 60_000, now);
    expect(next).not.toBeNull();
    expect(Date.parse(next!.scheduledAt) - now).toBe(60_000);

    const after = await maria.repo.listTasks(DEMO_IDS.maria);
    const planned = planReminders(after, { role: 'patient', profileId: DEMO_IDS.mariaProfile }, now);
    expect(planned[0].fireAt - now).toBe(60_000);
    // Same medication spacing as the approved instruction.
    const gaps = (list: typeof after) => {
      const meds = list.filter((t) => t.titleKey === 'tasks.medication_dose').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      return meds.slice(1, 4).map((t, i) => Date.parse(t.scheduledAt) - Date.parse(meds[i].scheduledAt));
    };
    expect(gaps(after)).toEqual(gaps(before));
  });
});
