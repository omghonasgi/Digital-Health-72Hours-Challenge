import React, { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ProgramMatch } from '@/core/engines/finance';
import { requestAssistance } from '@/core/usecases';
import { FinanceTable } from '@/features/FinanceTable';
import { PlanState } from '@/features/PlanScreen';
import { useFmt } from '@/features/format';
import { assistanceTone } from '@/features/status';
import { useSession } from '@/state/SessionProvider';
import { useAction, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, ConfirmSheet, Hairline, Meta, Muted, Row, Screen, Section, Stamp, colors, space } from '@/ui';

export default function Finance() {
  const { t } = useTranslation();
  const { session, repo } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const { busy, error: actionError, run } = useAction();
  const f = useFmt(plan?.patient.timezone ?? 'UTC');
  const [applying, setApplying] = useState<ProgramMatch | null>(null);
  if (!session?.patientId) return <Redirect href="/patient" />;

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen
          title={t('finance.title')}
          subtitle={t('finance.intro')}
          aside={<Stamp label={plan.finance.remainingGap > 0 ? `gap ${f.money(plan.finance.remainingGap)}` : 'funded'} statusColor={plan.finance.remainingGap > 0 ? colors.caution : colors.good} size={72} />}
          bottomInset={BOTTOM_BAR_HEIGHT}
        >
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}
          <FinanceTable summary={plan.finance} timezone={plan.patient.timezone} />

          <Section title={t('finance.programs')}>
            <Muted>{t('finance.programsIntro')}</Muted>
            {plan.programs.length === 0 ? (
              <Card>
                <Muted>{t('common.noItems')}</Muted>
              </Card>
            ) : null}
            {plan.programs.map((pm) => {
              const existing = plan.assistanceRequests.find((r) => r.programId === pm.program.id);
              return (
                <Card key={pm.program.id}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Body weight="medium">{pm.program.programName}</Body>
                      <Meta>
                        {pm.program.supportedServices.map((s) => t(`resources.${s}`)).join(', ')} · {t('finance.eligible', { amount: pm.program.maxAward })}
                      </Meta>
                    </View>
                    <Chip label={t(`assistanceStatus.${existing?.status ?? pm.status}`)} tone={assistanceTone(existing?.status ?? pm.status)} dense />
                  </Row>
                  <View style={{ gap: 2 }}>
                    {pm.reasons.map((r) => (
                      <Muted key={r}>· {t(r)}</Muted>
                    ))}
                  </View>
                  <Hairline />
                  <Meta>{t('finance.requirements')}</Meta>
                  <Muted>{pm.program.applicationRequirements}</Muted>
                  <Meta>
                    {pm.program.contactPhone} · {t('common.simulated')}
                  </Meta>
                  {existing ? (
                    <Row>
                      <Meta>
                        {t('finance.applied')} · {f.money(existing.requestedAmount)}
                        {existing.approvedAmount !== undefined ? ` · ${t('assistanceStatus.approved')} ${f.money(existing.approvedAmount)}` : ''}
                      </Meta>
                    </Row>
                  ) : pm.status !== 'unavailable' ? (
                    <Button label={t('finance.apply')} variant="hero" compact loading={busy} onPress={() => setApplying(pm)} />
                  ) : null}
                </Card>
              );
            })}
          </Section>

          <ConfirmSheet
            visible={!!applying}
            title={t('finance.apply')}
            body={applying ? `${applying.program.programName} · ${f.money(applying.suggestedAmount)}` : undefined}
            confirmLabel={t('finance.apply')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setApplying(null)}
            onConfirm={() => {
              const pm = applying;
              setApplying(null);
              if (!pm) return;
              void run(async () => {
                await requestAssistance(repo, session, plan, pm);
                await reload();
              });
            }}
          >
            <Muted style={{ paddingTop: space.xs }}>{t('finance.programsIntro')}</Muted>
          </ConfirmSheet>
        </Screen>
      ) : null}
    </PlanState>
  );
}
