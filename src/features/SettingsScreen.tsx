import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Language } from '@/core/types';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Choice, ConfirmSheet, Field, KeyValue, Meta, Muted, Screen, Section, colors } from '@/ui';

/** Shared settings: language, account, data mode, demo reset. Same for all roles. */
export function SettingsScreen({ lead, extra }: { lead?: React.ReactNode; extra?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session, mode, changeLanguage, signOut, resetDemo } = useSession();
  const { busy, error, run } = useAction();
  const [confirmReset, setConfirmReset] = useState(false);
  const lang = (i18n.language === 'es' ? 'es' : 'en') as Language;

  return (
    <Screen title={t('settings.title')} bottomInset={BOTTOM_BAR_HEIGHT}>
      {lead}
      <Section title={t('settings.language')}>
        <Card>
          <Field label={t('common.language')} hint={t('settings.languageHelp')}>
            <Choice
              options={[
                { value: 'en', label: t('common.english') },
                { value: 'es', label: t('common.spanish') },
              ]}
              value={lang}
              onChange={(v) => void run(() => changeLanguage(v))}
            />
          </Field>
        </Card>
      </Section>

      {extra}

      <Section title={t('settings.account')}>
        <Card>
          <KeyValue k={t('auth.displayName')} v={session?.profile.displayName ?? '—'} />
          <KeyValue k={t('auth.role')} v={session ? t(`common.${session.profile.role}`) : '—'} />
          <Button
            label={t('common.signOut')}
            variant="ghost"
            compact
            loading={busy}
            onPress={() =>
              void run(async () => {
                await signOut();
                router.replace('/');
              })
            }
          />
        </Card>
      </Section>

      <Section title={t('settings.dataMode')}>
        <Card>
          <Body>{mode === 'local' ? t('auth.localMode') : t('auth.supabaseMode')}</Body>
          {mode === 'local' ? (
            <>
              <Muted>{t('settings.resetHelp')}</Muted>
              <Button label={t('settings.resetDemo')} variant="danger" compact onPress={() => setConfirmReset(true)} />
            </>
          ) : null}
        </Card>
      </Section>

      <Section title={t('settings.about')}>
        <Card>
          <Muted>{t('settings.aboutBody')}</Muted>
          <Meta>{t('landing.noAi')}</Meta>
        </Card>
      </Section>
      {error ? <Body color={colors.urgent}>{error}</Body> : null}

      <ConfirmSheet
        visible={confirmReset}
        title={t('settings.resetDemo')}
        body={t('settings.resetHelp')}
        confirmLabel={t('settings.resetDemo')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          void run(async () => {
            await resetDemo();
            router.replace('/');
          });
        }}
      />
    </Screen>
  );
}
