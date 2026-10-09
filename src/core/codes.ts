import type { Language, Patient, Profile } from './types';

export const makeInviteCode = (name: string) => {
  const stem = name.split(/\s+/)[0].replace(/[^a-z]/gi, '').toUpperCase().slice(0, 6) || 'CARE';
  return `${stem}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

/** Patient plan code. Sharing it is consent for a caregiver to enter the recovery assessment. */
export const makePlanCode = (name?: string) => {
  const stem = (name ?? '').split(/\s+/)[0].replace(/[^a-z]/gi, '').toUpperCase().slice(0, 6) || 'PLAN';
  return `PLAN-${stem}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

export const isPlanCode = (code: string) => code.trim().toUpperCase().startsWith('PLAN-');

export const normalizeCode = (code: string) => code.trim().toUpperCase();

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

/** Placeholder patient row created at signup so a plan code exists before any intake. */
export function stubPatient(profile: Profile, id: string, accessCode: string, now = new Date().toISOString()): Patient {
  const discharge = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    profileId: profile.id,
    organizationId: profile.organizationId,
    displayName: profile.displayName,
    preferredLanguage: profile.preferredLanguage as Language,
    zip: '',
    procedureName: '',
    surgeryDate: discharge,
    dischargeAt: discharge,
    timezone: defaultTimezone(),
    insuranceType: 'other',
    recoveryBudget: 0,
    incomeRange: 'prefer_not_to_say',
    financialConcerns: { medications: false, equipment: false, caregiving: false, wantsAssistance: false },
    homeEnvironment: {
      livesAlone: false,
      hasStairs: false,
      reliableFood: true,
      prescriptionConcern: false,
      accessibilityBarriers: false,
      rideHome: 'none',
      followUpTransport: 'none',
    },
    accessCode,
    createdAt: now,
  };
}
