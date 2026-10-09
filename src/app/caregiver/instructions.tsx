import React from 'react';
import { useTranslation } from 'react-i18next';
import { InstructionCard } from '@/features/InstructionCard';
import { InstructionsEditor } from '@/features/InstructionsEditor';
import { PlanState } from '@/features/PlanScreen';
import { WarningSigns } from '@/features/WarningSigns';
import { useCaregiverView } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Card, Muted, Screen, Section } from '@/ui';

/** Proxy caregivers enter the full instruction list; others see only assigned-task instructions. */
export default function CaregiverInstructions() {
  const { t } = useTranslation();
  const { view, loading, error, reload } = useCaregiverView();
  const proxyPatient = view?.records.find((r) => r.proxyAccess);
  if (proxyPatient) return <InstructionsEditor patientId={proxyPatient.patientId} />;

  return (
    <PlanState loading={loading && !view} error={error} onRetry={reload}>
      {view ? (
        <Screen title={t('caregiverApp.instructions')} subtitle={t('caregiverApp.instructionsIntro')} bottomInset={BOTTOM_BAR_HEIGHT}>
          {view.patients.map((p) => {
            const list = view.instructions.filter((i) => i.patientId === p.id && i.category !== 'warning_signs');
            return (
              <Section key={p.id} title={t('caregiverApp.helping', { name: p.displayName })}>
                {list.length === 0 ? (
                  <Card>
                    <Muted>{t('common.noItems')}</Muted>
                  </Card>
                ) : null}
                {list.map((i) => (
                  <InstructionCard key={i.id} instruction={i} />
                ))}
                <WarningSigns instructions={view.instructions.filter((i) => i.patientId === p.id)} />
              </Section>
            );
          })}
          {view.patients.length === 0 ? (
            <Card>
              <Muted>{t('caregiverApp.noPatients')}</Muted>
            </Card>
          ) : null}
        </Screen>
      ) : null}
    </PlanState>
  );
}
