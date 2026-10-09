import { describe, expect, it } from 'vitest';
import { LocalAuth } from '@/data/local/LocalAuth';
import { primeDemoStore } from '@/data/local/prime';
import { settleBill } from '../engines/payments';
import { getPlan, publishBill } from '../usecases';
import type { Role } from '../types';
import { demoStore, FIXED_NOW, repoFor } from './helpers';

const NOW = FIXED_NOW.toISOString();

async function signUp(role: Role) {
  const store = demoStore();
  await primeDemoStore(store, NOW);
  const auth = new LocalAuth(store, async () => undefined);
  const s = await auth.signUp({ email: `${role}@new.example`, password: 'demo', displayName: 'New Person', role, preferredLanguage: 'en' });
  return { store, ...repoFor(store, s.profile.id) };
}

describe('New accounts start empty: no sample plan, costs or payments', () => {
  it('a new patient has no tasks, no costs and a $0 bill', async () => {
    const { repo, session } = await signUp('patient');
    const plan = await getPlan(repo, session.patientId!, NOW);
    expect(plan.patient.intakeCompletedAt).toBeUndefined();
    expect(plan.tasks).toHaveLength(0);
    expect(plan.finance.lines).toHaveLength(0);
    expect(plan.finance.totalEstimatedCost).toBe(0);
    expect(plan.assistanceRequests).toHaveLength(0);
    await publishBill(repo, session.patientId!, NOW);
    const s = settleBill(await repo.getBill(session.patientId!), await repo.listPayments(session.patientId!));
    expect(s).toMatchObject({ total: 0, balance: 0, insuranceCover: 0, programsCover: 0, familyPaid: 0 });
  });

  it('a new coordinator sees no seeded patients', async () => {
    const { repo } = await signUp('coordinator');
    expect(await repo.listPatients()).toHaveLength(0);
  });

  it('a new caregiver is linked to nobody until they enter a code', async () => {
    const { repo } = await signUp('caregiver');
    expect(await repo.listPatients()).toHaveLength(0);
  });
});
