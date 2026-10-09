import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PlanState } from '@/features/PlanScreen';
import { useSession } from '@/state/SessionProvider';
import { useCaregiverView } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, Icons, Muted, Screen, Surface, colors, space } from '@/ui';

/** Patients this caregiver can fully manage after redeeming a plan code. */
export default function CaregiverPlan() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { view, loading, error, reload } = useCaregiverView();

  return (
    <PlanState loading={loading && !view} error={error} onRetry={reload}>
      {view ? (
        <Screen displayTitle={t('caregiverApp.greeting', { name: session?.profile.displayName.split(' ')[0] ?? '' })} title={t('caregiverApp.planTitle')} bottomInset={BOTTOM_BAR_HEIGHT}>
          {view.patients.length === 0 ? (
            <Surface tone="blueDeep" padded={space.xl} style={{ gap: space.lg }}>
              <Body size="large" color={colors.canvas}>
                {t('caregiverApp.noPatients')}
              </Body>
              <Body color={colors.canvasMuted}>{t('auth.inviteBody')}</Body>
              <Button label={t('caregiverApp.enterCode')} variant="hero" icon={Icons.ChevronRight} onPress={() => router.push('/invite')} />
            </Surface>
          ) : null}

          {view.patients.map((p) => {
            const record = view.records.find((r) => r.patientId === p.id);
            const proxy = !!record?.proxyAccess;
            return (
              <Card key={p.id}>
                <Body size="large" weight="medium">
                  {t('caregiverApp.helping', { name: p.displayName })}
                </Body>
                {proxy ? <Chip label={t('caregiverApp.proxyBadge')} tone="good" dense /> : null}
                {proxy && !p.intakeCompletedAt ? <Muted>{t('caregiverApp.waitingOnYou')}</Muted> : null}
                {proxy ? <Muted>{t('caregiverApp.planIntro')}</Muted> : <Muted>{t('caregiverApp.taskOnlyHint')}</Muted>}
                {proxy ? (
                  <>
                    <Button
                      label={p.intakeCompletedAt ? t('caregiverApp.editAssessment') : t('caregiverApp.enterTheirPlan', { name: p.displayName.split(' ')[0] })}
                      variant="hero"
                      compact
                      icon={Icons.ChevronRight}
                      onPress={() => router.push(`/caregiver/intake?patientId=${p.id}` as Href)}
                    />
                    <Button label={t('caregiverApp.enterInstructions')} variant="ghost" compact icon={Icons.ChevronRight} onPress={() => router.push('/caregiver/instructions')} />
                  </>
                ) : (
                  <Button label={t('caregiverApp.enterCode')} variant="ghost" compact onPress={() => router.push('/invite')} />
                )}
              </Card>
            );
          })}
        </Screen>
      ) : null}
    </PlanState>
  );
}
