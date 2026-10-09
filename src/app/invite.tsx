import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { acceptInvite } from '@/core/usecases';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { Body, Button, Card, Field, Muted, Screen, TextField, ToggleRow, colors } from '@/ui';

/** Caregiver invitation flow. Consent is explicit and recorded. */
export default function Invite() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, repo, refreshSession } = useSession();
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const { busy, error, run } = useAction();

  if (!session) {
    return (
      <Screen displayTitle={t('auth.inviteTitle')}>
        <Card style={{ maxWidth: 520 }}>
          <Muted>{t('auth.inviteBody')}</Muted>
          <Button label={t('auth.signUp')} variant="hero" onPress={() => router.push('/sign-up')} />
          <Button label={t('auth.signIn')} variant="ghost" onPress={() => router.push('/sign-in')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen displayTitle={t('auth.inviteTitle')} subtitle={t('auth.inviteBody')}>
      <Card style={{ maxWidth: 520 }}>
        <Field label={t('auth.inviteCode')}>
          <TextField value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="SOFIA-2026" />
        </Field>
        <ToggleRow label={t('auth.consent')} value={consent} onChange={setConsent} />
        {error ? <Body color={colors.urgent}>{error}</Body> : null}
        <Button
          label={t('auth.accept')}
          variant="hero"
          disabled={!consent || code.trim().length < 4}
          loading={busy}
          onPress={() =>
            run(async () => {
              await acceptInvite(repo, session, code);
              await refreshSession();
              router.replace('/caregiver');
            })
          }
        />
      </Card>
    </Screen>
  );
}
