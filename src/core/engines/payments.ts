import type {
  AssistanceProgram,
  AssistanceRequest,
  AssistanceStatus,
  BillItem,
  FamilyBill,
  FinancialSummary,
  Payment,
  ProviderCompany,
  ResourceKind,
  ServiceRequest,
} from '../types';
import type { ProgramMatch } from './finance';

/**
 * CareBridge sits in the middle of every payment: approved programs and the
 * family pay CareBridge, and CareBridge pays the service. All simulated.
 *
 * Only approved assistance reduces the family share, same rule as the cost
 * table. Pending programs are listed as "could cover" and never subtracted.
 */

/** Who CareBridge pays when no provider has been booked yet. Fictional. */
const DEFAULT_PAYEE: Record<ResourceKind, { providerId?: string; name: string }> = {
  equipment: { providerId: 'prov_a9', name: 'Prairie Mobility Rentals' },
  transportation: { providerId: 'prov_a5', name: 'Rapid Ride Medical Transport' },
  meals: { providerId: 'prov_a6', name: 'Casa Nutrida Meal Delivery' },
  caregiving: { name: 'Home care provider (not booked)' },
  medication: { name: 'Lakeside Outpatient Pharmacy (demo)' },
};

const PENDING: AssistanceStatus[] = ['potentially_eligible', 'application_needed', 'under_review'];

const cents = (n: number) => Math.round(n * 100) / 100;

export interface BillInput {
  patientId: string;
  finance: FinancialSummary;
  matches: ProgramMatch[];
  programs: AssistanceProgram[];
  assistanceRequests: AssistanceRequest[];
  serviceRequests: ServiceRequest[];
  providers: ProviderCompany[];
  now: string;
}

export function buildBill(input: BillInput): FamilyBill {
  const { finance, matches, programs, assistanceRequests, serviceRequests, providers } = input;
  const items: BillItem[] = [];

  for (const line of finance.lines) {
    if (line.status === 'owned' || line.status === 'covered' || line.estimatedCost <= 0) continue;
    const booked = serviceRequests.find((r) => r.status === 'provider_confirmed' && (r.gapId === line.gapId || r.requirementId === line.requirementId));
    const bookedProvider = booked ? providers.find((p) => p.id === booked.providerId) : undefined;
    const fallback = DEFAULT_PAYEE[line.kind];
    const total = line.estimatedCost;

    let left = total;
    const programLegs = assistanceRequests
      .filter((a) => a.status === 'approved' && a.requirementId === line.requirementId && (a.approvedAmount ?? 0) > 0)
      .map((a) => {
        const amount = Math.min(left, a.approvedAmount ?? 0);
        left -= amount;
        return { programId: a.programId, programName: programs.find((p) => p.id === a.programId)?.programName ?? a.programId, amount: cents(amount) };
      })
      .filter((l) => l.amount > 0);
    const familyShare = cents(Math.max(0, left));

    const pending = matches
      .filter((m) => m.applicableLineIds.includes(line.id) && PENDING.includes(m.status) && !programLegs.some((l) => l.programId === m.program.id))
      .map((m) => ({ programId: m.program.id, programName: m.program.programName, upTo: cents(Math.min(m.suggestedAmount, familyShare)), status: m.status }))
      .filter((p) => p.upTo > 0);

    items.push({
      id: line.id,
      kind: line.kind,
      labelKey: line.labelKey,
      label: line.label,
      detail: line.kind === 'medication' ? line.label.replace(/ copay$/, '') : undefined,
      total: cents(total),
      hypothetical: line.hypothetical,
      payable: line.kind !== 'caregiving' || !!booked,
      payeeName: bookedProvider?.companyName ?? fallback.name,
      payeeProviderId: bookedProvider?.id ?? fallback.providerId,
      programLegs,
      pending,
      familyShare,
    });
  }

  return { id: `bill_${input.patientId}`, patientId: input.patientId, items, updatedAt: input.now, isSimulated: true };
}

export type PayoutStatus = 'sent' | 'waiting_family' | 'not_booked';

export interface SettledItem extends BillItem {
  familyPaid: number;
  payout: PayoutStatus;
  /** When CareBridge paid the service: the payment that completed the family share. */
  sentAt?: string;
}

export interface Settlement {
  items: SettledItem[];
  /** Sum of payable items. */
  total: number;
  programsCover: number;
  familyDue: number;
  familyPaid: number;
  balance: number;
  /** Paid out by CareBridge to services so far. */
  sentToServices: number;
  /** Totals of items that can't be paid until booked. */
  notBooked: number;
}

/**
 * Applies family payments to payable items in bill order. An item is paid out
 * to its service once programs plus family cover it in full.
 */
export function settleBill(bill: FamilyBill | null, payments: Payment[]): Settlement {
  const items = bill?.items ?? [];
  const ordered = payments.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let pi = 0;
  let pool = 0;
  let poolAt: string | undefined;
  const take = (need: number) => {
    let got = 0;
    while (got < need - 0.004) {
      if (pool <= 0.004) {
        if (pi >= ordered.length) break;
        pool = ordered[pi].amount;
        poolAt = ordered[pi].createdAt;
        pi++;
      }
      const d = Math.min(pool, need - got);
      pool -= d;
      got += d;
    }
    return { got: cents(got), at: poolAt };
  };

  const settled: SettledItem[] = items.map((item) => {
    if (!item.payable) return { ...item, familyPaid: 0, payout: 'not_booked' };
    if (item.familyShare <= 0) return { ...item, familyPaid: 0, payout: 'sent' };
    const { got, at } = take(item.familyShare);
    const done = got >= item.familyShare - 0.004;
    return { ...item, familyPaid: got, payout: done ? 'sent' : 'waiting_family', sentAt: done ? at : undefined };
  });

  const payable = settled.filter((i) => i.payable);
  const sum = (xs: number[]) => cents(xs.reduce((s, x) => s + x, 0));
  const familyDue = sum(payable.map((i) => i.familyShare));
  const familyPaid = sum(payments.map((p) => p.amount));
  return {
    items: settled,
    total: sum(payable.map((i) => i.total)),
    programsCover: sum(payable.flatMap((i) => i.programLegs.map((l) => l.amount))),
    familyDue,
    familyPaid,
    balance: cents(Math.max(0, familyDue - familyPaid)),
    sentToServices: sum(payable.filter((i) => i.payout === 'sent').map((i) => i.total)),
    notBooked: sum(settled.filter((i) => !i.payable).map((i) => i.total)),
  };
}

/** Basic test-card checks for the mock checkout. Luhn, so a typo is caught the way a real form would. */
export function validateCard(input: { number: string; expiry: string; cvc: string }, now = new Date()) {
  const digits = input.number.replace(/\D/g, '');
  const errors: { number?: true; expiry?: true; cvc?: true } = {};
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (digits.length < 13 || digits.length > 19 || sum % 10 !== 0) errors.number = true;
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(input.expiry.trim());
  const month = m ? Number(m[1]) : 0;
  const year = m ? 2000 + Number(m[2]) : 0;
  if (!m || month < 1 || month > 12 || year * 12 + month < now.getFullYear() * 12 + now.getMonth() + 1) errors.expiry = true;
  if (!/^\d{3,4}$/.test(input.cvc.trim())) errors.cvc = true;
  const brand = digits.startsWith('4') ? 'Visa' : /^5[1-5]/.test(digits) ? 'Mastercard' : /^3[47]/.test(digits) ? 'Amex' : 'Card';
  return { ok: Object.keys(errors).length === 0, errors, brand, last4: digits.slice(-4) };
}
