import type { Interval, Patient, ProviderAvailability, ProviderCompany, ProviderMatch, ProviderService } from '../types';
import { intersect, ms, normalize, totalHours } from '../time';

export interface MatchInput {
  patient: Patient;
  providers: ProviderCompany[];
  availability: ProviderAvailability[];
  /** Windows that still need coverage (from the readiness coverage summary). */
  requiredWindows: Interval[];
  requiredServices: ProviderService[];
  /** Budget still unallocated; used only for ranking, never for filtering. */
  budgetRemaining: number;
}

/**
 * Two phases, as the brief requires:
 *   1. Filter out anyone who fails a mandatory constraint (qualification,
 *      service area, verification, availability during the required window).
 *   2. Rank the rest on language fit, cost vs. budget, and hours covered.
 * There is deliberately no "match %": a number like that would read as a
 * judgement of clinical suitability, which this system never makes.
 */
export function matchProviders(input: MatchInput): ProviderMatch[] {
  const { patient, providers, availability, requiredWindows, requiredServices, budgetRemaining } = input;
  const zipPrefix = patient.zip.slice(0, 3);
  const windows = normalize(requiredWindows);
  const out: ProviderMatch[] = [];

  for (const p of providers) {
    if (p.verificationStatus === 'unverified') continue;
    if (!requiredServices.every((s) => p.services.includes(s))) continue;
    if (!p.serviceAreaZipPrefixes.includes(zipPrefix)) continue;

    const slots = availability.filter((a) => a.providerId === p.id).map((a) => ({ start: ms(a.startAt), end: ms(a.endAt) }));
    const covered: Interval[] = [];
    for (const w of windows) for (const s of slots) {
      const x = intersect(w, s);
      if (x) covered.push(x);
    }
    const coveredWindows = normalize(covered);
    const coveredHours = totalHours(coveredWindows);
    if (windows.length && coveredHours <= 0) continue;

    const billableHours = Math.max(p.minimumHours, Math.ceil(coveredHours));
    const estimatedCost = billableHours * p.hourlyRate;
    const languageMatch = p.languages.includes(patient.preferredLanguage);
    const withinBudget = estimatedCost <= budgetRemaining;
    const reasons: string[] = ['match.reasons.qualified', 'match.reasons.in_area'];
    if (languageMatch) reasons.push('match.reasons.language');
    if (windows.length) reasons.push(coveredHours >= totalHours(windows) - 0.01 ? 'match.reasons.covers_all' : 'match.reasons.covers_part');
    if (withinBudget) reasons.push('match.reasons.within_budget');
    if (p.verificationStatus === 'verified') reasons.push('match.reasons.verified');
    out.push({ provider: p, coveredHours, estimatedCost, withinBudget, languageMatch, reasons, coveredWindows });
  }

  return out.sort(
    (a, b) =>
      Number(b.languageMatch) - Number(a.languageMatch) ||
      Number(b.withinBudget) - Number(a.withinBudget) ||
      b.coveredHours - a.coveredHours ||
      a.estimatedCost - b.estimatedCost,
  );
}
