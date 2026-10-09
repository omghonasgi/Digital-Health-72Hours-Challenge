import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PayScreen } from '@/features/PayScreen';
import { PlanState } from '@/features/PlanScreen';
import { useCaregiverView } from '@/state/usePlan';
import { Card, Chip, Muted, Row } from '@/ui';

/** Caregivers see the family bill (never income or eligibility) and can pay part of it. */
export default function CaregiverPay() {
  const { t } = useTranslation();
  const { view, loading, error, reload } = useCaregiverView();
  const [picked, setPicked] = useState<string | null>(null);
  const patients = view?.patients ?? [];
  const patientId = picked ?? patients[0]?.id;

  return (
    <PlanState loading={loading && !view} error={error} onRetry={reload}>
      {patientId ? (
        <PayScreen
          key={patientId}
          patientId={patientId}
          publish={false}
          header={
            patients.length > 1 ? (
              <Row wrap>
                {patients.map((p) => (
                  <Chip key={p.id} label={p.displayName} selected={p.id === patientId} onPress={() => setPicked(p.id)} />
                ))}
              </Row>
            ) : (
              <Muted>{t('pay.forPatient', { name: patients[0]?.displayName ?? '' })}</Muted>
            )
          }
        />
      ) : (
        <Card>
          <Muted>{t('caregiverApp.noPatients')}</Muted>
        </Card>
      )}
    </PlanState>
  );
}
