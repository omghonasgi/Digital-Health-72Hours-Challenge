import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsScreen } from '@/features/SettingsScreen';
import { useSession } from '@/state/SessionProvider';
import { Button, Card, Muted, Section } from '@/ui';

export default function PatientSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  return (
    <SettingsScreen
      extra={
        <Section title={t('intake.title')}>
          <Card>
            <Muted>{t('home.intakeBody')}</Muted>
            <Button label={session?.patientId ? t('common.edit') : t('home.startIntake')} variant="ghost" compact onPress={() => router.push('/patient/intake')} />
            <Button label={t('instructions.title')} variant="ghost" compact onPress={() => router.push('/patient/instructions')} />
          </Card>
        </Section>
      }
    />
  );
}
