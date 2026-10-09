import { describe, expect, it } from 'vitest';
import { DEMO_IDS } from '@/data/local/seed';
import { primeDemoStore } from '@/data/local/prime';
import { AccessDenied } from '@/data/repository';
import { settleBill, validateCard } from '../engines/payments';
import { payFamilyShare, publishBill } from '../usecases';
import { asJames, asJordan, asMaria, asSofia, demoStore, FIXED_NOW } from './helpers';

const NOW = FIXED_NOW.toISOString();
const card = { method: 'card' as const, cardBrand: 'Visa', last4: '4242' };

async function primed() {
  const store = demoStore();
  await primeDemoStore(store, NOW);
  return store;
}

describe('Payments: CareBridge as the middle party', () => {
  it('a fresh primed demo has a bill, and an approved program reduces the family share to $0', async () => {
    const store = await primed();
    const { repo } = asMaria(store);
    const bill = await repo.getBill(DEMO_IDS.maria);
    expect(bill).not.toBeNull();
    const ride = bill!.items.find((i) => i.kind === 'transportation')!;
    expect(ride.programLegs).toEqual([{ programId: 'prog_3', programName: expect.stringContaining('Non-Emergency'), amount: ride.total }]);
    expect(ride.familyShare).toBe(0);
    expect(ride.payeeName).toBe('Rapid Ride Medical Transport');
  });

  it('pending programs are shown but never subtracted', async () => {
    const store = await primed();
    const bill = (await asMaria(store).repo.getBill(DEMO_IDS.maria))!;
    const walker = bill.items.find((i) => i.labelKey === 'resources.walker')!;
    expect(walker.programLegs).toHaveLength(0);
    expect(walker.familyShare).toBe(walker.total);
    expect(walker.pending.some((p) => p.programId === 'prog_1')).toBe(true);
  });

  it('caregiving that is not booked cannot be paid yet', async () => {
    const store = await primed();
    const bill = (await asMaria(store).repo.getBill(DEMO_IDS.maria))!;
    const care = bill.items.filter((i) => i.kind === 'caregiving');
    expect(care.length).toBeGreaterThan(0);
    expect(care.every((i) => !i.payable)).toBe(true);
    const s = settleBill(bill, []);
    expect(s.notBooked).toBeGreaterThan(0);
    expect(s.familyDue).toBe(bill.items.filter((i) => i.payable).reduce((a, i) => a + i.familyShare, 0));
  });

  it('family payments go to CareBridge and items are paid out to the service once covered', async () => {
    const store = await primed();
    const { repo, session } = asMaria(store);
    const before = settleBill(await repo.getBill(DEMO_IDS.maria), []);
    expect(before.balance).toBeGreaterThan(0);
    expect(before.items.find((i) => i.kind === 'transportation')!.payout).toBe('sent'); // fully program-funded

    await payFamilyShare(repo, session, DEMO_IDS.maria, { ...card, amount: before.balance });
    const after = settleBill(await repo.getBill(DEMO_IDS.maria), await repo.listPayments(DEMO_IDS.maria));
    expect(after.balance).toBe(0);
    expect(after.items.filter((i) => i.payable).every((i) => i.payout === 'sent')).toBe(true);
    expect(after.sentToServices).toBe(after.total);
  });

  it('a caregiver can read the bill and pay part of it, but not publish the bill or pay as someone else', async () => {
    const store = await primed();
    const sofia = asSofia(store);
    const bill = await sofia.repo.getBill(DEMO_IDS.maria);
    expect(bill).not.toBeNull();
    const { balance } = settleBill(bill, []);
    const half = Math.round((balance / 2) * 100) / 100;
    const p = await payFamilyShare(sofia.repo, sofia.session, DEMO_IDS.maria, { ...card, amount: half });
    expect(p.payerProfileId).toBe(DEMO_IDS.sofiaProfile);
    expect(settleBill(bill, await sofia.repo.listPayments(DEMO_IDS.maria)).balance).toBeCloseTo(balance - half, 2);

    await expect(sofia.repo.saveBill(bill!)).rejects.toBeInstanceOf(AccessDenied);
    await expect(sofia.repo.addPayment({ ...p, id: 'pay_forged', payerProfileId: DEMO_IDS.mariaProfile })).rejects.toBeInstanceOf(AccessDenied);
    await expect(sofia.repo.addPayment(p)).rejects.toBeInstanceOf(AccessDenied); // payments are immutable
    expect(await publishBill(sofia.repo, DEMO_IDS.maria, NOW)).toBeNull(); // narrow access leaves the bill alone
  });

  it('cannot overpay, and unrelated patients cannot see the bill', async () => {
    const store = await primed();
    const { repo, session } = asMaria(store);
    const { balance } = settleBill(await repo.getBill(DEMO_IDS.maria), []);
    await expect(payFamilyShare(repo, session, DEMO_IDS.maria, { ...card, amount: balance + 1 })).rejects.toThrow();
    await expect(asJames(store).repo.getBill(DEMO_IDS.maria)).rejects.toBeInstanceOf(AccessDenied);
    expect(await asJordan(store).repo.getBill(DEMO_IDS.maria)).not.toBeNull();
  });

  it('validates test cards with a Luhn check', () => {
    const now = new Date('2026-10-09T00:00:00Z');
    expect(validateCard({ number: '4242 4242 4242 4242', expiry: '12/28', cvc: '123' }, now)).toMatchObject({ ok: true, brand: 'Visa', last4: '4242' });
    expect(validateCard({ number: '4242 4242 4242 4241', expiry: '12/28', cvc: '123' }, now).errors.number).toBe(true);
    expect(validateCard({ number: '4242 4242 4242 4242', expiry: '01/20', cvc: '123' }, now).errors.expiry).toBe(true);
    expect(validateCard({ number: '4242 4242 4242 4242', expiry: '12/28', cvc: '1' }, now).errors.cvc).toBe(true);
  });
});
