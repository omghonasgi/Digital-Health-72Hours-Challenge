import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PlanState } from '@/features/PlanScreen';
import { TaskDetail } from '@/features/TaskDetail';
import { usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Screen } from '@/ui';

export default function CoordinatorTask() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const { plan, loading, error, reload } = usePlan(id);
  const task = plan?.tasks.find((x) => x.id === taskId);

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      <Screen title={t('tasks.detail')} subtitle={plan?.patient.displayName} bottomInset={BOTTOM_BAR_HEIGHT}>
        <Button label={t('common.back')} variant="quiet" compact onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/coordinator/patient/[id]', params: { id: id ?? '' } }))} />
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
