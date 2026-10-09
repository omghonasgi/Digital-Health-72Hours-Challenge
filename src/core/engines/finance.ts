import type {
  AssistanceProgram,
  AssistanceRequest,
  AssistanceStatus,
  CostLine,
  FinancialSummary,
  Patient,
  PatientEquipment,
  RecoveryGap,
  RecoveryRequirement,
  ResourceKind,
  ServiceRequest,
} from '../types';
import { COST_CATALOG } from './catalog';

export interface FinanceInput {
  patient: Patient;
  equipment: PatientEquipment[];
  requirements: RecoveryRequirement[];
  gaps: RecoveryGap[];
  serviceRequests: ServiceRequest[];
  assistanceRequests: AssistanceRequest[];
}

const kindForGap = (g: RecoveryGap): ResourceKind | null => {
  switch (g.gapType) {
    case 'equipment':
      return 'equipment';
    case 'medication_access':
      return 'medication';
    case 'caregiving':
      return g.descriptionKey.startsWith('gaps.meals') ? 'meals' : 'caregiving';
    case 'transportation':
      return 'transportation';
    default:
      return null;
  }
};

/**
 * Builds the cost table. Only approved assistance reduces the funding gap;
 * "potentially eligible" and "under review" are reported separately and never
 * subtracted. Owned items cost nothing. Confirmed provider quotes replace
 * catalog estimates and are no longer hypothetical.
 */
export function computeFinancials(input: FinanceInput): FinancialSummary {
  const { patient, equipment, gaps, serviceRequests, assistanceRequests } = input;
  const lines: CostLine[] = [];
  const equipmentByName = new Map(equipment.map((e) => [e.equipmentName, e]));

  for (const g of gaps) {
    const kind = kindForGap(g);
    if (!kind) continue;
    const req = input.requirements.find((r) => r.id === g.requirementId);
    const confirmedQuote = serviceRequests.find((r) => r.status === 'provider_confirmed' && (r.gapId === g.id || r.requirementId === g.requirementId));
    const approvedAssist = assistanceRequests.filter((a) => a.status === 'approved' && a.requirementId === g.requirementId);
    const pendingAssist = assistanceRequests.find((a) => a.status !== 'approved' && a.status !== 'unavailable' && a.requirementId === g.requirementId);

    const item = req?.requiredResources[0] ?? kind;
    const owned = kind === 'equipment' && equipmentByName.get(item as never)?.availabilityStatus === 'available';
    const estimated = owned ? 0 : confirmedQuote ? confirmedQuote.quotedCost : (g.estimatedCost ?? 0);
    const confirmedFunding = Math.min(estimated, approvedAssist.reduce((s, a) => s + (a.approvedAmount ?? 0), 0));
    const remaining = Math.max(0, estimated - confirmedFunding);

    let status: CostLine['status'] = 'missing';
    if (owned) status = 'owned';
    else if (g.status === 'verified_resolved') status = 'covered';
    else if (confirmedQuote) status = 'arranged';
    else if (g.status === 'awaiting_confirmation' || kind === 'medication') status = 'needs_verification';
    else if (kind === 'caregiving' || kind === 'transportation') status = 'uncovered';

    lines.push({
      id: `cost_${g.id}`,
      gapId: g.id,
      requirementId: g.requirementId,
      kind,
      labelKey: `resources.${kind === 'equipment' ? item : kind}`,
      label: kind === 'equipment' ? String(item).replace(/_/g, ' ') : kind === 'medication' ? `${item} copay` : kind,
      estimatedCost: estimated,
      alreadyOwned: owned,
      insuranceCoverage: kind === 'medication' && patient.insuranceType !== 'uninsured' ? 'likely' : 'unknown',
      assistanceProgramId: approvedAssist[0]?.programId ?? pendingAssist?.programId,
      assistanceStatus: approvedAssist[0]?.status ?? pendingAssist?.status,
      confirmedFunding,
      remaining: g.status === 'verified_resolved' && !confirmedQuote ? 0 : remaining,
      status,
      hypothetical: !confirmedQuote && !owned,
    });
  }

  const totalEstimatedCost = lines.reduce((s, l) => s + (l.status === 'owned' || l.status === 'covered' ? 0 : l.estimatedCost), 0);
  const confirmedAssistance = assistanceRequests.filter((a) => a.status === 'approved').reduce((s, a) => s + (a.approvedAmount ?? 0), 0);
  const potentialAssistance = assistanceRequests
    .filter((a) => a.status === 'potentially_eligible' || a.status === 'application_needed' || a.status === 'under_review')
    .reduce((s, a) => s + a.requestedAmount, 0);
  const confirmedFunding = patient.recoveryBudget + confirmedAssistance;
  return {
    lines,
    totalEstimatedCost,
    budget: patient.recoveryBudget,
    confirmedAssistance,
    potentialAssistance,
    confirmedFunding,
    remainingGap: Math.max(0, totalEstimatedCost - confirmedFunding),
  };
}

export interface ProgramMatch {
  program: AssistanceProgram;
  status: AssistanceStatus;
  /** Cost lines this program could help with. */
  applicableLineIds: string[];
  suggestedAmount: number;
  /** i18n keys under `assistance.reasons.*` */
  reasons: string[];
}

export function matchAssistancePrograms(
  patient: Patient,
  programs: AssistanceProgram[],
  summary: FinancialSummary,
  existing: AssistanceRequest[],
): ProgramMatch[] {
  const openLines = summary.lines.filter((l) => l.remaining > 0);
  const out: ProgramMatch[] = [];
  for (const p of programs) {
    const reasons: string[] = [];
    const e = p.eligibility;
    if (e.incomeRanges && !e.incomeRanges.includes(patient.incomeRange)) continue;
    if (e.insuranceTypes && !e.insuranceTypes.includes(patient.insuranceType)) continue;
    if (e.zipPrefixes && !e.zipPrefixes.some((z) => patient.zip.startsWith(z))) continue;
    const applicable = openLines.filter((l) => p.supportedServices.includes(l.kind));
    if (!applicable.length) continue;
    if (e.incomeRanges) reasons.push('assistance.reasons.income');
    if (e.insuranceTypes) reasons.push('assistance.reasons.insurance');
    if (e.zipPrefixes) reasons.push('assistance.reasons.area');
    reasons.push('assistance.reasons.covers');
    const req = existing.find((r) => r.programId === p.id);
    const status: AssistanceStatus = req ? req.status : p.fundingStatus === 'unavailable' ? 'unavailable' : 'potentially_eligible';
    const suggestedAmount = Math.min(p.maxAward, applicable.reduce((s, l) => s + l.remaining, 0));
    out.push({ program: p, status, applicableLineIds: applicable.map((l) => l.id), suggestedAmount, reasons });
  }
  return out.sort((a, b) => (a.status === 'unavailable' ? 1 : 0) - (b.status === 'unavailable' ? 1 : 0) || b.suggestedAmount - a.suggestedAmount);
}

export const catalogPrice = (kind: ResourceKind) =>
  kind === 'medication' ? COST_CATALOG.medicationCopay : kind === 'transportation' ? COST_CATALOG.rideOneWay : kind === 'meals' ? COST_CATALOG.mealsPerDay * 3 : 0;
