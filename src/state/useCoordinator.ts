import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getPlan, runHousekeeping, type PlanView } from '@/core/usecases';
import { useSession } from './SessionProvider';

export interface PatientSummary {
  plan: PlanView;
  awaitingReview: number;
  openGaps: number;
  conflicts: number;
  pendingRequests: number;
  missedBlocked: number;
  financialGap: number;
  /** Earliest open gap deadline (ms) or undefined. */
  nextDeadline?: number;
}

/** Every patient in the coordinator's organization with the counts the queue filters on. */
export function useCoordinatorPatients() {
  const { repo, session } = useSession();
  const [state, setState] = useState<{ data: PatientSummary[] | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    if (!session) return;
    try {
      setState((s) => ({ ...s, loading: !s.data, error: null }));
      const patients = await repo.listPatients();
      const now = new Date().toISOString();
      const summaries: PatientSummary[] = [];
      for (const p of patients) {
        await runHousekeeping(repo, session, p.id, undefined, now);
        const plan = await getPlan(repo, p.id, now);
        const open = plan.gaps.filter((g) => g.status !== 'verified_resolved');
        const deadlines = open.map((g) => (g.windowStart ? Date.parse(g.windowStart) : Date.parse(plan.patient.dischargeAt)));
        summaries.push({
          plan,
          awaitingReview: plan.instructions.filter((i) => i.reviewStatus === 'draft').length,
          openGaps: open.length,
          conflicts: plan.conflicts.length,
          pendingRequests: plan.serviceRequests.filter((r) => r.status === 'requested').length + plan.assistanceRequests.filter((r) => r.status === 'application_needed' || r.status === 'under_review').length,
          missedBlocked: plan.tasks.filter((t) => t.status === 'missed' || t.status === 'blocked' || t.status === 'escalated').length,
          financialGap: plan.finance.remainingGap,
          nextDeadline: deadlines.length ? Math.min(...deadlines) : undefined,
        });
      }
      summaries.sort((a, b) => Date.parse(a.plan.patient.surgeryDate) - Date.parse(b.plan.patient.surgeryDate));
      setState({ data: summaries, loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [repo, session]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { patients: state.data, loading: state.loading, error: state.error, reload };
}
