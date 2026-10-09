import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PlanState } from '@/features/PlanScreen';
import { TaskDetail } from '@/features/TaskDetail';
import { useCaregiverView } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Screen } from '@/ui';

export default function CaregiverTask() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { view, loading, error, reload } = useCaregiverView();
  const task = view?.tasks.find((x) => x.id === id);
  const patient = task ? view?.patients.find((p) => p.id === task.patientId) : undefined;

  return (
    <PlanState loading={loading && !view} error={error} onRetry={reload}>
      <Screen title={t('tasks.detail')} bottomInset={BOTTOM_BAR_HEIGHT}>
        <Button label={t('common.back')} variant="quiet" compact onPress={() => (router.canGoBack() ? router.back() : router.replace('/caregiver'))} />
        {view && task && patient ? (
          <TaskDetail task={task} timezone={patient.timezone} caregivers={view.records} instruction={view.instructions.find((i) => i.id === task.instructionId)} onChanged={() => void reload()} />
        ) : view ? (
          <Card>
            <Body>{t('common.noItems')}</Body>
          </Card>
        ) : null}
      </Screen>
    </PlanState>
  );
}
