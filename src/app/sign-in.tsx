import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Role } from '@/core/types';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { roleHome } from '@/state/routes';
import { Body, Button, Card, Chip, Field, Icons, Meta, Muted, Screen, Section, TextField, colors, space } from '@/ui';

export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signInDemo, demoAccounts, mode } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState(false);
  const { busy, run } = useAction();

  const roleOf = (label: string): Role => (label.includes('coordinator') ? 'coordinator' : label.includes('caregiver') ? 'caregiver' : 'patient');
  const iconFor = (label: string) => (roleOf(label) === 'coordinator' ? Icons.Stethoscope : roleOf(label) === 'caregiver' ? Icons.HeartHandshake : Icons.Home);

  return (
    <Screen displayTitle={t('auth.signIn')} subtitle={mode === 'local' ? t('auth.localMode') : t('auth.supabaseMode')}>
      <Card style={{ maxWidth: 520 }}>
        <Field label={t('auth.email')}>
          <TextField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        </Field>
        <Field label={t('auth.password')} error={invalid ? t('auth.invalid') : undefined}>
          <TextField value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        </Field>
        <Button
          label={t('auth.signIn')}
          variant="hero"
          loading={busy}
          onPress={() =>
            run(async () => {
              setInvalid(false);
              const s = await signIn(email, password);
              if (!s) setInvalid(true);
              else router.replace(roleHome(s.profile.role));
            })
          }
        />
        <View style={styles.links}>
          <Muted>{t('auth.noAccount')}</Muted>
          <Link href="/sign-up">
            <Body color={colors.blue}>{t('auth.signUp')}</Body>
          </Link>
        </View>
        <Link href="/invite">
          <Body color={colors.blue}>{t('auth.haveCode')}</Body>
        </Link>
      </Card>

      {demoAccounts.length ? (
        <Section title={t('auth.demoTitle')}>
          <Muted>{t('auth.demoBody')}</Muted>
          <View style={styles.demoRow}>
            {demoAccounts.map((a) => (
              <Chip
                key={a.profileId}
                label={a.label}
                icon={iconFor(a.label)}
                onPress={() =>
                  run(async () => {
                    const s = await signInDemo(a.profileId);
                    if (s) router.replace(roleHome(s.profile.role));
                  })
                }
              />
            ))}
          </View>
          <Meta>{t('common.simulated')} · password: demo</Meta>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  demoRow: { gap: space.sm, flexDirection: 'row', flexWrap: 'wrap' },
});
