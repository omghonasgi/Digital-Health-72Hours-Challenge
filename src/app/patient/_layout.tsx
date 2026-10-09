import React from 'react';
import { Slot } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGuard } from '@/features/RoleGuard';
import { Icons, Shell, type NavItem } from '@/ui';

export default function PatientLayout() {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { href: '/patient', label: t('nav.home'), icon: Icons.Home },
    { href: '/patient/calendar', label: t('nav.calendar'), icon: Icons.Calendar },
    { href: '/patient/readiness', label: t('nav.readiness'), icon: Icons.ClipboardList },
    { href: '/patient/resources', label: t('nav.resources'), icon: Icons.LayoutGrid },
    { href: '/patient/caregivers', label: t('nav.caregivers'), icon: Icons.HeartHandshake },
    { href: '/patient/finance', label: t('nav.finance'), icon: Icons.Wallet },
    { href: '/patient/settings', label: t('nav.settings'), icon: Icons.Settings },
  ];
  return (
    <RoleGuard role="patient">
      {(session) => (
        <Shell items={items} who={session.profile.displayName} roleLabel={t('common.patient')}>
          <Slot />
        </Shell>
      )}
    </RoleGuard>
  );
}
