import { makePlanCode, stubPatient } from '@/core/codes';
import type { Language, Profile, Role, Session } from '@/core/types';
import { newId } from '../repository';
import type { Store } from './store';
import { SIGNUP_ORG } from './seed';

/**
 * Demo-only authentication. Passwords are stored in plain text in the local
 * store because nothing here is real; in Supabase mode Supabase Auth is used.
 */
export class LocalAuth {
  constructor(private readonly store: Store, private readonly persist: () => Promise<void>) {}

  sessionFor(profileId: string): Session | null {
    const profile = this.store.profiles.find((p) => p.id === profileId);
    if (!profile) return null;
    const patient = this.store.patients.find((p) => p.profileId === profileId);
    const caregiver = this.store.caregivers.find((c) => c.profileId === profileId);
    return { profile, patientId: patient?.id, caregiverId: caregiver?.id };
  }

  signIn(email: string, password: string): Session | null {
    const acct = this.store.accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password);
    return acct ? this.sessionFor(acct.profileId) : null;
  }

  async signUp(input: { email: string; password: string; displayName: string; role: Role; preferredLanguage: Language }): Promise<Session> {
    if (this.store.accounts.some((a) => a.email.toLowerCase() === input.email.trim().toLowerCase())) throw new Error('An account with that email already exists.');
    const profile: Profile = {
      id: newId('prof'),
      authUserId: newId('auth'),
      role: input.role,
      displayName: input.displayName,
      preferredLanguage: input.preferredLanguage,
      // New accounts never see the seeded patients: a new coordinator starts with an empty queue.
      organizationId: SIGNUP_ORG,
      createdAt: new Date().toISOString(),
    };
    this.store.profiles.push(profile);
    this.store.accounts.push({ email: input.email.trim(), password: input.password, profileId: profile.id, label: `${profile.displayName} · ${profile.role}` });
    if (input.role === 'patient') {
      const id = newId('pat');
      this.store.patients.push(stubPatient(profile, id, makePlanCode(profile.displayName)));
    }
    await this.persist();
    return this.sessionFor(profile.id)!;
  }

  demoAccounts() {
    return this.store.accounts.filter((a) => a.email.endsWith('@demo.carebridge'));
  }
}
