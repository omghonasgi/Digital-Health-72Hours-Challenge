import React from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { confirmResource } from '@/core/usecases';
import { PlanState } from '@/features/PlanScreen';
import { ReadinessReport } from '@/features/ReadinessReport';
import { ReadinessStamp } from '@/features/ReadinessStamp';
import { useSession } from '@/state/SessionProvider';
import { useAction, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Row, Screen, colors } from '@/ui';

export default function Readiness() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, repo } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const { busy, error: actionError, run } = useAction();
  if (!session?.patientId) return <Redirect href="/patient" />;

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen title={t('report.title')} aside={<ReadinessStamp status={plan.readiness} />} bottomInset={BOTTOM_BAR_HEIGHT}>
          <Row wrap>
            <Button label={t('instructions.title')} variant="ghost" compact onPress={() => router.push('/patient/instructions')} />
            <Button label={t('common.edit')} variant="quiet" compact onPress={() => router.push('/patient/intake')} />
          </Row>
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}
          <ReadinessReport
            plan={plan}
            confirming={busy}
            onConfirm={(gap) =>
              void run(async () => {
                await confirmResource(repo, session, gap);
                await reload();
              })
            }
          />
        </Screen>
      ) : null}
    </PlanState>
  );
}
