import { LocalRepository, MemoryStorage } from '@/data/local/LocalRepository';
import { buildDemoStore, DEMO_IDS } from '@/data/local/seed';
import type { Store } from '@/data/local/store';
import type { Session } from '@/core/types';

export const FIXED_NOW = new Date('2026-10-09T15:00:00.000Z');

export function demoStore() {
  return buildDemoStore(FIXED_NOW);
}

export function sessionFor(store: Store, profileId: string): Session {
  const profile = store.profiles.find((p) => p.id === profileId)!;
  const patient = store.patients.find((p) => p.profileId === profileId);
  const caregiver = store.caregivers.find((c) => c.profileId === profileId);
  return { profile, patientId: patient?.id, caregiverId: caregiver?.id };
}

export function repoFor(store: Store, profileId: string) {
  const storage = new MemoryStorage();
  return { repo: new LocalRepository(store, sessionFor(store, profileId), storage), session: sessionFor(store, profileId) };
}

export const asMaria = (store: Store) => repoFor(store, DEMO_IDS.mariaProfile);
export const asJames = (store: Store) => repoFor(store, DEMO_IDS.jamesProfile);
export const asSofia = (store: Store) => repoFor(store, DEMO_IDS.sofiaProfile);
export const asJordan = (store: Store) => repoFor(store, DEMO_IDS.jordanProfile);
