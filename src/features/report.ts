import { Platform } from 'react-native';
import type { TFunction } from 'i18next';
import type { PlanView } from '@/core/usecases';
import type { Language } from '@/core/types';
import { fmtDateTime, fmtDay, fmtTime } from '@/core/time';
import { tTitle } from '@/i18n';
import { structuredSummary } from './InstructionCard';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * Builds the readiness report as self-contained HTML in the patient's
 * preferred language. Clinical text is included verbatim, never translated.
 * Same markup is used for print on web and expo-print on native.
 */
export function buildReportHtml(plan: PlanView, t: TFunction, lang: Language, generatedAt = new Date().toISOString()) {
  const tz = plan.patient.timezone;
  const dt = (x: string | number) => fmtDateTime(x, tz, lang);
  const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const p = plan.patient;
  const open = plan.gaps.filter((g) => g.status !== 'verified_resolved');
  const resolved = plan.gaps.filter((g) => g.status === 'verified_resolved');
  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const lines = plan.finance.lines.map((l) => `<tr><td>${esc(t(l.labelKey, { defaultValue: l.label }))}</td><td class="num">${money(l.estimatedCost)}${l.hypothetical ? ' *' : ''}</td><td>${esc(t(`finance.lineStatus.${l.status}`))}</td><td class="num">${money(l.remaining)}</td></tr>`).join('');

  const approvedInstructions = plan.instructions.filter((i) => i.reviewStatus === 'approved');
  const otherInstructions = plan.instructions.filter((i) => i.reviewStatus !== 'approved');

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(t('report.title'))} · ${esc(p.displayName)}</title>
<style>
  body{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;color:#1F2A36;background:#fff;margin:32px;font-size:12px;line-height:1.5}
  h1{font-family:Fraunces,Georgia,serif;font-style:italic;font-weight:400;font-size:28px;margin:0 0 4px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #1F2A3624;padding-bottom:4px;margin:24px 0 8px}
  table{border-collapse:collapse;width:100%} th{text-align:left;font-weight:500;color:#1F2A36B8;padding:3px 8px 3px 0;width:38%;vertical-align:top} td{padding:3px 0;vertical-align:top}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .status{display:inline-block;border:2px solid #3F72AF;border-radius:999px;padding:4px 12px;color:#3F72AF;font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  .meta{color:#1F2A36B8;font-size:11px}
  .gap{margin:6px 0;padding:6px 8px;border-left:3px solid #B7832F;background:#F2F4F7}
  .gap.ok{border-left-color:#3E7D5A}
  .orig{font-style:normal;background:#F2F4F7;padding:6px 8px;margin:4px 0}
  .disclaimer{margin-top:28px;padding:10px;border:1px solid #1F2A3624;font-size:11px}
  @media print{body{margin:16mm}}
</style></head><body>
<h1>${esc(t('report.title'))}</h1>
<div class="meta">CareBridge · ${esc(t('report.generatedAt', { when: dt(generatedAt) }))} · ${esc(tz)}</div>

<h2>${esc(t('report.status'))}</h2>
<span class="status">${esc(t(`readinessStatus.${plan.readiness}`))}</span>

<h2>${esc(t('report.overview'))}</h2>
<table>
${row(t('intake.a.displayName'), p.displayName)}
${row(t('home.procedure'), [p.procedureName, p.facility].filter(Boolean).join(' · '))}
${row(t('home.surgery'), dt(p.surgeryDate))}
${row(t('home.expectedDischarge'), dt(p.dischargeAt))}
${row(t('intake.a.preferredLanguage'), p.preferredLanguage === 'es' ? 'Español' : 'English')}
${row(t('intake.a.zip'), [p.zip, p.city].filter(Boolean).join(' · '))}
${row(t('intake.b.insurance'), t(`insurance.${p.insuranceType}`))}
</table>

<h2>${esc(t('report.requirements'))}</h2>
${approvedInstructions.length === 0 ? `<p class="meta">${esc(t('common.noItems'))}</p>` : ''}
${approvedInstructions
  .map(
    (i) => `<div><strong>${esc(t(`instructions.categories.${i.category}`))}</strong> · <span class="meta">${esc(t(`instructions.status.${i.reviewStatus}`))}</span>
<div class="orig">${esc(i.originalText)}</div>
<div class="meta">${esc(structuredSummary(i.structured, t as never))} · ${esc(i.sourcePage ? t('provenance.reportPage', { page: i.sourcePage }) : t('provenance.report'))}</div></div>`,
  )
  .join('')}
${otherInstructions.length ? `<p class="meta">${esc(t('review.queue'))}: ${otherInstructions.length}</p>` : ''}
<p class="meta">${esc(t('report.originalLanguage'))}</p>

<h2>${esc(t('report.available'))}</h2>
${resolved.length === 0 ? `<p class="meta">${esc(t('common.noItems'))}</p>` : ''}
${resolved.map((g) => `<div class="gap ok">${esc(t(g.descriptionKey, { ...g.descriptionParams, defaultValue: g.description }))}${g.resolutionNotes ? ` <span class="meta">— ${esc(g.resolutionNotes)}</span>` : ''}</div>`).join('')}
${plan.equipment
  .filter((e) => e.availabilityStatus === 'available')
  .map((e) => `<div class="gap ok">${esc(t(`equipment.${e.equipmentName}`))} · ${esc(t('equipmentStatus.available'))}</div>`)
  .join('')}

<h2>${esc(t('report.missing'))}</h2>
${open.length === 0 ? `<p class="meta">${esc(t('resources.noGaps'))}</p>` : ''}
${open
  .map(
    (g) =>
      `<div class="gap"><strong>${esc(t(`resources.groups.${g.gapType}`))}</strong> · ${esc(t(`gapStatus.${g.status}`))}<br>${esc(t(g.descriptionKey, { ...g.descriptionParams, defaultValue: g.description }))}${g.windowStart && g.windowEnd ? `<br><span class="meta">${esc(fmtDay(g.windowStart, tz, lang))} ${esc(fmtTime(g.windowStart, tz, lang))} – ${esc(fmtTime(g.windowEnd, tz, lang))}</span>` : ''}${g.estimatedCost ? `<br><span class="meta">${money(g.estimatedCost)} · ${esc(t('common.hypothetical'))}</span>` : ''}</div>`,
  )
  .join('')}

<h2>${esc(t('report.coverage'))}</h2>
<table>
${row(t('report.requiredHours'), `${plan.coverage.requiredHours}h`)}
${row(t('report.coveredHours'), `${plan.coverage.coveredHours}h`)}
${row(t('report.uncoveredHours'), `${plan.coverage.uncoveredHours}h`)}
${plan.caregivers.map((c) => row(c.name, `${c.relationship} · ${c.acceptedInvitation ? t('caregivers.accepted') : t('caregivers.pending')}`)).join('')}
</table>

<h2>${esc(t('report.financial'))}</h2>
<table>
<tr><th>${esc(t('finance.resource'))}</th><td class="num">${esc(t('finance.estimated'))}</td><td>${esc(t('finance.status'))}</td><td class="num">${esc(t('finance.remaining'))}</td></tr>
${lines}
${row(t('finance.total'), money(plan.finance.totalEstimatedCost))}
${row(t('finance.budget'), money(plan.finance.budget))}
${row(t('finance.confirmedAssistance'), money(plan.finance.confirmedAssistance))}
${row(t('finance.gap'), money(plan.finance.remainingGap))}
</table>
<p class="meta">* ${esc(t('common.hypothetical'))}</p>

<h2>${esc(t('report.actions'))}</h2>
<ul>${open.flatMap((g) => g.actions.map((a) => `<li>${esc(t(a.key))} — <span class="meta">${esc(t(g.descriptionKey, { ...g.descriptionParams, defaultValue: g.description }))}</span></li>`)).join('')}</ul>

<div class="disclaimer">${esc(t('report.disclaimer'))}</div>
<div class="meta" style="margin-top:8px">${esc(t('landing.footer'))}</div>
</body></html>`;
}

/** Web: opens the print dialog (save as PDF). Native: expo-print + share sheet. */
export async function exportReport(html: string, fileName: string) {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Popup blocked');
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.document.title = fileName;
    w.focus();
    setTimeout(() => w.print(), 300);
    return;
  }
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName });
}

export const titleOf = (key: string, params: Record<string, string | number> | undefined, lang: Language) => tTitle(key, params, lang);
