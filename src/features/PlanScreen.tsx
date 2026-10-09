import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, Muted, Screen, colors, BOTTOM_BAR_HEIGHT, space } from '@/ui';

/** Loading / error / empty states shared by every plan-backed screen. */
export function PlanState({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry?: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Screen bottomInset={BOTTOM_BAR_HEIGHT}>
        <View style={{ paddingVertical: space.xxxl, alignItems: 'center', gap: space.md }}>
          <ActivityIndicator color={colors.blue} />
          <Muted>{t('common.loading')}</Muted>
        </View>
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen title={t('common.errorTitle')} bottomInset={BOTTOM_BAR_HEIGHT}>
        <Card>
          <Body>{error}</Body>
          {onRetry ? <Button label={t('common.retry')} variant="ghost" compact onPress={onRetry} /> : null}
        </Card>
      </Screen>
    );
  }
  return <>{children}</>;
}
