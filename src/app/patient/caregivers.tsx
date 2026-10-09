import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { caregiverInputSchema } from '@/core/schemas';
import { offsetFromDischarge } from '@/core/time';
import type { CaregiverCapability, Language, ProviderMatch, RecoveryGap, ServiceRequest } from '@/core/types';
import { addCaregiver, matchProvidersFor, requestService, simulateProviderResponse } from '@/core/usecases';
import { DateTimeField } from '@/features/DateTimeField';
import { PlanState } from '@/features/PlanScreen';
import { ProviderCard } from '@/features/ProviderCard';
import { hoursLabel, useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useAction, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, ConfirmSheet, Field, Hairline, Icons, Meta, MultiChoice, Muted, Row, Screen, Section, Stamp, StatusDot, TextField, ToggleRow, colors, space } from '@/ui';

const CAPABILITIES: CaregiverCapability[] = ['supervision', 'transport', 'meals', 'basic_tasks'];

export default function Caregivers() {
  const { t } = useTranslation();
  const { session, repo } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const { busy, error: actionError, run } = useAction();
  const f = useFmt(plan?.patient.timezone ?? 'UTC');
  const [matches, setMatches] = useState<ProviderMatch[] | null>(null);
  const [forGap, setForGap] = useState<RecoveryGap | undefined>();
  const [pendingRequest, setPendingRequest] = useState<ProviderMatch | null>(null);
  const [simulating, setSimulating] = useState<ServiceRequest | null>(null);
  const [adding, setAdding] = useState(false);

  const gapsNeedingHelp = plan?.gaps.filter((g) => g.status !== 'verified_resolved' && g.actions.some((a) => a.route === '/patient/caregivers')) ?? [];

  const loadMatches = useCallback(
    (gap?: RecoveryGap) => {
      if (!plan) return;
      setForGap(gap);
      setMatches(null);
      void matchProvidersFor(repo, plan, gap).then(setMatches);
    },
    [plan, repo],
  );

  // First load: match against the first gap that routes here, or all uncovered hours.
  const firstGapId = gapsNeedingHelp[0]?.id;
  useEffect(() => {
    if (!plan) return;
    let alive = true;
    const gap = plan.gaps.find((g) => g.id === firstGapId);
    void matchProvidersFor(repo, plan, gap).then((m) => {
      if (alive) {
        setForGap(gap);
        setMatches(m);
      }
    });
    return () => {
      alive = false;
    };
  }, [plan, repo, firstGapId]);

  if (!session?.patientId) return <Redirect href="/patient" />;

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen title={t('caregivers.title')} subtitle={t('caregivers.intro')} aside={plan.coverage.requiredHours > 0 ? <Stamp label={plan.coverage.uncoveredHours > 0 ? `${hoursLabel(plan.coverage.uncoveredHours)} open` : 'covered'} statusColor={plan.coverage.uncoveredHours > 0 ? colors.caution : colors.good} size={64} /> : undefined} bottomInset={BOTTOM_BAR_HEIGHT}>
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}

          <Section title={t('home.caregiverSupport')} aside={<Button label={t('caregivers.add')} variant="quiet" compact onPress={() => setAdding((a) => !a)} />}>
            {plan.caregivers.length === 0 && !adding ? (
              <Card>
                <Muted>{t('home.noCaregiver')}</Muted>
                <Button label={t('caregivers.add')} variant="ghost" compact onPress={() => setAdding(true)} />
              </Card>
            ) : null}
            {plan.caregivers.map((c) => {
              const blocks = plan.availability.filter((a) => a.caregiverId === c.id);
              return (
                <Card key={c.id}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Body weight="medium">{c.name}</Body>
                      <Meta>
                        {c.relationship} · {c.languages.map((l) => (l === 'es' ? t('common.spanish') : t('common.english'))).join(' / ')}
                      </Meta>
                    </View>
                    <Chip label={c.acceptedInvitation ? t('caregivers.accepted') : t('caregivers.pending')} tone={c.acceptedInvitation ? 'good' : 'caution'} dense />
                  </Row>
                  <Row wrap>
                    {c.capabilities.map((k) => (
                      <Chip key={k} label={t(`capability.${k}`)} dense />
                    ))}
                  </Row>
                  <Hairline />
                  <Meta>{t('caregivers.availability')}</Meta>
                  {blocks.length === 0 ? <Muted>{t('common.none')}</Muted> : null}
                  {blocks.map((b) => (
                    <Row key={b.id}>
                      <StatusDot tone={b.confirmed ? 'good' : 'caution'} />
                      <Body>{f.range(b.startAt, b.endAt)}</Body>
                      <Meta>{b.confirmed ? t('caregiverApp.confirmedHours') : t('caregivers.pending')}</Meta>
                    </Row>
                  ))}
                  {!c.acceptedInvitation ? (
                    <View style={styles.invite}>
                      <Meta>{t('caregivers.invite')}</Meta>
                      <Body weight="medium" selectable>
                        {c.inviteCode}
                      </Body>
                      <Meta>{t('caregivers.inviteHelp')}</Meta>
                    </View>
                  ) : null}
                </Card>
              );
            })}
            {adding ? (
              <AddCaregiverForm
                dischargeAt={plan.patient.dischargeAt}
                timezone={plan.patient.timezone}
                defaultLanguage={plan.patient.preferredLanguage}
                busy={busy}
                onCancel={() => setAdding(false)}
                onSubmit={(input, blocks) =>
                  run(async () => {
                    await addCaregiver(repo, plan.patient.id, input, blocks);
                    setAdding(false);
                    await reload();
                  })
                }
              />
            ) : null}
          </Section>

          {plan.serviceRequests.length ? (
            <Section title={t('caregivers.requests')}>
              {plan.serviceRequests.map((r) => (
                <Card key={r.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Body weight="medium">{matches?.find((m) => m.provider.id === r.providerId)?.provider.companyName ?? r.providerId}</Body>
                      <Meta>
                        {f.range(r.windowStart, r.windowEnd)} · {f.money(r.quotedCost)}
                      </Meta>
                    </View>
                    <Chip label={r.status === 'provider_confirmed' ? t('caregivers.confirmed') : r.status === 'declined' ? t('caregivers.declined') : r.status === 'cancelled' ? t('common.cancel') : t('caregivers.requested')} tone={r.status === 'provider_confirmed' ? 'good' : r.status === 'requested' ? 'caution' : 'neutral'} dense />
                  </Row>
                  {r.status === 'requested' ? (
                    <Row wrap>
                      <Button label={t('caregivers.simulate')} variant="ghost" compact onPress={() => setSimulating(r)} />
                      <Meta>{t('caregivers.simulateNote')}</Meta>
                    </Row>
                  ) : null}
                </Card>
              ))}
            </Section>
          ) : null}

          <Section title={t('caregivers.matches')}>
            <Muted>{t('caregivers.matchesIntro')}</Muted>
            {gapsNeedingHelp.length ? (
              <Row wrap>
                <Chip label={t('caregivers.allGaps')} selected={!forGap} onPress={() => loadMatches(undefined)} dense />
                {gapsNeedingHelp.map((g) => (
                  <Chip key={g.id} label={t(`resources.groups.${g.gapType}`)} meta={g.windowStart ? f.day(g.windowStart) : undefined} selected={forGap?.id === g.id} onPress={() => loadMatches(g)} dense />
                ))}
              </Row>
            ) : null}
            {forGap ? <Meta>{t('caregivers.forGap', { gap: t(forGap.descriptionKey, { ...forGap.descriptionParams, defaultValue: forGap.description }) })}</Meta> : null}
            {matches === null ? <Muted>{t('common.loading')}</Muted> : null}
            {matches?.length === 0 ? (
              <Card>
                <Muted>{t('caregivers.noMatches')}</Muted>
              </Card>
            ) : null}
            {matches?.map((m) => (
              <ProviderCard
                key={m.provider.id}
                match={m}
                timezone={plan.patient.timezone}
                request={plan.serviceRequests.find((r) => r.providerId === m.provider.id && r.status !== 'cancelled' && r.status !== 'declined' && (!forGap || r.gapId === forGap.id))}
                onRequest={setPendingRequest}
                busy={busy}
              />
            ))}
          </Section>

          <ConfirmSheet
            visible={!!pendingRequest}
            title={t('caregivers.request')}
            body={pendingRequest ? `${pendingRequest.provider.companyName} · ${t('caregivers.estimate', { amount: pendingRequest.estimatedCost })} · ${t('common.hypothetical')}` : undefined}
            confirmLabel={t('caregivers.request')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setPendingRequest(null)}
            onConfirm={() => {
              const m = pendingRequest;
              setPendingRequest(null);
              if (!m) return;
              void run(async () => {
                await requestService(repo, session, plan, m, forGap);
                await reload();
              });
            }}
          >
            <Muted>{t('caregivers.intro')}</Muted>
          </ConfirmSheet>

          <ConfirmSheet
            visible={!!simulating}
            title={t('caregivers.simulate')}
            body={t('caregivers.simulateNote')}
            confirmLabel={t('caregivers.simulateConfirm')}
            cancelLabel={t('caregivers.simulateDecline')}
            onCancel={() => {
              const r = simulating;
              setSimulating(null);
              if (!r) return;
              void run(async () => {
                await simulateProviderResponse(repo, r, 'declined');
                await reload();
              });
            }}
            onConfirm={() => {
              const r = simulating;
              setSimulating(null);
              if (!r) return;
              void run(async () => {
                await simulateProviderResponse(repo, r, 'provider_confirmed');
                await reload();
              });
            }}
          >
            <Button label={t('common.close')} variant="quiet" compact onPress={() => setSimulating(null)} />
          </ConfirmSheet>
        </Screen>
      ) : null}
    </PlanState>
  );
}

function AddCaregiverForm({
  dischargeAt,
  timezone,
  defaultLanguage,
  busy,
  onSubmit,
  onCancel,
}: {
  dischargeAt: string;
  timezone: string;
  defaultLanguage: Language;
  busy: boolean;
  onSubmit: (input: Parameters<typeof addCaregiver>[2], blocks: { startAt: string; endAt: string }[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [languages, setLanguages] = useState<Language[]>([defaultLanguage]);
  const [capabilities, setCapabilities] = useState<CaregiverCapability[]>(['supervision']);
  const [willing, setWilling] = useState(true);
  const [needsTranslation, setNeedsTranslation] = useState(false);
  const [blocks, setBlocks] = useState<{ startAt?: string; endAt?: string }[]>([{ startAt: dischargeAt, endAt: offsetFromDischarge(dischargeAt, 12) }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const f = useFmt(timezone);

  const submit = () => {
    const valid = blocks.filter((b) => b.startAt && b.endAt) as { startAt: string; endAt: string }[];
    const parsed = caregiverInputSchema.safeParse({ name, relationship, languages, capabilities, willingForAssigned: willing, needsTranslatedInstructions: needsTranslation, availability: valid });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[String(i.path[0])] ||= i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    const { availability, id: _id, ...rest } = parsed.data;
    onSubmit({ ...rest, profileId: undefined }, availability);
  };

  return (
    <Card>
      <Body weight="medium">{t('caregivers.add')}</Body>
      <Muted>{t('intake.d.intro')}</Muted>
      <Field label={t('intake.d.name')} error={errors.name}>
        <TextField value={name} onChangeText={setName} />
      </Field>
      <Field label={t('intake.d.relationship')} error={errors.relationship}>
        <TextField value={relationship} onChangeText={setRelationship} />
      </Field>
      <Field label={t('intake.d.languages')} error={errors.languages}>
        <MultiChoice
          options={[
            { value: 'en', label: t('common.english') },
            { value: 'es', label: t('common.spanish') },
          ]}
          value={languages}
          onChange={setLanguages}
        />
      </Field>
      <Field label={t('intake.d.capabilities')}>
        <MultiChoice options={CAPABILITIES.map((k) => ({ value: k, label: t(`capability.${k}`) }))} value={capabilities} onChange={setCapabilities} />
      </Field>
      <ToggleRow label={t('intake.d.willing')} value={willing} onChange={setWilling} />
      <ToggleRow label={t('intake.d.needsTranslation')} value={needsTranslation} onChange={setNeedsTranslation} />
      <Field label={t('intake.d.availability')}>
        <View style={{ gap: space.md }}>
          {blocks.map((b, i) => (
            <View key={i} style={styles.block}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Meta>{b.startAt && b.endAt ? f.range(b.startAt, b.endAt) : '—'}</Meta>
                <Button label={t('intake.d.remove')} variant="quiet" compact onPress={() => setBlocks(blocks.filter((_, n) => n !== i))} />
              </Row>
              <DateTimeField value={b.startAt} timezone={timezone} onChange={(v) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, startAt: v } : x)))} />
              <DateTimeField value={b.endAt} timezone={timezone} onChange={(v) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, endAt: v } : x)))} />
            </View>
          ))}
          <Button
            label={t('caregiverApp.addBlock')}
            variant="ghost"
            compact
            onPress={() => {
              const last = blocks[blocks.length - 1]?.endAt ?? dischargeAt;
              setBlocks([...blocks, { startAt: last, endAt: offsetFromDischarge(last, 12) }]);
            }}
          />
        </View>
      </Field>
      <View style={styles.actions}>
        <Button label={t('common.cancel')} variant="quiet" compact onPress={onCancel} />
        <Button label={t('common.save')} variant="hero" compact icon={Icons.Check} loading={busy} onPress={submit} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  invite: { gap: 2, padding: space.md, backgroundColor: colors.canvas, borderRadius: 4 },
  block: { gap: space.sm, padding: space.md, backgroundColor: colors.canvas, borderRadius: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md },
});
