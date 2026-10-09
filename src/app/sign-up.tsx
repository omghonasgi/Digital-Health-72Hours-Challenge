import React, { useState } from 'react';
import { useRouter, Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Language, Role } from '@/core/types';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { roleHome } from '@/state/routes';
import { Body, Button, Card, Choice, Field, Muted, Screen, TextField, colors } from '@/ui';

export default function SignUp() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('patient');
  const [lang, setLang] = useState<Language>('en');
  const { busy, error, run } = useAction();
  const valid = email.includes('@') && password.length >= 4 && displayName.trim().length > 0;

  return (
    <Screen displayTitle={t('auth.signUp')}>
      <Card style={{ maxWidth: 520 }}>
        <Field label={t('auth.displayName')}>
          <TextField value={displayName} onChangeText={setDisplayName} autoComplete="name" />
        </Field>
        <Field label={t('auth.email')}>
          <TextField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        </Field>
        <Field label={t('auth.password')}>
          <TextField value={password} onChangeText={setPassword} secureTextEntry />
        </Field>
        <Field label={t('auth.role')}>
          <Choice
            value={role}
            onChange={setRole}
            options={[
              { value: 'patient', label: t('common.patient') },
              { value: 'caregiver', label: t('common.caregiver') },
              { value: 'coordinator', label: t('common.coordinator') },
            ]}
          />
        </Field>
        <Field label={t('auth.preferredLanguage')}>
          <Choice
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: t('common.english') },
              { value: 'es', label: t('common.spanish') },
            ]}
          />
        </Field>
        {error ? <Body color={colors.urgent}>{error}</Body> : null}
        <Button
          label={t('auth.signUp')}
          variant="hero"
          disabled={!valid}
          loading={busy}
          onPress={() =>
            run(async () => {
              await signUp({ email, password, displayName: displayName.trim(), role, preferredLanguage: lang });
              router.replace(role === 'caregiver' ? '/invite' : roleHome(role));
            })
          }
        />
        <Muted>
          {t('auth.hasAccount')}{' '}
          <Link href="/sign-in">
            <Body color={colors.blue}>{t('auth.signIn')}</Body>
          </Link>
        </Muted>
      </Card>
    </Screen>
  );
}
