import React from 'react';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarViews } from '@/features/CalendarViews';
import { PlanState } from '@/features/PlanScreen';
import { useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useNow, usePlan } from '@/state/usePlan';
import { WarningSigns } from '@/features/WarningSigns';
import { BOTTOM_BAR_HEIGHT, Screen, Stamp } from '@/ui';

export default function Calendar() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const now = useNow();
  const f = useFmt(plan?.patient.timezone ?? 'UTC');
  if (!session?.patientId) return <Redirect href="/patient" />;

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen title={t('calendar.title')} subtitle={t('calendar.startsAt', { when: f.dateTime(plan.patient.dischargeAt) })} aside={<Stamp label="72h" size={56} />} bottomInset={BOTTOM_BAR_HEIGHT}>
          <CalendarViews
            tasks={plan.tasks}
            conflicts={plan.conflicts}
            dischargeAt={plan.patient.dischargeAt}
            timezone={plan.patient.timezone}
            caregivers={plan.caregivers}
            now={now}
            reviewItems={plan.reviewItems}
            hrefFor={(task) => ({ pathname: '/patient/task/[id]', params: { id: task.id } })}
          />
          <WarningSigns instructions={plan.instructions} />
        </Screen>
      ) : null}
    </PlanState>
  );
}
