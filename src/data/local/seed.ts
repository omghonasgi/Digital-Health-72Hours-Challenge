import { fromZonedTime } from 'date-fns-tz';
import type {
  AssistanceProgram,
  Caregiver,
  CaregiverAvailability,
  ClinicalInstruction,
  Patient,
  PatientEquipment,
  Profile,
  ProviderAvailability,
  ProviderCompany,
} from '@/core/types';
import { HOUR_MS, iso } from '@/core/time';
import { emptyStore, type Store } from './store';

/**
 * Fictional demo data. Every person, provider, program, price and clinical
 * instruction here is invented for the hackathon. Nothing is real.
 *
 * Dates are relative to "now" so the demo never goes stale: surgery is the
 * first Friday at least two days out, discharge 14:30 in the patient's zone.
 */

export const SEED_VERSION = 8;
export const DEMO_TZ = 'America/Chicago';
export const DEMO_ORG = 'org_lakeside';

export const DEMO_IDS = {
  maria: 'pat_maria',
  mariaProfile: 'prof_maria',
  james: 'pat_james',
  jamesProfile: 'prof_james',
  sofia: 'cg_sofia',
  sofiaProfile: 'prof_sofia',
  grace: 'cg_grace',
  graceProfile: 'prof_grace',
  jordanProfile: 'prof_jordan',
} as const;

function nextFriday(from: Date, minDaysOut = 2) {
  const d = new Date(from);
  d.setDate(d.getDate() + minDaysOut);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d;
}

/** Local wall-clock on a given day in the demo zone → UTC instant. */
function at(day: Date, hhmm: string, dayOffset = 0, tz = DEMO_TZ) {
  const d = new Date(day);
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return fromZonedTime(`${y}-${m}-${dd}T${hhmm}:00`, tz).toISOString();
}

export function buildDemoStore(now = new Date()): Store {
  const store = emptyStore();
  store.seedVersion = SEED_VERSION;
  const created = now.toISOString();
  const surgeryDay = nextFriday(now);
  const dischargeAt = at(surgeryDay, '14:30');

  // -- profiles and accounts --------------------------------------------------
  const profiles: Profile[] = [
    { id: DEMO_IDS.mariaProfile, authUserId: 'auth_maria', role: 'patient', displayName: 'Maria Rodriguez', preferredLanguage: 'es', organizationId: DEMO_ORG, createdAt: created },
    { id: DEMO_IDS.jamesProfile, authUserId: 'auth_james', role: 'patient', displayName: 'James Okafor', preferredLanguage: 'en', organizationId: DEMO_ORG, createdAt: created },
    { id: DEMO_IDS.sofiaProfile, authUserId: 'auth_sofia', role: 'caregiver', displayName: 'Sofia Rodriguez', preferredLanguage: 'en', organizationId: DEMO_ORG, createdAt: created },
    { id: DEMO_IDS.graceProfile, authUserId: 'auth_grace', role: 'caregiver', displayName: 'Grace Okafor', preferredLanguage: 'en', organizationId: DEMO_ORG, createdAt: created },
    { id: DEMO_IDS.jordanProfile, authUserId: 'auth_jordan', role: 'coordinator', displayName: 'Jordan Lee, RN', preferredLanguage: 'en', organizationId: DEMO_ORG, createdAt: created },
  ];
  store.profiles = profiles;
  store.accounts = [
    { email: 'maria@demo.carebridge', password: 'demo', profileId: DEMO_IDS.mariaProfile, label: 'Maria Rodriguez · patient' },
    { email: 'sofia@demo.carebridge', password: 'demo', profileId: DEMO_IDS.sofiaProfile, label: 'Sofia Rodriguez · caregiver' },
    { email: 'jordan@demo.carebridge', password: 'demo', profileId: DEMO_IDS.jordanProfile, label: 'Jordan Lee, RN · coordinator' },
    { email: 'james@demo.carebridge', password: 'demo', profileId: DEMO_IDS.jamesProfile, label: 'James Okafor · patient' },
  ];

  // -- patients ------------------------------------------------------------------
  const maria: Patient = {
    id: DEMO_IDS.maria,
    profileId: DEMO_IDS.mariaProfile,
    organizationId: DEMO_ORG,
    displayName: 'Maria Rodriguez',
    ageRange: '65-74',
    preferredLanguage: 'es',
    zip: '60623',
    city: 'Chicago',
    procedureName: 'Example outpatient knee procedure (knee arthroscopy)',
    facility: 'Lakeside Surgical Center',
    surgeryDate: at(surgeryDay, '09:00'),
    dischargeAt,
    timezone: DEMO_TZ,
    insuranceType: 'medicaid',
    recoveryBudget: 100,
    incomeRange: 'under_25k',
    financialConcerns: { medications: true, equipment: true, caregiving: true, wantsAssistance: true },
    homeEnvironment: {
      livesAlone: true,
      hasStairs: true,
      reliableFood: true,
      prescriptionConcern: true,
      accessibilityBarriers: false,
      rideHome: 'pending',
      rideHomeNotes: 'Friend Ana can pick up; not yet confirmed she can stay as the required escort.',
      followUpTransport: 'none',
    },
    intakeCompletedAt: created,
    createdAt: created,
  };
  const james: Patient = {
    id: DEMO_IDS.james,
    profileId: DEMO_IDS.jamesProfile,
    organizationId: DEMO_ORG,
    displayName: 'James Okafor',
    ageRange: '50-64',
    preferredLanguage: 'en',
    zip: '60615',
    city: 'Chicago',
    procedureName: 'Example outpatient knee procedure (knee arthroscopy)',
    facility: 'Lakeside Surgical Center',
    surgeryDate: at(surgeryDay, '11:00'),
    dischargeAt: at(surgeryDay, '16:00'),
    timezone: DEMO_TZ,
    insuranceType: 'private',
    recoveryBudget: 400,
    incomeRange: '75k_100k',
    financialConcerns: { medications: false, equipment: false, caregiving: false, wantsAssistance: false },
    homeEnvironment: {
      livesAlone: false,
      hasStairs: false,
      reliableFood: true,
      prescriptionConcern: false,
      accessibilityBarriers: false,
      rideHome: 'confirmed',
      followUpTransport: 'confirmed',
    },
    intakeCompletedAt: created,
    createdAt: created,
  };
  store.patients = [maria, james];

  // -- equipment -------------------------------------------------------------------
  const eq = (patientId: string, name: PatientEquipment['equipmentName'], status: PatientEquipment['availabilityStatus']): PatientEquipment => ({
    id: `eq_${patientId}_${name}`,
    patientId,
    equipmentName: name,
    availabilityStatus: status,
    receivedAt: status === 'available' ? created : undefined,
  });
  store.equipment = [
    eq(maria.id, 'crutches', 'available'),
    eq(maria.id, 'cold_therapy', 'available'),
    eq(maria.id, 'walker', 'need_to_obtain'),
    eq(maria.id, 'shower_chair', 'unsure'),
    eq(james.id, 'walker', 'available'),
    eq(james.id, 'cold_therapy', 'available'),
    eq(james.id, 'crutches', 'can_borrow'),
  ];

  // -- caregivers -------------------------------------------------------------------
  const sofia: Caregiver = {
    id: DEMO_IDS.sofia,
    patientId: maria.id,
    profileId: DEMO_IDS.sofiaProfile,
    name: 'Sofia Rodriguez',
    relationship: 'Daughter',
    languages: ['en', 'es'],
    capabilities: ['supervision', 'transport', 'meals', 'basic_tasks'],
    willingForAssigned: true,
    needsTranslatedInstructions: false,
    inviteCode: 'SOFIA-2026',
    acceptedInvitation: true,
    consentStatus: 'granted',
    createdAt: created,
  };
  const grace: Caregiver = {
    id: DEMO_IDS.grace,
    patientId: james.id,
    profileId: DEMO_IDS.graceProfile,
    name: 'Grace Okafor',
    relationship: 'Spouse',
    languages: ['en'],
    capabilities: ['supervision', 'transport', 'meals', 'basic_tasks'],
    willingForAssigned: true,
    needsTranslatedInstructions: false,
    inviteCode: 'GRACE-2026',
    acceptedInvitation: true,
    consentStatus: 'granted',
    createdAt: created,
  };
  store.caregivers = [sofia, grace];

  // Sofia: Friday evening through the night, Saturday evening onward, all of Sunday.
  // Unavailable Saturday 08:00–17:00 (work).
  const av = (caregiverId: string, start: string, end: string, n: number): CaregiverAvailability => ({
    id: `av_${caregiverId}_${n}`,
    caregiverId,
    startAt: start,
    endAt: end,
    confirmed: true,
  });
  store.availability = [
    av(sofia.id, at(surgeryDay, '18:00'), at(surgeryDay, '08:00', 1), 0),
    av(sofia.id, at(surgeryDay, '17:00', 1), at(surgeryDay, '07:00', 3), 1),
    av(grace.id, at(surgeryDay, '12:00'), at(surgeryDay, '23:59', 3), 0),
  ];

  // -- documents and clinician instructions -------------------------------------------
  store.documents = [
    {
      id: 'doc_maria_1',
      patientId: maria.id,
      fileName: 'Lakeside_Knee_Arthroscopy_Discharge_Instructions_DEMO.pdf',
      extractionStatus: 'manual_entry',
      uploadedBy: DEMO_IDS.jordanProfile,
      uploadedAt: created,
    },
    {
      id: 'doc_james_1',
      patientId: james.id,
      fileName: 'Lakeside_Knee_Arthroscopy_Discharge_Instructions_DEMO.pdf',
      extractionStatus: 'manual_entry',
      uploadedBy: DEMO_IDS.jordanProfile,
      uploadedAt: created,
    },
  ];

  const mkInstructions = (patient: Patient, docId: string, drafts: Set<string>): ClinicalInstruction[] => {
    const base = (id: string, category: ClinicalInstruction['category'], originalText: string, sourcePage: number, structured: ClinicalInstruction['structured']): ClinicalInstruction => ({
      id: `ins_${patient.id}_${id}`,
      patientId: patient.id,
      documentId: docId,
      category,
      originalText,
      sourcePage,
      structured,
      reviewStatus: drafts.has(id) ? 'draft' : 'approved',
      reviewedBy: drafts.has(id) ? undefined : DEMO_IDS.jordanProfile,
      reviewedAt: drafts.has(id) ? undefined : created,
      enteredBy: DEMO_IDS.jordanProfile,
      createdAt: created,
    });
    // Follow-up: Monday 10:00 local, expressed as hours after discharge.
    const followUpOffset = (Date.parse(at(surgeryDay, '10:00', 3)) - Date.parse(patient.dischargeAt)) / HOUR_MS;
    const firstDoseOffset = (Date.parse(at(surgeryDay, '18:00')) - Date.parse(patient.dischargeAt)) / HOUR_MS;
    const dressingOffset = (Date.parse(at(surgeryDay, '09:00', 1)) - Date.parse(patient.dischargeAt)) / HOUR_MS;
    return [
      base('supervision', 'caregiver', 'A responsible adult must stay with you for the first 24 hours after you are discharged.', 1, {
        kind: 'caregiver',
        supervisionStartOffsetHours: 0,
        supervisionDurationHours: 24,
        capabilities: ['supervision'],
      }),
      base('ride', 'transportation', 'You may not drive for 24 hours after anesthesia. A responsible adult must drive you home from the surgical center and remain with you.', 1, {
        kind: 'transportation',
        purpose: 'ride_home',
        offsetHours: 0,
        escortRequired: true,
      }),
      base('mobility', 'mobility', 'Use your walker for all walking during the first 3 days. Walk short distances every 2 hours while awake. Do not climb stairs without someone to assist you.', 2, {
        kind: 'mobility',
        restriction: 'Walker for all walking; no stairs without assistance',
        requiredEquipment: ['walker'],
        walkFrequencyHours: 2,
        wakingHoursOnly: true,
        noStairs: true,
      }),
      base('acetaminophen', 'medication', 'Acetaminophen 500 mg tablets: take 2 tablets (1000 mg) by mouth every 6 hours for the first 72 hours. Take the first dose at 6:00 PM on the day of surgery.', 2, {
        kind: 'medication',
        name: 'Acetaminophen',
        dose: '1000 mg (2 × 500 mg)',
        route: 'by mouth',
        frequencyHours: 6,
        firstDoseOffsetHours: Math.max(0, firstDoseOffset),
        durationHours: 72,
        timingExplicit: true,
      }),
      base('oxycodone', 'medication', 'Oxycodone 5 mg: take 1 tablet by mouth every 6 hours only as needed for severe pain not relieved by acetaminophen.', 2, {
        kind: 'medication',
        name: 'Oxycodone',
        dose: '5 mg',
        route: 'by mouth',
        frequencyHours: 6,
        timingExplicit: false,
        asNeeded: true,
      }),
      base('antibiotic', 'medication', 'Take your antibiotic as directed.', 2, {
        kind: 'medication',
        name: 'Antibiotic (name not specified)',
        timingExplicit: false,
      }),
      base('ice', 'wound_care', 'Apply ice packs to the knee for 20 minutes every 2 hours while awake for the first 48 hours.', 3, {
        kind: 'wound_care',
        label: 'Ice packs · 20 min',
        frequencyHours: 2,
        firstOffsetHours: 1,
        durationHours: 48,
        wakingHoursOnly: true,
        requiredEquipment: ['cold_therapy'],
        timingExplicit: true,
      }),
      base('dressing', 'wound_care', 'Keep the dressing clean and dry. Change the dressing once daily starting the morning after surgery. Dressing supplies are provided in your discharge bag.', 3, {
        kind: 'wound_care',
        label: 'Dressing change',
        frequencyHours: 24,
        firstOffsetHours: Math.max(0, dressingOffset),
        requiredEquipment: [],
        timingExplicit: true,
      }),
      base('diet', 'diet', 'Drink fluids regularly. Start with clear liquids and light meals on the day of surgery, then resume your normal diet as tolerated.', 3, {
        kind: 'diet',
        hydrationReminderHours: 3,
        mealReminderHours: 5,
        wakingHoursOnly: true,
      }),
      base('followup', 'follow_up', 'Follow-up appointment with Dr. Patel at the Lakeside Orthopedic Clinic on Monday at 10:00 AM. You may not drive yourself.', 4, {
        kind: 'follow_up',
        offsetHours: followUpOffset,
        location: 'Lakeside Orthopedic Clinic',
        withWhom: 'Dr. Patel',
        transportRequired: true,
      }),
      base('warning', 'warning_signs', 'Call the clinic at (555) 010-0199 for fever over 101°F, calf pain or swelling, bleeding that soaks through the dressing, or numbness in the foot. Call 911 for chest pain or trouble breathing.', 4, {
        kind: 'warning_signs',
        signs: ['Fever over 101°F', 'Calf pain or swelling', 'Bleeding that soaks through the dressing', 'Numbness in the foot', 'Chest pain or trouble breathing (call 911)'],
        emergencyInstruction: 'Call 911 for chest pain or trouble breathing. For other concerns call the clinic at (555) 010-0199.',
      }),
      base('checkin', 'check_in', 'A nurse will call to check on you at 24, 48 and 72 hours after discharge.', 4, {
        kind: 'check_in',
        offsetsHours: [24, 48, 72],
      }),
    ];
  };

  // Maria still has two instructions awaiting review: the ambiguous antibiotic
  // line (should be sent back for clarification) and the follow-up (approve).
  store.instructions = [
    ...mkInstructions(maria, 'doc_maria_1', new Set(['antibiotic', 'followup'])),
    ...mkInstructions(james, 'doc_james_1', new Set(['antibiotic'])),
  ];

  // -- providers (fictional) --------------------------------------------------------------
  store.providers = buildProviders();
  store.providerAvailability = buildProviderAvailability(store.providers, surgeryDay);

  // -- assistance programs (fictional) ---------------------------------------------------
  store.programs = buildPrograms();

  return store;
}

function buildProviders(): ProviderCompany[] {
  const p = (
    id: string,
    companyName: string,
    zips: string[],
    serviceAreaLabel: string,
    languages: ProviderCompany['languages'],
    services: ProviderCompany['services'],
    qualifications: string[],
    hourlyRate: number,
    minimumHours: number,
    verificationStatus: ProviderCompany['verificationStatus'],
  ): ProviderCompany => ({
    id,
    companyName,
    serviceAreaZipPrefixes: zips,
    serviceAreaLabel,
    languages,
    services,
    qualifications,
    hourlyRate,
    minimumHours,
    contactPhone: `(555) 01${id.slice(-1)}-0${Math.abs(hashCode(id)) % 900 + 100}`,
    contactEmail: `care@${id.replace('prov_', '')}.example`,
    verificationStatus,
    isSimulated: true,
  });
  return [
    p('prov_a1', 'Puente Home Care Collective', ['606', '605'], 'Chicago & near suburbs', ['en', 'es'], ['supervision', 'meals', 'basic_tasks', 'medication_pickup'], ['Certified nursing assistants', 'Background-checked'], 26, 4, 'verified'),
    p('prov_a2', 'Lakeshore Companion Services', ['606'], 'Chicago', ['en'], ['supervision', 'basic_tasks'], ['Companion care certificate'], 24, 3, 'verified'),
    p('prov_a3', 'Buen Camino Recovery Aides', ['606', '604'], 'Chicago & west suburbs', ['es', 'en'], ['supervision', 'transport', 'meals', 'basic_tasks'], ['Certified nursing assistants', 'CPR/First aid'], 30, 4, 'verified'),
    p('prov_a4', 'North Shore Elder Support', ['600', '602'], 'North suburbs', ['en'], ['supervision', 'meals', 'basic_tasks'], ['Home health aides'], 32, 4, 'verified'),
    p('prov_a5', 'Rapid Ride Medical Transport', ['606', '605', '604'], 'Chicagoland', ['en', 'es'], ['transport'], ['Wheelchair-accessible vehicles', 'Licensed drivers'], 35, 1, 'verified'),
    p('prov_a6', 'Casa Nutrida Meal Delivery', ['606'], 'Chicago', ['es', 'en'], ['meals'], ['Food-handler certified'], 15, 1, 'verified'),
    p('prov_a7', 'Guardian Overnight Sitters', ['606'], 'Chicago', ['en'], ['supervision'], ['Background-checked', 'CPR'], 22, 8, 'pending'),
    p('prov_a8', 'Loyola Street Helpers', ['606'], 'Chicago (south & west)', ['en', 'es'], ['basic_tasks', 'meals', 'medication_pickup'], ['Background-checked'], 20, 2, 'verified'),
    p('prov_a9', 'Prairie Mobility Rentals', ['606', '605', '604', '600'], 'Chicagoland', ['en', 'es'], ['equipment_delivery'], ['DME supplier (demo)'], 0, 1, 'verified'),
    p('prov_b1', 'Sunrise Post-Op Care', ['606'], 'Chicago', ['en'], ['supervision', 'basic_tasks', 'medication_pickup'], ['Licensed practical nurses'], 48, 4, 'verified'),
    p('prov_b2', 'Vecinos Unidos Volunteers', ['606'], 'Little Village & Pilsen', ['es', 'en'], ['transport', 'meals', 'medication_pickup'], ['Volunteer network (demo)'], 0, 1, 'pending'),
    p('prov_b3', 'Midwest Recovery Staffing', ['606', '605'], 'Chicago & suburbs', ['en'], ['supervision', 'basic_tasks'], ['Home health aides'], 29, 6, 'unverified'),
    p('prov_b4', 'Harbor Light Companions', ['606'], 'Chicago (north)', ['en'], ['supervision', 'meals'], ['Companion care certificate'], 27, 4, 'verified'),
    p('prov_b5', 'Hyde Park Home Aides', ['606'], 'Chicago (south)', ['en'], ['supervision', 'basic_tasks', 'meals'], ['Certified nursing assistants'], 28, 3, 'verified'),
    p('prov_b6', 'Comunidad Care Partners', ['606', '604'], 'Chicago & west suburbs', ['es', 'en'], ['supervision', 'transport', 'basic_tasks'], ['Certified nursing assistants', 'Background-checked'], 31, 4, 'verified'),
  ];
}

function buildProviderAvailability(providers: ProviderCompany[], surgeryDay: Date): ProviderAvailability[] {
  const out: ProviderAvailability[] = [];
  const push = (providerId: string, start: string, end: string) =>
    out.push({ id: `pav_${providerId}_${out.length}`, providerId, startAt: start, endAt: end });
  for (const p of providers) {
    switch (p.id) {
      case 'prov_a1': // Fri afternoon and Sat daytime
        push(p.id, at(surgeryDay, '13:00'), at(surgeryDay, '20:00'));
        push(p.id, at(surgeryDay, '07:00', 1), at(surgeryDay, '19:00', 1));
        push(p.id, at(surgeryDay, '08:00', 3), at(surgeryDay, '18:00', 3));
        break;
      case 'prov_a2': // Sat only
        push(p.id, at(surgeryDay, '08:00', 1), at(surgeryDay, '16:00', 1));
        break;
      case 'prov_a3': // All weekend
        push(p.id, at(surgeryDay, '12:00'), at(surgeryDay, '22:00'));
        push(p.id, at(surgeryDay, '06:00', 1), at(surgeryDay, '22:00', 1));
        push(p.id, at(surgeryDay, '06:00', 2), at(surgeryDay, '22:00', 2));
        break;
      case 'prov_a7': // nights only
        push(p.id, at(surgeryDay, '22:00'), at(surgeryDay, '07:00', 1));
        push(p.id, at(surgeryDay, '22:00', 1), at(surgeryDay, '07:00', 2));
        break;
      case 'prov_b1':
        push(p.id, at(surgeryDay, '08:00', 1), at(surgeryDay, '20:00', 1));
        break;
      case 'prov_b3':
      case 'prov_b4':
      case 'prov_b5':
      case 'prov_b6':
        push(p.id, at(surgeryDay, '14:00'), at(surgeryDay, '22:00'));
        push(p.id, at(surgeryDay, '08:00', 1), at(surgeryDay, '18:00', 1));
        break;
      case 'prov_a4':
        push(p.id, at(surgeryDay, '08:00', 1), at(surgeryDay, '18:00', 1));
        break;
      default: // transport, meals, equipment, volunteers: broadly available across the window
        push(p.id, at(surgeryDay, '06:00'), at(surgeryDay, '22:00', 3));
    }
  }
  return out;
}

function buildPrograms(): AssistanceProgram[] {
  const g = (
    id: string,
    programName: string,
    supportedServices: AssistanceProgram['supportedServices'],
    eligibility: AssistanceProgram['eligibility'],
    applicationRequirements: string,
    fundingStatus: AssistanceProgram['fundingStatus'],
    maxAward: number,
  ): AssistanceProgram => ({
    id,
    programName,
    supportedServices,
    eligibility,
    applicationRequirements,
    fundingStatus,
    maxAward,
    contactPhone: `(555) 020-0${100 + (Math.abs(hashCode(id)) % 800)}`,
    isSimulated: true,
  });
  return [
    g('prog_1', 'Lakeside Community DME Loan Closet (demo)', ['equipment'], { zipPrefixes: ['606'] }, 'Photo ID and a copy of the equipment instruction. Same-day pickup.', 'available', 150),
    g('prog_2', 'Cook County Recovery Assistance Fund (demo)', ['caregiving', 'transportation', 'meals'], { incomeRanges: ['under_25k', '25k_50k'], zipPrefixes: ['606', '605', '604'] }, 'Short application; proof of income range; decision within 2 business days.', 'limited', 300),
    g('prog_3', 'Medicaid Non-Emergency Medical Transportation (demo)', ['transportation'], { insuranceTypes: ['medicaid'] }, 'Call to schedule at least 2 business days before the appointment.', 'available', 100),
    g('prog_4', 'Pharmacy Copay Relief Partnership (demo)', ['medication'], { incomeRanges: ['under_25k', '25k_50k', '50k_75k'] }, 'Prescription and insurance card at participating pharmacies.', 'available', 60),
    g('prog_5', 'Vecinos Meal Bridge (demo)', ['meals'], { zipPrefixes: ['606'] }, 'Referral from a care coordinator.', 'available', 90),
    g('prog_6', 'Statewide Caregiver Respite Grant (demo)', ['caregiving'], { incomeRanges: ['under_25k', '25k_50k'] }, 'Application plus caregiver attestation; 1–2 weeks.', 'unavailable', 500),
  ];
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export const demoDischargeFor = (now = new Date()) => iso(Date.parse(at(nextFriday(now), '14:30')));
