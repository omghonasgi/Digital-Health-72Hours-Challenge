import type {
  AssistanceProgram,
  AssistanceRequest,
  Caregiver,
  CaregiverAvailability,
  ClinicalInstruction,
  ClinicalReview,
  DischargeDocument,
  FamilyBill,
  InsuranceClaim,
  Notification,
  Patient,
  PatientEquipment,
  Payment,
  Profile,
  ProviderAvailability,
  ProviderCompany,
  RecoveryGap,
  RecoveryRequirement,
  RecoveryTask,
  ServiceRequest,
  TaskEvent,
} from '@/core/types';

export interface DemoAccount {
  email: string;
  password: string;
  profileId: string;
  label: string;
}

export interface Store {
  seedVersion: number;
  profiles: Profile[];
  accounts: DemoAccount[];
  patients: Patient[];
  equipment: PatientEquipment[];
  caregivers: Caregiver[];
  availability: CaregiverAvailability[];
  documents: DischargeDocument[];
  instructions: ClinicalInstruction[];
  requirements: RecoveryRequirement[];
  gaps: RecoveryGap[];
  providers: ProviderCompany[];
  providerAvailability: ProviderAvailability[];
  serviceRequests: ServiceRequest[];
  programs: AssistanceProgram[];
  assistanceRequests: AssistanceRequest[];
  bills: FamilyBill[];
  payments: Payment[];
  insuranceClaims: InsuranceClaim[];
  tasks: RecoveryTask[];
  taskEvents: TaskEvent[];
  notifications: Notification[];
  reviews: ClinicalReview[];
  lastReminderRun?: string;
}

export const emptyStore = (): Store => ({
  seedVersion: 0,
  profiles: [],
  accounts: [],
  patients: [],
  equipment: [],
  caregivers: [],
  availability: [],
  documents: [],
  instructions: [],
  requirements: [],
  gaps: [],
  providers: [],
  providerAvailability: [],
  serviceRequests: [],
  programs: [],
  assistanceRequests: [],
  bills: [],
  payments: [],
  insuranceClaims: [],
  tasks: [],
  taskEvents: [],
  notifications: [],
  reviews: [],
});
