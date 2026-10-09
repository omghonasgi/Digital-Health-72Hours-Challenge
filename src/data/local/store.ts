import type {
  AssistanceProgram,
  AssistanceRequest,
  Caregiver,
  CaregiverAvailability,
  ClinicalInstruction,
  ClinicalReview,
  DischargeDocument,
  Notification,
  Patient,
  PatientEquipment,
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
  tasks: [],
  taskEvents: [],
  notifications: [],
  reviews: [],
});
