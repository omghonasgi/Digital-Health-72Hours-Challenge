import React from 'react';
import { Slot } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGuard } from '@/features/RoleGuard';
import { Icons, Shell, type NavItem } from '@/ui';

export default function CoordinatorLayout() {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { href: '/coordinator', label: t('nav.patients'), icon: Icons.Users },
    { href: '/coordinator/settings', label: t('nav.settings'), icon: Icons.Settings },
  ];
  return (
    <RoleGuard role="coordinator">
      {(session) => (
        <Shell items={items} who={session.profile.displayName} roleLabel={t('common.coordinator')}>
          <Slot />
        </Shell>
      )}
    </RoleGuard>
  );
}
