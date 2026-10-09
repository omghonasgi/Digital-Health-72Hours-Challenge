import AsyncStorage from '@react-native-async-storage/async-storage';
import { makePlanCode, stubPatient } from '@/core/codes';
import type { Language, Profile, Role, Session } from '@/core/types';
import { newId } from './repository';
import { LocalAuth } from './local/LocalAuth';
import { LocalRepository } from './local/LocalRepository';
import { primeDemoStore } from './local/prime';
import { buildDemoStore } from './local/seed';
import { AsyncStorageAdapter } from './local/storage';
import type { Store } from './local/store';
import type { Repository } from './repository';
import { getSupabase, supabaseConfigured } from './supabase/client';
import { SupabaseRepository } from './supabase/SupabaseRepository';

export type DataMode = 'local' | 'supabase';

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  preferredLanguage: Language;
}

export interface DataLayer {
  mode: DataMode;
  init(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  /** Local mode only. */
  signInDemo(profileId: string): Promise<Session | null>;
  demoAccounts(): { email: string; label: string; profileId: string }[];
  repoFor(session: Session | null): Repository;
  /** Local mode only: restore the fictional starting state. */
  resetDemo(): Promise<void>;
  /** Re-reads the session's patient/caregiver links after intake or invitation changes. */
  refreshSession(session: Session): Promise<Session>;
}

/** `EXPO_PUBLIC_DATA_MODE=supabase` plus Supabase env vars switches modes; default is the on-device demo. */
export function resolveMode(): DataMode {
  const wanted = process.env.EXPO_PUBLIC_DATA_MODE;
  return wanted === 'supabase' && supabaseConfigured() ? 'supabase' : 'local';
}

const SESSION_KEY = 'carebridge.session.profileId';

function createLocal(): DataLayer {
  const storage = new AsyncStorageAdapter();
  let store: Store = buildDemoStore();
  let auth = new LocalAuth(store, () => storage.save(store));

  return {
    mode: 'local',
    async init() {
      const loaded = await storage.load();
      if (loaded) store = loaded;
      else {
        await primeDemoStore(store);
        await storage.save(store);
      }
      auth = new LocalAuth(store, () => storage.save(store));
      const pid = await AsyncStorage.getItem(SESSION_KEY);
      return pid ? auth.sessionFor(pid) : null;
    },
    async signIn(email, password) {
      const s = auth.signIn(email, password);
      if (s) await AsyncStorage.setItem(SESSION_KEY, s.profile.id);
      return s;
    },
    async signUp(input) {
      const s = await auth.signUp(input);
      await AsyncStorage.setItem(SESSION_KEY, s.profile.id);
      return s;
    },
    async signOut() {
      await AsyncStorage.removeItem(SESSION_KEY);
    },
    async signInDemo(profileId) {
      const s = auth.sessionFor(profileId);
      if (s) await AsyncStorage.setItem(SESSION_KEY, profileId);
      return s;
    },
    demoAccounts: () => auth.demoAccounts(),
    repoFor: (session) => new LocalRepository(store, session, storage),
    async resetDemo() {
      await storage.clear();
      store = buildDemoStore();
      await primeDemoStore(store);
      await storage.save(store);
      auth = new LocalAuth(store, () => storage.save(store));
      await AsyncStorage.removeItem(SESSION_KEY);
    },
    async refreshSession(session) {
      return auth.sessionFor(session.profile.id) ?? session;
    },
  };
}

function createSupabase(): DataLayer {
  const db = getSupabase();
  const repo = new SupabaseRepository(db);

  async function sessionFromAuth(): Promise<Session | null> {
    const { data } = await db.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const { data: prof } = await db.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle();
    if (!prof) return null;
    const profile: Profile = {
      id: prof.id,
      authUserId: prof.auth_user_id,
      role: prof.role,
      displayName: prof.display_name,
      preferredLanguage: prof.preferred_language,
      organizationId: prof.organization_id ?? undefined,
      createdAt: prof.created_at,
    };
    const [{ data: patient }, { data: caregiver }] = await Promise.all([
      db.from('patients').select('id').eq('profile_id', profile.id).maybeSingle(),
      db.from('caregivers').select('id').eq('profile_id', profile.id).maybeSingle(),
    ]);
    return { profile, patientId: patient?.id, caregiverId: caregiver?.id };
  }

  return {
    mode: 'supabase',
    init: sessionFromAuth,
    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) return null;
      return sessionFromAuth();
    },
    async signUp(input) {
      const { data, error } = await db.auth.signUp({ email: input.email, password: input.password });
      if (error || !data.user) throw new Error(error?.message ?? 'Sign-up failed');
      const { error: e2 } = await db.from('profiles').insert({
        auth_user_id: data.user.id,
        role: input.role,
        display_name: input.displayName,
        preferred_language: input.preferredLanguage,
      });
      if (e2) throw new Error(e2.message);
      if (input.role === 'patient') {
        const s0 = await sessionFromAuth();
        if (s0) {
          const stub = stubPatient(s0.profile, newId('pat'), makePlanCode(input.displayName));
          const { error: e3 } = await db.from('patients').insert({
            id: stub.id,
            profile_id: stub.profileId,
            organization_id: stub.organizationId ?? null,
            display_name: stub.displayName,
            preferred_language: stub.preferredLanguage,
            zip: stub.zip || '00000',
            procedure_name: stub.procedureName || '—',
            surgery_date: stub.surgeryDate,
            discharge_at: stub.dischargeAt,
            timezone: stub.timezone,
            insurance_type: stub.insuranceType,
            recovery_budget: stub.recoveryBudget,
            income_range: stub.incomeRange,
            financial_concerns: stub.financialConcerns,
            home_environment: stub.homeEnvironment,
            access_code: stub.accessCode,
          });
          if (e3) throw new Error(e3.message);
        }
      }
      const s = await sessionFromAuth();
      if (!s) throw new Error('Confirm your email, then sign in.');
      return s;
    },
    async signOut() {
      await db.auth.signOut();
    },
    signInDemo: async () => null,
    demoAccounts: () => [],
    repoFor: () => repo,
    resetDemo: async () => undefined,
    refreshSession: async (s) => (await sessionFromAuth()) ?? s,
  };
}

let layer: DataLayer | null = null;
export function getDataLayer(): DataLayer {
  if (!layer) layer = resolveMode() === 'supabase' ? createSupabase() : createLocal();
  return layer;
}
