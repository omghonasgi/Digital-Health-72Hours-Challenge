import React, { useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { isPlanCode } from '@/core/codes';
import { redeemCode } from '@/core/usecases';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { Body, Button, Card, Field, Muted, Screen, TextField, ToggleRow, colors } from '@/ui';

/** Caregiver enters a patient plan code (full intake) or a task invite code. */
export default function Invite() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, repo, refreshSession } = useSession();
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState('');
  const [consent, setConsent] = useState(false);
  const { busy, error, run } = useAction();
  const planCode = useMemo(() => isPlanCode(code), [code]);

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
          <TextField value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="PLAN-MARIA" />
        </Field>
        {planCode ? (
          <Field label={t('auth.relationshipToPatient')} optional optionalLabel={t('common.optional')}>
            <TextField value={relationship} onChangeText={setRelationship} placeholder={t('common.caregiver')} />
          </Field>
        ) : null}
        <ToggleRow label={planCode ? t('auth.consentPlan') : t('auth.consent')} value={consent} onChange={setConsent} />
        {error ? <Body color={colors.urgent}>{error}</Body> : null}
        <Button
          label={t('auth.accept')}
          variant="hero"
          disabled={!consent || code.trim().length < 4}
          loading={busy}
          onPress={() =>
            run(async () => {
              const result = await redeemCode(repo, session, code, { relationship });
              await refreshSession();
              if (result.kind === 'plan' && result.patient && !result.patient.intakeCompletedAt) {
                router.replace(`/caregiver/intake?patientId=${result.patient.id}` as Href);
                return;
              }
              router.replace('/caregiver');
            })
          }
        />
      </Card>
    </Screen>
  );
}
