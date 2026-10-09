import React from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PlanState } from '@/features/PlanScreen';
import { TaskDetail } from '@/features/TaskDetail';
import { useSession } from '@/state/SessionProvider';
import { usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Screen } from '@/ui';

export default function PatientTask() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  if (!session?.patientId) return <Redirect href="/patient" />;
  const task = plan?.tasks.find((x) => x.id === id);

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      <Screen title={t('tasks.detail')} bottomInset={BOTTOM_BAR_HEIGHT}>
        <Button label={t('common.back')} variant="quiet" compact onPress={() => (router.canGoBack() ? router.back() : router.replace('/patient/calendar'))} />
        {plan && task ? (
          <TaskDetail task={task} timezone={plan.patient.timezone} caregivers={plan.caregivers} instruction={plan.instructions.find((i) => i.id === task.instructionId)} onChanged={() => void reload()} />
        ) : plan ? (
          <Card>
            <Body>{t('common.noItems')}</Body>
          </Card>
        ) : null}
      </Screen>
    </PlanState>
  );
}
