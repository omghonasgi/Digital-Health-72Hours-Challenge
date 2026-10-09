import { getPlan, refreshPlan } from '@/core/usecases';
import { LocalRepository, MemoryStorage } from './LocalRepository';
import { DEMO_IDS } from './seed';
import type { Store } from './store';

/**
 * Runs the deterministic plan once for every seeded patient so a fresh demo
 * opens with gaps, a calendar, costs and a bill instead of empty screens.
 * Kept out of buildDemoStore so tests still start from the raw seed.
 */
export async function primeDemoStore(store: Store, now = new Date().toISOString()) {
  const coordinator = store.profiles.find((p) => p.role === 'coordinator');
  if (!coordinator) return;
  const repo = new LocalRepository(store, { profile: coordinator }, new MemoryStorage(), true);
  for (const p of store.patients) await refreshPlan(repo, p.id, now);

  // One approved benefit so "who pays" shows a program from the first screen:
  // Maria has Medicaid, so non-emergency medical transportation covers her ride home.
  const plan = await getPlan(repo, DEMO_IDS.maria, now);
  const ride = plan.finance.lines.find((l) => l.kind === 'transportation');
  if (ride && !store.assistanceRequests.some((a) => a.patientId === DEMO_IDS.maria && a.programId === 'prog_3')) {
    await repo.saveAssistanceRequest({
      id: 'ar_maria_nemt',
      patientId: DEMO_IDS.maria,
      programId: 'prog_3',
      requirementId: ride.requirementId,
      requestedAmount: ride.estimatedCost,
      approvedAmount: ride.estimatedCost,
      status: 'approved',
      updatedAt: now,
    });
    await refreshPlan(repo, DEMO_IDS.maria, now);
  }
}
