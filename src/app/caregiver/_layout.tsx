import React from 'react';
import { Slot } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGuard } from '@/features/RoleGuard';
import { Icons, Shell, type NavItem } from '@/ui';

export default function CaregiverLayout() {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { href: '/caregiver', label: t('nav.tasks'), icon: Icons.ClipboardList },
    { href: '/caregiver/availability', label: t('nav.availability'), icon: Icons.Calendar },
    { href: '/caregiver/instructions', label: t('nav.instructions'), icon: Icons.FileText },
    { href: '/caregiver/settings', label: t('nav.settings'), icon: Icons.Settings },
  ];
  return (
    <RoleGuard role="caregiver">
      {(session) => (
        <Shell items={items} who={session.profile.displayName} roleLabel={t('common.caregiver')}>
          <Slot />
        </Shell>
      )}
    </RoleGuard>
  );
}
