import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Language, Session } from '@/core/types';
import { getDataLayer, type DataMode, type SignUpInput } from '@/data';
import type { Repository } from '@/data/repository';
import { setLanguage } from '@/i18n';

interface SessionContextValue {
  ready: boolean;
  mode: DataMode;
  session: Session | null;
  repo: Repository;
  signIn(email: string, password: string): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  signInDemo(profileId: string): Promise<Session | null>;
  demoAccounts: { email: string; label: string; profileId: string }[];
  refreshSession(): Promise<void>;
  changeLanguage(lang: Language): Promise<void>;
  resetDemo(): Promise<void>;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const layer = useMemo(() => getDataLayer(), []);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const apply = useCallback((s: Session | null) => {
    setSession(s);
    void setLanguage(s?.profile.preferredLanguage ?? 'en');
  }, []);

  useEffect(() => {
    let alive = true;
    layer
      .init()
      .then((s) => {
        if (alive) apply(s);
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [layer, apply]);

  const repo = useMemo(() => layer.repoFor(session), [layer, session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ready,
      mode: layer.mode,
      session,
      repo,
      async signIn(email, password) {
        const s = await layer.signIn(email, password);
        apply(s);
        return s;
      },
      async signUp(input) {
        const s = await layer.signUp(input);
        apply(s);
        return s;
      },
      async signOut() {
        await layer.signOut();
        apply(null);
      },
      async signInDemo(profileId) {
        const s = await layer.signInDemo(profileId);
        apply(s);
        return s;
      },
      demoAccounts: layer.demoAccounts(),
      async refreshSession() {
        if (session) apply(await layer.refreshSession(session));
      },
      async changeLanguage(lang) {
        await setLanguage(lang);
        if (session) {
          const profile = { ...session.profile, preferredLanguage: lang };
          await repo.saveProfile(profile);
          setSession({ ...session, profile });
        }
      },
      async resetDemo() {
        await layer.resetDemo();
        apply(null);
      },
    }),
    [ready, layer, session, repo, apply],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** The current session, asserting it exists (guarded layouts only). */
export function useRequiredSession() {
  const { session, repo } = useSession();
  if (!session) throw new Error('No session');
  return { session, repo };
}
