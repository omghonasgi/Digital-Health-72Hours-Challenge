/**
 * CareBridge domain model.
 *
 * Everything here is plain data. No React, no Supabase, no platform code —
 * so the engines in ./engines can run identically in the app, on the server,
 * and in tests.
 *
 * Times are ISO-8601 strings in UTC. Display-time conversion into the
 * patient's time zone happens at the edge (see ./time.ts).
 */

export type Role = 'patient' | 'caregiver' | 'coordinator';
export type Language = 'en' | 'es';

export type ISODate = string;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  authUserId: string;
  role: Role;
  displayName: string;
  preferredLanguage: Language;
  /** Coordinators belong to an organization; patients/caregivers inherit it. */
  organizationId?: string;
  createdAt: ISODate;
}

export type AgeRange = '18-34' | '35-49' | '50-64' | '65-74' | '75+';

export type InsuranceType =
  | 'medicaid'
  | 'medicare'
  | 'private'
  | 'marketplace'
  | 'uninsured'
  | 'other';

export type IncomeRange =
  | 'under_25k'
  | '25k_50k'
  | '50k_75k'
  | '75k_100k'
  | 'over_100k'
  | 'prefer_not_to_say';

export type RideStatus = 'confirmed' | 'pending' | 'none';

export interface HomeEnvironment {
  livesAlone: boolean;
  hasStairs: boolean;
  reliableFood: boolean;
  prescriptionConcern: boolean;
  accessibilityBarriers: boolean;
  accessibilityNotes?: string;
  rideHome: RideStatus;
  rideHomeNotes?: string;
  followUpTransport: RideStatus;
}

export interface FinancialConcerns {
  medications: boolean;
  equipment: boolean;
  caregiving: boolean;
  wantsAssistance: boolean;
}

export interface Patient {
  id: string;
  profileId: string;
  organizationId?: string;
  displayName: string;
  ageRange?: AgeRange;
  preferredLanguage: Language;
  zip: string;
  city?: string;
  procedureName: string;
  facility?: string;
  surgeryDate: ISODate;
  /** The actual or expected discharge instant. The 72h window anchors here. */
  dischargeAt: ISODate;
  timezone: string;
  insuranceType: InsuranceType;
  recoveryBudget: number;
  incomeRange: IncomeRange;
  financialConcerns: FinancialConcerns;
  homeEnvironment: HomeEnvironment;
  intakeCompletedAt?: ISODate;
  createdAt: ISODate;
}

export type EquipmentName =
  | 'walker'
  | 'crutches'
  | 'wheelchair'
  | 'shower_chair'
  | 'raised_toilet_seat'
  | 'cold_therapy'
  | 'wound_care_supplies'
  | 'other';

export type EquipmentAvailability = 'available' | 'can_borrow' | 'need_to_obtain' | 'unsure';

export interface PatientEquipment {
  id: string;
  patientId: string;
  equipmentName: EquipmentName;
  otherLabel?: string;
  availabilityStatus: EquipmentAvailability;
  /** Set when the patient confirms the item is physically in hand. */
  receivedAt?: ISODate;
}

export type CaregiverCapability = 'transport' | 'meals' | 'basic_tasks' | 'supervision';

export type ConsentStatus = 'pending' | 'granted' | 'revoked';

export interface Caregiver {
  id: string;
  patientId: string;
  /** Linked once the caregiver accepts their invitation and signs in. */
  profileId?: string;
  name: string;
  relationship: string;
  languages: Language[];
  capabilities: CaregiverCapability[];
  willingForAssigned: boolean;
  needsTranslatedInstructions: boolean;
  inviteCode: string;
  acceptedInvitation: boolean;
  consentStatus: ConsentStatus;
  createdAt: ISODate;
}

export interface CaregiverAvailability {
  id: string;
  caregiverId: string;
  startAt: ISODate;
  endAt: ISODate;
  /** Caregiver has confirmed this block after accepting the invitation. */
  confirmed: boolean;
}

// ---------------------------------------------------------------------------
// Clinical instructions (entered by hand, reviewed by a coordinator)
// ---------------------------------------------------------------------------

export type InstructionCategory =
  | 'medication'
  | 'mobility'
  | 'equipment'
  | 'caregiver'
  | 'transportation'
  | 'follow_up'
  | 'wound_care'
  | 'diet'
  | 'warning_signs'
  | 'check_in';

export type ReviewStatus = 'draft' | 'approved' | 'needs_clarification' | 'rejected';

export type DocumentStatus = 'uploaded' | 'manual_entry' | 'unreadable';

export interface DischargeDocument {
  id: string;
  patientId: string;
  fileName: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  extractionStatus: DocumentStatus;
  uploadedBy: string;
  uploadedAt: ISODate;
}

/**
 * Structured detail entered alongside the original instruction text.
 * Every field here must be present in the clinician's document — the entry
 * form asks the person typing it in to copy, not interpret. Anything the
 * document doesn't state explicitly is left undefined and the instruction
 * is flagged `timingExplicit: false`, which blocks calendar generation for it.
 */
export type StructuredRequirement =
  | {
      kind: 'medication';
      name: string;
      dose?: string;
      route?: string;
      frequencyHours?: number;
      firstDoseOffsetHours?: number;
      durationHours?: number;
      timingExplicit: boolean;
      asNeeded?: boolean;
    }
  | {
      kind: 'mobility';
      restriction: string;
      requiredEquipment: EquipmentName[];
      walkFrequencyHours?: number;
      wakingHoursOnly?: boolean;
      noStairs?: boolean;
    }
  | {
      kind: 'equipment';
      requiredEquipment: EquipmentName[];
      neededByOffsetHours: number;
    }
  | {
      kind: 'caregiver';
      supervisionStartOffsetHours: number;
      supervisionDurationHours: number;
      capabilities: CaregiverCapability[];
    }
  | {
      kind: 'transportation';
      purpose: 'ride_home' | 'follow_up';
      offsetHours: number;
      escortRequired: boolean;
    }
  | {
      kind: 'follow_up';
      offsetHours: number;
      location?: string;
      withWhom?: string;
      transportRequired: boolean;
    }
  | {
      kind: 'wound_care';
      /** Short clinician-language label shown as-is, e.g. "Ice packs", "Dressing change". */
      label?: string;
      frequencyHours?: number;
      firstOffsetHours?: number;
      durationHours?: number;
      wakingHoursOnly?: boolean;
      requiredEquipment: EquipmentName[];
      timingExplicit: boolean;
    }
  | {
      kind: 'diet';
      hydrationReminderHours?: number;
      mealReminderHours?: number;
      wakingHoursOnly?: boolean;
    }
  | {
      kind: 'warning_signs';
      signs: string[];
      emergencyInstruction: string;
    }
  | {
      kind: 'check_in';
      offsetsHours: number[];
    };

export interface ClinicalInstruction {
  id: string;
  patientId: string;
  documentId?: string;
  category: InstructionCategory;
  /** Verbatim text from the clinician document. Never translated in place. */
  originalText: string;
  sourcePage?: number;
  structured: StructuredRequirement;
  reviewStatus: ReviewStatus;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: ISODate;
  enteredBy: string;
  createdAt: ISODate;
}

// ---------------------------------------------------------------------------
// Readiness: requirements and gaps
// ---------------------------------------------------------------------------

export type GapCategory =
  | 'equipment'
  | 'caregiving'
  | 'transportation'
  | 'financial'
  | 'language'
  | 'medication_access'
  | 'scheduling'
  | 'home_accessibility';

export type GapStatus =
  | 'identified'
  | 'assigned'
  | 'assistance_requested'
  | 'awaiting_confirmation'
  | 'verified_resolved'
  | 'unresolved'
  | 'escalated';

export type RequirementStatus = 'met' | 'unmet' | 'pending' | 'review_required';

export interface RecoveryRequirement {
  id: string;
  patientId: string;
  instructionId: string;
  requirementType: GapCategory;
  description: string;
  requiredStart?: ISODate;
  requiredEnd?: ISODate;
  requiredResources: string[];
  requiredCapability?: CaregiverCapability;
  status: RequirementStatus;
}

export interface GapAction {
  /** i18n key under `actions.*` */
  key: string;
  /** Where in the app this action lives. */
  route?: string;
}

export interface RecoveryGap {
  id: string;
  patientId: string;
  requirementId: string;
  gapType: GapCategory;
  /** i18n key under `gaps.*`; params carry numbers so translation never changes them. */
  descriptionKey: string;
  descriptionParams?: Record<string, string | number>;
  /** English fallback, also what the database stores in `description`. */
  description: string;
  status: GapStatus;
  windowStart?: ISODate;
  windowEnd?: ISODate;
  estimatedCost?: number;
  actions: GapAction[];
  assignedCoordinator?: string;
  resolutionNotes?: string;
  updatedAt: ISODate;
}

export type ReadinessStatus =
  | 'no_reported_gaps'
  | 'gaps_identified'
  | 'assistance_being_arranged'
  | 'clinical_review_required';

// ---------------------------------------------------------------------------
// Providers, service requests, assistance programs
// ---------------------------------------------------------------------------

export type ProviderService =
  | 'supervision'
  | 'transport'
  | 'meals'
  | 'basic_tasks'
  | 'medication_pickup'
  | 'equipment_delivery';

export type VerificationStatus = 'verified' | 'pending' | 'unverified';

export interface ProviderCompany {
  id: string;
  companyName: string;
  /** ZIP prefixes (3 digits) the provider serves. */
  serviceAreaZipPrefixes: string[];
  serviceAreaLabel: string;
  languages: Language[];
  services: ProviderService[];
  qualifications: string[];
  hourlyRate: number;
  minimumHours: number;
  contactPhone: string;
  contactEmail: string;
  verificationStatus: VerificationStatus;
  /** Always true in this build. Providers are fictional. */
  isSimulated: true;
}

export interface ProviderAvailability {
  id: string;
  providerId: string;
  startAt: ISODate;
  endAt: ISODate;
}

export type ServiceRequestStatus =
  | 'requested'
  | 'provider_confirmed'
  | 'declined'
  | 'cancelled';

export interface ServiceRequest {
  id: string;
  patientId: string;
  providerId: string;
  requirementId?: string;
  gapId?: string;
  windowStart: ISODate;
  windowEnd: ISODate;
  quotedCost: number;
  status: ServiceRequestStatus;
  requestedAt: ISODate;
  confirmedAt?: ISODate;
}

export type AssistanceStatus =
  | 'potentially_eligible'
  | 'application_needed'
  | 'under_review'
  | 'approved'
  | 'unavailable';

export type FundingStatus = 'available' | 'limited' | 'unavailable';

export interface AssistanceProgram {
  id: string;
  programName: string;
  supportedServices: ResourceKind[];
  eligibility: {
    incomeRanges?: IncomeRange[];
    insuranceTypes?: InsuranceType[];
    zipPrefixes?: string[];
  };
  applicationRequirements: string;
  fundingStatus: FundingStatus;
  maxAward: number;
  contactPhone: string;
  isSimulated: true;
}

export interface AssistanceRequest {
  id: string;
  patientId: string;
  programId: string;
  requirementId?: string;
  requestedAmount: number;
  approvedAmount?: number;
  status: AssistanceStatus;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export type ResourceKind =
  | 'equipment'
  | 'medication'
  | 'caregiving'
  | 'transportation'
  | 'meals';

export type CostLineStatus = 'missing' | 'owned' | 'needs_verification' | 'uncovered' | 'arranged' | 'covered';

export interface CostLine {
  id: string;
  gapId?: string;
  requirementId?: string;
  kind: ResourceKind;
  /** i18n key under `resources.*` */
  labelKey: string;
  label: string;
  estimatedCost: number;
  alreadyOwned: boolean;
  insuranceCoverage: 'unknown' | 'likely' | 'none';
  assistanceProgramId?: string;
  assistanceStatus?: AssistanceStatus;
  confirmedFunding: number;
  remaining: number;
  status: CostLineStatus;
  /** Prices are hypothetical until a provider or program confirms them. */
  hypothetical: boolean;
}

export interface FinancialSummary {
  lines: CostLine[];
  totalEstimatedCost: number;
  budget: number;
  confirmedAssistance: number;
  potentialAssistance: number;
  confirmedFunding: number;
  remainingGap: number;
}

// ---------------------------------------------------------------------------
// Payments: CareBridge as the middle party (simulated)
//
// Programs and the family pay CareBridge; CareBridge pays each service. The
// bill is a snapshot the patient side publishes so caregivers can see and
// split the family share without reading income, budget or eligibility.
// ---------------------------------------------------------------------------

export interface FundingLeg {
  programId: string;
  programName: string;
  amount: number;
}

export interface PendingFunding {
  programId: string;
  programName: string;
  /** The most this program could take off the family share, if approved. */
  upTo: number;
  status: AssistanceStatus;
}

export interface BillItem {
  /** Same id as the cost line it was built from. */
  id: string;
  kind: ResourceKind;
  /** i18n key under `resources.*` */
  labelKey: string;
  label: string;
  /** Distinguishes items that share a label, e.g. the medication name on a copay. */
  detail?: string;
  total: number;
  hypothetical: boolean;
  /** False while the service still needs booking (e.g. caregiving with no confirmed provider). */
  payable: boolean;
  payeeName: string;
  payeeProviderId?: string;
  /** Approved program money CareBridge collects for this item. */
  programLegs: FundingLeg[];
  /** Programs that might still cover part of it. Never subtracted. */
  pending: PendingFunding[];
  familyShare: number;
}

export interface FamilyBill {
  id: string;
  patientId: string;
  items: BillItem[];
  updatedAt: ISODate;
  isSimulated: true;
}

export type PaymentMethod = 'card' | 'hsa_fsa';

/** A family member's payment to CareBridge. Immutable once written. No full card number is ever stored. */
export interface Payment {
  id: string;
  patientId: string;
  payerProfileId: string;
  payerName: string;
  amount: number;
  method: PaymentMethod;
  cardBrand: string;
  last4: string;
  status: 'succeeded';
  createdAt: ISODate;
  isSimulated: true;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskCategory =
  | 'medication'
  | 'mobility'
  | 'wound_care'
  | 'meals_hydration'
  | 'caregiver_assistance'
  | 'equipment'
  | 'transportation'
  | 'follow_up'
  | 'check_in';

export type TaskStatus =
  | 'scheduled'
  | 'awaiting_resources'
  | 'assigned'
  | 'in_progress'
  | 'patient_reported_complete'
  | 'caregiver_reported_complete'
  | 'verified_complete'
  | 'missed'
  | 'blocked'
  | 'escalated';

export type AssignedRole = 'patient' | 'family_caregiver' | 'professional_caregiver' | 'coordinator';

export type TaskPriority = 'critical' | 'high' | 'normal';

export interface RecoveryTask {
  id: string;
  patientId: string;
  instructionId: string;
  requirementId?: string;
  category: TaskCategory;
  /** i18n key under `tasks.*`; params include doses/times so translation can't alter them. */
  titleKey: string;
  titleParams: Record<string, string | number>;
  title: string;
  description: string;
  /** Verbatim clinician text this task came from. Always shown in original form. */
  sourceText: string;
  scheduledAt: ISODate;
  dueAt: ISODate;
  assignedRole: AssignedRole;
  assignedUserId?: string;
  /** Caregiver record id when assigned to a family caregiver. */
  assignedCaregiverId?: string;
  /** Service request id when assigned to a professional caregiver. */
  serviceRequestId?: string;
  requiredResources: string[];
  priority: TaskPriority;
  status: TaskStatus;
  verifiedBy?: string;
  completedAt?: ISODate;
  blockedReason?: string;
  createdAt: ISODate;
}

export type TaskEventType =
  | 'created'
  | 'resource_confirmed'
  | 'assignment_accepted'
  | 'started'
  | 'reported_complete'
  | 'verified'
  | 'missed'
  | 'blocked'
  | 'escalated'
  | 'reassigned'
  | 'resolved'
  | 'note';

export interface TaskEvent {
  id: string;
  taskId: string;
  actorId: string;
  actorRole: Role | 'system';
  eventType: TaskEventType;
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  notes?: string;
  createdAt: ISODate;
}

export interface Notification {
  id: string;
  recipientId: string;
  taskId?: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  message: string;
  status: 'unread' | 'read';
  createdAt: ISODate;
}

export type ReviewType = 'instruction_extraction' | 'readiness' | 'escalation';

export interface ClinicalReview {
  id: string;
  patientId: string;
  reviewerId: string;
  reviewType: ReviewType;
  status: 'open' | 'completed';
  notes?: string;
  reviewedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Derived, never persisted
// ---------------------------------------------------------------------------

export type ConflictType =
  | 'caregiver_unavailable'
  | 'equipment_missing'
  | 'transport_unconfirmed'
  | 'medication_unconfirmed'
  | 'service_unconfirmed'
  | 'unassigned_required_task';

export interface CalendarConflict {
  id: string;
  type: ConflictType;
  taskId?: string;
  gapId?: string;
  windowStart: ISODate;
  windowEnd: ISODate;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  message: string;
  actions: GapAction[];
}

export interface Interval {
  start: number;
  end: number;
}

export interface ProviderMatch {
  provider: ProviderCompany;
  /** Hours of the required window this provider can cover. */
  coveredHours: number;
  estimatedCost: number;
  withinBudget: boolean;
  languageMatch: boolean;
  /** i18n keys under `match.reasons.*` */
  reasons: string[];
  coveredWindows: Interval[];
}

export interface Session {
  profile: Profile;
  /** Patient record for patients; linked patient ids for caregivers. */
  patientId?: string;
  caregiverId?: string;
}
