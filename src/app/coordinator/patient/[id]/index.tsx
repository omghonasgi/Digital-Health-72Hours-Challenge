import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AssistanceStatus, ClinicalInstruction, ClinicalReview, GapStatus, ProviderMatch, RecoveryGap, ServiceRequest, AssistanceRequest } from '@/core/types';
import { matchProvidersFor, requestService, reviewInstruction, simulateProviderResponse, updateAssistance, updateGap } from '@/core/usecases';
import { CalendarViews } from '@/features/CalendarViews';
import { CoverageBar } from '@/features/CoverageBar';
import { FinanceTable } from '@/features/FinanceTable';
import { GapCard } from '@/features/GapCard';
import { InstructionCard } from '@/features/InstructionCard';
import { PlanState } from '@/features/PlanScreen';
import { ProviderCard } from '@/features/ProviderCard';
import { ReadinessReport } from '@/features/ReadinessReport';
import { ReadinessStamp } from '@/features/ReadinessStamp';
import { hoursLabel, useFmt } from '@/features/format';
import { assistanceTone } from '@/features/status';
import { useSession } from '@/state/SessionProvider';
import { useAction, useNow, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, ConfirmSheet, Field, Hairline, Icons, KeyValue, Meta, Muted, NumberField, Row, Screen, Section, StatusDot, TextField, colors, space } from '@/ui';

type Tab = 'review' | 'gaps' | 'coverage' | 'providers' | 'tasks' | 'finance' | 'report';
const TABS: Tab[] = ['review', 'gaps', 'coverage', 'providers', 'tasks', 'finance', 'report'];
const GAP_STATUSES: GapStatus[] = ['identified', 'assigned', 'assistance_requested', 'awaiting_confirmation', 'verified_resolved', 'unresolved', 'escalated'];
const ASSIST_STATUSES: AssistanceStatus[] = ['application_needed', 'under_review', 'approved', 'unavailable'];

export default function CoordinatorPatient() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, repo } = useSession();
  const { plan, loading, error, reload } = usePlan(id);
  const { busy, error: actionError, run } = useAction();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('review');
  const [reviews, setReviews] = useState<ClinicalReview[]>([]);
  const [reviewTarget, setReviewTarget] = useState<{ ins: ClinicalInstruction; status: 'needs_clarification' | 'rejected' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [resolveTarget, setResolveTarget] = useState<RecoveryGap | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [matches, setMatches] = useState<ProviderMatch[] | null>(null);
  const [forGap, setForGap] = useState<RecoveryGap | undefined>();
  const [pendingRequest, setPendingRequest] = useState<ProviderMatch | null>(null);
  const [approveTarget, setApproveTarget] = useState<AssistanceRequest | null>(null);
  const [approveAmount, setApproveAmount] = useState<number | undefined>();

  const [reviewTick, setReviewTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    repo
      .listReviews(id)
      .then((r) => {
        if (alive) setReviews(r.sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [repo, id, reviewTick]);

  const loadMatches = useCallback(
    (gap?: RecoveryGap) => {
      if (!plan) return;
      setForGap(gap);
      setMatches(null);
      void matchProvidersFor(repo, plan, gap).then(setMatches);
    },
    [plan, repo],
  );
  // Providers tab: match on first open caregiving gap whenever the plan changes.
  const firstCaregivingGapId = plan?.gaps.find((g) => g.gapType === 'caregiving' && g.status !== 'verified_resolved')?.id;
  const [matchedFor, setMatchedFor] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== 'providers' || !plan) return;
    const key = `${plan.patient.id}:${firstCaregivingGapId ?? 'all'}:${plan.gaps.length}:${plan.serviceRequests.length}`;
    if (matchedFor === key) return;
    let alive = true;
    const gap = plan.gaps.find((g) => g.id === (forGap?.id ?? firstCaregivingGapId));
    void matchProvidersFor(repo, plan, gap).then((m) => {
      if (alive) {
        setForGap(gap);
        setMatches(m);
        setMatchedFor(key);
      }
    });
    return () => {
      alive = false;
    };
  }, [tab, plan, repo, firstCaregivingGapId, matchedFor, forGap?.id]);

  const f = useFmt(plan?.patient.timezone ?? 'UTC');
  if (!session) return null;

  const act = (fn: () => Promise<unknown>) =>
    void run(async () => {
      await fn();
      await reload();
      setReviewTick((n) => n + 1);
    });

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen title={plan.patient.displayName} subtitle={`${plan.patient.procedureName} · ${t('home.discharge')} ${f.dateTime(plan.patient.dischargeAt)} · ${plan.patient.timezone}`} aside={<ReadinessStamp status={plan.readiness} />} bottomInset={BOTTOM_BAR_HEIGHT}>
          <Row wrap style={{ justifyContent: 'space-between' }}>
            <Button label={t('common.back')} variant="quiet" compact onPress={() => (router.canGoBack() ? router.back() : router.replace('/coordinator'))} />
            <Chip label={t(`readinessStatus.${plan.readiness}`)} tone={plan.readiness === 'no_reported_gaps' ? 'good' : plan.readiness === 'clinical_review_required' ? 'urgent' : plan.readiness === 'gaps_identified' ? 'caution' : 'blue'} dense />
          </Row>
          <Row wrap>
            {TABS.map((x) => {
              const badge = x === 'review' ? plan.instructions.filter((i) => i.reviewStatus === 'draft').length : x === 'gaps' ? plan.gaps.filter((g) => g.status !== 'verified_resolved').length : x === 'tasks' ? plan.tasks.filter((k) => k.status === 'missed' || k.status === 'blocked' || k.status === 'escalated').length : 0;
              return <Chip key={x} label={x === 'report' ? t('report.title') : t(`coordinator.tabs.${x}`)} meta={badge ? String(badge) : undefined} selected={tab === x} onPress={() => setTab(x)} />;
            })}
          </Row>
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}

          {tab === 'review' ? (
            <>
              <Section title={t('review.queue')}>
                {plan.instructions.filter((i) => i.reviewStatus === 'draft').length === 0 ? (
                  <Card>
                    <Row>
                      <StatusDot tone="good" />
                      <Muted>{t('common.noItems')}</Muted>
                    </Row>
                  </Card>
                ) : null}
                {plan.instructions
                  .filter((i) => i.reviewStatus === 'draft')
                  .map((ins) => (
                    <InstructionCard key={ins.id} instruction={ins}>
                      <View style={styles.actions}>
                        <Button label={t('review.approve')} variant="hero" compact icon={Icons.Check} loading={busy} onPress={() => act(() => reviewInstruction(repo, session, ins, 'approved'))} />
                        <Button label={t('review.clarify')} variant="ghost" compact onPress={() => setReviewTarget({ ins, status: 'needs_clarification' })} />
                        <Button label={t('review.reject')} variant="danger" compact onPress={() => setReviewTarget({ ins, status: 'rejected' })} />
                      </View>
                    </InstructionCard>
                  ))}
              </Section>
              {plan.reviewItems.length ? (
                <Card>
                  <Row>
                    <StatusDot tone="urgent" />
                    <Body weight="medium">{t('review.reviewItems')}</Body>
                  </Row>
                  {plan.reviewItems.map((r) => (
                    <Muted key={`${r.instructionId}-${r.reasonKey}`}>{t(r.reasonKey)}</Muted>
                  ))}
                </Card>
              ) : null}
              <Section title={t('instructions.title')}>
                {plan.instructions
                  .filter((i) => i.reviewStatus !== 'draft')
                  .map((ins) => (
                    <InstructionCard key={ins.id} instruction={ins} reviewerName={session.profile.displayName}>
                      {ins.reviewStatus !== 'approved' ? (
                        <View style={styles.actions}>
                          <Button label={t('review.approve')} variant="ghost" compact onPress={() => act(() => reviewInstruction(repo, session, ins, 'approved'))} />
                        </View>
                      ) : (
                        <View style={styles.actions}>
                          <Button label={t('review.clarify')} variant="quiet" compact onPress={() => setReviewTarget({ ins, status: 'needs_clarification' })} />
                        </View>
                      )}
                    </InstructionCard>
                  ))}
              </Section>
              <Section title={t('coordinator.reviews')}>
                <Card>
                  {reviews.length === 0 ? <Muted>{t('common.noItems')}</Muted> : null}
                  {reviews.map((r) => (
                    <View key={r.id} style={{ gap: 2 }}>
                      <Meta>
                        {f.dateTime(r.reviewedAt)} · {r.reviewType} · {r.status}
                      </Meta>
                      <Body>{r.notes}</Body>
                    </View>
                  ))}
                </Card>
              </Section>
            </>
          ) : null}

          {tab === 'gaps' ? (
            <Section title={t('coordinator.openGaps')}>
              {plan.gaps.length === 0 ? (
                <Card>
                  <Muted>{t('resources.noGaps')}</Muted>
                </Card>
              ) : null}
              {plan.gaps
                .slice()
                .sort((a, b) => Number(a.status === 'verified_resolved') - Number(b.status === 'verified_resolved'))
                .map((gap) => (
                  <GapCard key={gap.id} gap={gap} timezone={plan.patient.timezone} showActions={false}>
                    {gap.assignedCoordinator ? <Meta>{t('coordinator.assign')} · {gap.assignedCoordinator === session.profile.id ? session.profile.displayName : gap.assignedCoordinator}</Meta> : null}
                    <Hairline />
                    <Meta>{t('coordinator.setStatus')}</Meta>
                    <Row wrap>
                      {GAP_STATUSES.map((s) => (
                        <Chip key={s} label={t(`gapStatus.${s}`)} selected={gap.status === s} dense onPress={() => (s === 'verified_resolved' ? setResolveTarget(gap) : act(() => updateGap(repo, session, gap, s)))} />
                      ))}
                    </Row>
                    <View style={styles.actions}>
                      {gap.status !== 'verified_resolved' ? <Button label={t('coordinator.assign')} variant="ghost" compact onPress={() => act(() => updateGap(repo, session, gap, 'assigned'))} /> : null}
                      {gap.status !== 'verified_resolved' ? <Button label={t('coordinator.markResolved')} variant="hero" compact onPress={() => setResolveTarget(gap)} /> : null}
                      {gap.status !== 'escalated' && gap.status !== 'verified_resolved' ? <Button label={t('coordinator.escalate')} variant="danger" compact onPress={() => act(() => updateGap(repo, session, gap, 'escalated'))} /> : null}
                      {gap.gapType === 'caregiving' || gap.gapType === 'transportation' ? (
                        <Button
                          label={t('coordinator.tabs.providers')}
                          variant="quiet"
                          compact
                          onPress={() => {
                            setTab('providers');
                            loadMatches(gap);
                          }}
                        />
                      ) : null}
                    </View>
                  </GapCard>
                ))}
            </Section>
          ) : null}

          {tab === 'coverage' ? (
            <>
              <Section title={t('report.coverage')}>
                <Card>
                  {plan.coverage.requiredWindows.length ? <CoverageBar coverage={plan.coverage} timezone={plan.patient.timezone} /> : <Muted>{t('common.noItems')}</Muted>}
                  <KeyValue k={t('report.requiredHours')} v={hoursLabel(plan.coverage.requiredHours)} />
                  <KeyValue k={t('report.coveredHours')} v={hoursLabel(plan.coverage.coveredHours)} />
                  <KeyValue k={t('report.uncoveredHours')} v={hoursLabel(plan.coverage.uncoveredHours)} />
                </Card>
              </Section>
              <Section title={t('report.caregivers')}>
                {plan.caregivers.map((c) => (
                  <Card key={c.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Body weight="medium">{c.name}</Body>
                        <Meta>
                          {c.relationship} · {c.languages.join('/')} · {c.capabilities.map((k) => t(`capability.${k}`)).join(', ')}
                        </Meta>
                      </View>
                      <Chip label={c.acceptedInvitation ? t('caregivers.accepted') : t('caregivers.pending')} tone={c.acceptedInvitation ? 'good' : 'caution'} dense />
                    </Row>
                    {plan.availability
                      .filter((a) => a.caregiverId === c.id)
                      .map((a) => (
                        <Row key={a.id}>
                          <StatusDot tone={a.confirmed ? 'good' : 'caution'} />
                          <Body>{f.range(a.startAt, a.endAt)}</Body>
                          <Meta>{a.confirmed ? t('caregiverApp.confirmedHours') : t('caregivers.pending')}</Meta>
                        </Row>
                      ))}
                    {!c.acceptedInvitation ? <Meta>{t('caregivers.invite')}: {c.inviteCode}</Meta> : null}
                  </Card>
                ))}
              </Section>
              <Section title={t('coordinator.serviceRequests')}>
                {plan.serviceRequests.length === 0 ? (
                  <Card>
                    <Muted>{t('common.noItems')}</Muted>
                  </Card>
                ) : null}
                {plan.serviceRequests.map((r) => (
                  <ServiceRequestCard key={r.id} request={r} timezone={plan.patient.timezone} busy={busy} onRespond={(resp) => act(() => simulateProviderResponse(repo, r, resp))} />
                ))}
              </Section>
            </>
          ) : null}

          {tab === 'providers' ? (
            <Section title={t('caregivers.matches')}>
              <Muted>{t('caregivers.matchesIntro')}</Muted>
              <Row wrap>
                <Chip label={t('caregivers.allGaps')} selected={!forGap} dense onPress={() => loadMatches(undefined)} />
                {plan.gaps
                  .filter((g) => g.status !== 'verified_resolved' && (g.gapType === 'caregiving' || g.gapType === 'transportation'))
                  .map((g) => (
                    <Chip key={g.id} label={t(`resources.groups.${g.gapType}`)} meta={g.windowStart ? f.day(g.windowStart) : undefined} selected={forGap?.id === g.id} dense onPress={() => loadMatches(g)} />
                  ))}
              </Row>
              {matches === null ? <Muted>{t('common.loading')}</Muted> : null}
              {matches?.length === 0 ? (
                <Card>
                  <Muted>{t('caregivers.noMatches')}</Muted>
                </Card>
              ) : null}
              {matches?.map((m) => (
                <ProviderCard key={m.provider.id} match={m} timezone={plan.patient.timezone} request={plan.serviceRequests.find((r) => r.providerId === m.provider.id && r.status !== 'cancelled' && r.status !== 'declined')} onRequest={setPendingRequest} busy={busy} />
              ))}
            </Section>
          ) : null}

          {tab === 'tasks' ? (
            <CalendarViews
              tasks={plan.tasks}
              conflicts={plan.conflicts}
              dischargeAt={plan.patient.dischargeAt}
              timezone={plan.patient.timezone}
              caregivers={plan.caregivers}
              now={now}
              reviewItems={plan.reviewItems}
              hrefFor={(task) => ({ pathname: '/coordinator/patient/[id]/task/[taskId]', params: { id: plan.patient.id, taskId: task.id } })}
              conflictRoute={() => ({ pathname: '/coordinator/patient/[id]', params: { id: plan.patient.id } })}
            />
          ) : null}

          {tab === 'finance' ? (
            <>
              <FinanceTable summary={plan.finance} timezone={plan.patient.timezone} />
              <Section title={t('coordinator.assistanceRequests')}>
                {plan.assistanceRequests.length === 0 ? (
                  <Card>
                    <Muted>{t('common.noItems')}</Muted>
                  </Card>
                ) : null}
                {plan.assistanceRequests.map((r) => {
                  const program = plan.programs.find((p) => p.program.id === r.programId)?.program;
                  return (
                    <Card key={r.id}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Body weight="medium">{program?.programName ?? r.programId}</Body>
                          <Meta>
                            {t('finance.applied')} · {f.money(r.requestedAmount)}
                            {r.approvedAmount !== undefined ? ` · ${t('coordinator.approveAmount')} ${f.money(r.approvedAmount)}` : ''} · {f.dateTime(r.updatedAt)}
                          </Meta>
                        </View>
                        <Chip label={t(`assistanceStatus.${r.status}`)} tone={assistanceTone(r.status)} dense />
                      </Row>
                      <Meta>{t('coordinator.setStatus')}</Meta>
                      <Row wrap>
                        {ASSIST_STATUSES.map((s) => (
                          <Chip
                            key={s}
                            label={t(`assistanceStatus.${s}`)}
                            selected={r.status === s}
                            dense
                            onPress={() => {
                              if (s === 'approved') {
                                setApproveAmount(r.requestedAmount);
                                setApproveTarget(r);
                              } else act(() => updateAssistance(repo, session, r, s));
                            }}
                          />
                        ))}
                      </Row>
                    </Card>
                  );
                })}
              </Section>
            </>
          ) : null}

          {tab === 'report' ? <ReadinessReport plan={plan} showActions={false} /> : null}

          <ConfirmSheet
            visible={!!reviewTarget}
            title={reviewTarget?.status === 'rejected' ? t('review.reject') : t('review.clarify')}
            body={reviewTarget?.ins.originalText}
            confirmLabel={t('common.save')}
            cancelLabel={t('common.cancel')}
            destructive={reviewTarget?.status === 'rejected'}
            confirmDisabled={reviewNotes.trim().length < 3}
            onCancel={() => {
              setReviewTarget(null);
              setReviewNotes('');
            }}
            onConfirm={() => {
              const target = reviewTarget;
              const notes = reviewNotes;
              setReviewTarget(null);
              setReviewNotes('');
              if (target) act(() => reviewInstruction(repo, session, target.ins, target.status, notes));
            }}
          >
            <Field label={t('review.notes')}>
              <TextField value={reviewNotes} onChangeText={setReviewNotes} multiline />
            </Field>
          </ConfirmSheet>

          <ConfirmSheet
            visible={!!resolveTarget}
            title={t('coordinator.markResolved')}
            body={resolveTarget ? t(resolveTarget.descriptionKey, { ...resolveTarget.descriptionParams, defaultValue: resolveTarget.description }) : undefined}
            confirmLabel={t('coordinator.markResolved')}
            cancelLabel={t('common.cancel')}
            confirmDisabled={resolveNotes.trim().length < 3}
            onCancel={() => {
              setResolveTarget(null);
              setResolveNotes('');
            }}
            onConfirm={() => {
              const target = resolveTarget;
              const notes = resolveNotes;
              setResolveTarget(null);
              setResolveNotes('');
              if (target) act(() => updateGap(repo, session, target, 'verified_resolved', notes));
            }}
          >
            <Field label={t('coordinator.resolutionNotes')}>
              <TextField value={resolveNotes} onChangeText={setResolveNotes} multiline />
            </Field>
          </ConfirmSheet>

          <ConfirmSheet
            visible={!!pendingRequest}
            title={t('caregivers.request')}
            body={pendingRequest ? `${pendingRequest.provider.companyName} · ${t('caregivers.estimate', { amount: pendingRequest.estimatedCost })}` : undefined}
            confirmLabel={t('caregivers.request')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setPendingRequest(null)}
            onConfirm={() => {
              const m = pendingRequest;
              setPendingRequest(null);
              if (m) act(() => requestService(repo, session, plan, m, forGap));
            }}
          />

          <ConfirmSheet
            visible={!!approveTarget}
            title={t('assistanceStatus.approved')}
            confirmLabel={t('common.save')}
            cancelLabel={t('common.cancel')}
            confirmDisabled={approveAmount === undefined}
            onCancel={() => setApproveTarget(null)}
            onConfirm={() => {
              const target = approveTarget;
              const amount = approveAmount;
              setApproveTarget(null);
              if (target) act(() => updateAssistance(repo, session, target, 'approved', amount));
            }}
          >
            <Field label={t('coordinator.approveAmount')}>
              <NumberField value={approveAmount} onChange={setApproveAmount} />
            </Field>
          </ConfirmSheet>
        </Screen>
      ) : null}
    </PlanState>
  );
}

function ServiceRequestCard({ request: r, timezone, busy, onRespond }: { request: ServiceRequest; timezone: string; busy: boolean; onRespond: (resp: 'provider_confirmed' | 'declined') => void }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const [provider, setProvider] = useState<string>(r.providerId);
  const { repo } = useSession();
  useEffect(() => {
    void repo.listProviders().then((ps) => setProvider(ps.find((p) => p.id === r.providerId)?.companyName ?? r.providerId));
  }, [repo, r.providerId]);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Body weight="medium">{provider}</Body>
          <Meta>
            {f.range(r.windowStart, r.windowEnd)} · {f.money(r.quotedCost)} · {f.dateTime(r.requestedAt)}
          </Meta>
        </View>
        <Chip label={r.status === 'provider_confirmed' ? t('caregivers.confirmed') : r.status === 'declined' ? t('caregivers.declined') : r.status === 'cancelled' ? t('common.cancel') : t('caregivers.requested')} tone={r.status === 'provider_confirmed' ? 'good' : r.status === 'requested' ? 'caution' : 'neutral'} dense />
      </Row>
      {r.status === 'requested' ? (
        <>
          <Meta>{t('caregivers.simulateNote')}</Meta>
          <View style={styles.actions}>
            <Button label={t('caregivers.simulateConfirm')} variant="hero" compact loading={busy} onPress={() => onRespond('provider_confirmed')} />
            <Button label={t('caregivers.simulateDecline')} variant="ghost" compact onPress={() => onRespond('declined')} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
