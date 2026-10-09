import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Card, Meta, Muted, Row, Stamp, space } from '@/ui';

/** The plan code a patient shares so a caregiver can enter their information. */
export function AccessCodeCard({ code, compact }: { code: string; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start', gap: space.lg }}>
        <Stamp label="code" size={compact ? 52 : 64} rotate={-8} />
        <View style={{ flex: 1, gap: 4 }}>
          <Meta>{t('access.codeLabel')}</Meta>
          <Body size="large" weight="medium" selectable>
            {code}
          </Body>
          <Muted>{t('access.codeHelp')}</Muted>
        </View>
      </Row>
    </Card>
  );
}
