import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsScreen } from '@/features/SettingsScreen';
import { Button, Card, Muted, Section } from '@/ui';

export default function CaregiverSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SettingsScreen
      extra={
        <Section title={t('auth.inviteTitle')}>
          <Card>
            <Muted>{t('auth.inviteBody')}</Muted>
            <Button label={t('caregiverApp.enterCode')} variant="ghost" compact onPress={() => router.push('/invite')} />
          </Card>
        </Section>
      }
    />
  );
}
