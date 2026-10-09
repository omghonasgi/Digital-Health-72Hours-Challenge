import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { RecoveryTask } from '@/core/types';
import { getCaregiverView, getPlan, runHousekeeping, transitionTask, type CaregiverView, type PlanView } from '@/core/usecases';
import { planChanged } from '@/notifications/events';
import { useReminderSync } from '@/notifications/useReminders';
import { useSession } from './SessionProvider';

const NO_PATIENTS: CaregiverView['patients'] = [];

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Loads the full plan for a patient and re-runs housekeeping (missed tasks, reminders) each time. */
export function usePlan(patientId: string | undefined) {
  const { repo, session } = useSession();
  const [state, setState] = useState<AsyncState<PlanView>>({ data: null, loading: !!patientId, error: null });
  const lastRun = useRef<string | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!patientId || !session) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: !s.data, error: null }));
    try {
      const now = new Date().toISOString();
      if (session.profile.role !== 'caregiver') await runHousekeeping(repo, session, patientId, lastRun.current, now);
      lastRun.current = now;
      const plan = await getPlan(repo, patientId, now);
      setState({ data: plan, loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [patientId, repo, session]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => planChanged.subscribe(() => void reload()), [reload]);
  const patients = useMemo(() => (state.data ? [state.data.patient] : []), [state.data]);
  // Coordinators load plans too; only the patient's own phone gets the patient's reminders.
  useReminderSync(session?.profile.role === 'patient' ? state.data?.tasks : undefined, patients, session);

  return { plan: state.data, loading: state.loading, error: state.error, reload };
}

export function useCaregiverView() {
  const { repo, session } = useSession();
  const [state, setState] = useState<AsyncState<CaregiverView>>({ data: null, loading: true, error: null });
  const reload = useCallback(async () => {
    if (!session) return;
    try {
      setState((s) => ({ ...s, loading: !s.data, error: null }));
      setState({ data: await getCaregiverView(repo, session), loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [repo, session]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useEffect(() => planChanged.subscribe(() => void reload()), [reload]);
  useReminderSync(state.data?.tasks, state.data?.patients ?? NO_PATIENTS, session);
  return { view: state.data, loading: state.loading, error: state.error, reload };
}

/** Runs an async action, exposing busy/error for buttons. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

/** One-tap "Done": the same self-report the task screen makes, then a reload. */
export function useQuickDone(reload: () => Promise<void> | void) {
  const { repo, session } = useSession();
  const { busy, error, run } = useAction();
  const done = useCallback(
    (task: RecoveryTask) =>
      void run(async () => {
        if (!session) return;
        await transitionTask(repo, session, task, 'reported_complete');
        await reload();
      }),
    [repo, session, run, reload],
  );
  return { done, busy, error };
}

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
