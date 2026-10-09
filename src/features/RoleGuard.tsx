import React from 'react';
import { Redirect } from 'expo-router';
import type { Role, Session } from '@/core/types';
import { useSession } from '@/state/SessionProvider';
import { roleHome } from '@/state/routes';

/**
 * Route-level guard. This only decides what to render; the data layer
 * (LocalRepository access checks, Supabase RLS) is what actually protects
 * records. A guessed URL never yields another role's data.
 */
export function RoleGuard({ role, children }: { role: Role; children: (session: Session) => React.ReactNode }) {
  const { session } = useSession();
  if (!session) return <Redirect href="/sign-in" />;
  if (session.profile.role !== role) return <Redirect href={roleHome(session.profile.role)} />;
  return <>{children(session)}</>;
}
