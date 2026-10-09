import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtTime } from '@/core/time';
import type { Language, Patient, RecoveryTask, Session } from '@/core/types';
import { tTitle } from '@/i18n';
import { previewReminder, reminderPermission, remindersSupported, requestReminderPermission, syncReminders, type ReminderStatus, type ReminderText } from './device';
import { planReminders, type PlannedReminder } from './plan';

interface State {
  status: ReminderStatus;
  scheduled: number;
}

let state: State = { status: remindersSupported ? 'undetermined' : 'unsupported', scheduled: 0 };
const subs = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  subs.forEach((s) => s());
};
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};

type Patients = Pick<Patient, 'id' | 'displayName' | 'timezone'>[];

function useReminderText(patients: Patients) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'es' ? 'es' : 'en') as Language;
  return useCallback(
    (r: PlannedReminder): ReminderText => {
      const p = patients.find((x) => x.id === r.patientId);
      // Title params carry the dose verbatim, so the reminder can never restate it differently.
      const task = tTitle(r.task.titleKey, r.task.titleParams, lang);
      const tz = p?.timezone ?? 'UTC';
      return r.kind === 'due'
        ? { title: t('reminders.dueTitle', { task }), body: t('reminders.dueBody', { time: fmtTime(r.task.scheduledAt, tz, lang) }) }
        : { title: t('reminders.checkTitle', { name: p?.displayName.split(' ')[0] ?? '' }), body: t('reminders.checkBody', { task, time: fmtTime(r.task.dueAt, tz, lang) }) };
    },
    [patients, t, lang],
  );
}

/**
 * Keeps this phone's scheduled reminders equal to the open tasks the signed-in
 * patient or caregiver can act on. Runs whenever the task list changes, so a
 * task reported done (by anyone) drops its pending reminder on the next load.
 */
export function useReminderSync(tasks: RecoveryTask[] | undefined, patients: Patients, session: Session | null) {
  const { t } = useTranslation();
  const text = useReminderText(patients);
  const role = session?.profile.role;
  const profileId = session?.profile.id;
  const fingerprint = useMemo(() => (tasks ?? []).map((x) => `${x.id}:${x.status}:${x.scheduledAt}:${x.assignedUserId ?? ''}`).join('|'), [tasks]);
  const latest = useRef({ tasks, text });
  useEffect(() => {
    latest.current = { tasks, text };
  });

  useEffect(() => {
    if (!remindersSupported || !latest.current.tasks || !profileId || (role !== 'patient' && role !== 'caregiver')) return;
    let alive = true;
    void (async () => {
      const status = await requestReminderPermission();
      const planned = planReminders(latest.current.tasks ?? [], { role, profileId }, Date.now());
      const scheduled = status === 'granted' ? await syncReminders(planned, latest.current.text, t('reminders.done')) : 0;
      if (alive) set({ status, scheduled });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fingerprint, role, profileId, t]);
}

/** Permission state, count of pending reminders, and a "send one now" preview for the reminders card. */
export function useReminderControls(tasks: RecoveryTask[], patients: Patients) {
  const { t } = useTranslation();
  const text = useReminderText(patients);
  const snap = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (remindersSupported) void reminderPermission().then((status) => set({ status }));
  }, []);

  const next = useMemo(() => tasks.filter((x) => x.status === 'scheduled' || x.status === 'assigned' || x.status === 'in_progress').sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0], [tasks]);

  return {
    ...snap,
    supported: remindersSupported,
    canPreview: !!next && snap.status === 'granted',
    enable: async () => set({ status: await requestReminderPermission() }),
    preview: async () => {
      if (!next) return;
      const r: PlannedReminder = { id: `preview:${next.id}`, taskId: next.id, patientId: next.patientId, kind: 'due', fireAt: Date.now(), task: next };
      await previewReminder(r, text(r), t('reminders.done'));
    },
  };
}
