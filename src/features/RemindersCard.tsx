import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Patient, RecoveryTask } from '@/core/types';
import { useReminderControls } from '@/notifications/useReminders';
import { useAction } from '@/state/usePlan';
import { Body, Button, Card, Glyph, Icons, Meta, Muted, Row, StatusDot, colors } from '@/ui';

/** Phone reminder status for the signed-in patient or caregiver, with a one-tap sample for demos. */
export function RemindersCard({ tasks, patients, onStartLive }: { tasks: RecoveryTask[]; patients: Pick<Patient, 'id' | 'displayName' | 'timezone'>[]; /** Demo only: move the recovery window to start now. */ onStartLive?: () => Promise<void> }) {
  const { t } = useTranslation();
  const r = useReminderControls(tasks, patients);
  const { busy, error, run } = useAction();
  return (
    <Card>
      <Row>
        <Glyph icon={Icons.Bell} size={20} color={colors.blue} />
        <Body weight="medium" style={{ flex: 1 }}>
          {t('reminders.title')}
        </Body>
      </Row>
      {!r.supported ? (
        <Muted>{t('reminders.unsupported')}</Muted>
      ) : r.status === 'granted' ? (
        <>
          <Row>
            <StatusDot tone="good" />
            <Muted>{t('reminders.scheduled', { count: r.scheduled })}</Muted>
          </Row>
          <Meta>{t('reminders.how')}</Meta>
          {r.canPreview ? <Button label={t('reminders.preview')} variant="ghost" compact loading={busy} onPress={() => void run(r.preview)} /> : null}
          {onStartLive ? (
            <>
              <Button label={t('reminders.startLive')} variant="ghost" compact loading={busy} onPress={() => void run(onStartLive)} />
              <Meta>{t('reminders.startLiveNote')}</Meta>
            </>
          ) : null}
          {error ? <Muted>{error}</Muted> : null}
        </>
      ) : (
        <>
          <Row>
            <StatusDot tone="caution" />
            <Muted style={{ flex: 1 }}>{t(r.status === 'denied' ? 'reminders.denied' : 'reminders.off')}</Muted>
          </Row>
          {r.status !== 'denied' ? <Button label={t('reminders.enable')} variant="hero" compact loading={busy} onPress={() => void run(r.enable)} /> : null}
        </>
      )}
    </Card>
  );
}
