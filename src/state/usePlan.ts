import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getCaregiverView, getPlan, runHousekeeping, type CaregiverView, type PlanView } from '@/core/usecases';
import { useSession } from './SessionProvider';

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

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
