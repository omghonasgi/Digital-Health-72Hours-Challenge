import type {
  AssistanceProgram,
  AssistanceRequest,
  Caregiver,
  CaregiverAvailability,
  ClinicalInstruction,
  ClinicalReview,
  DischargeDocument,
  FamilyBill,
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

/**
 * Persistence contract. Two implementations:
 *   - LocalRepository: in-memory + AsyncStorage, seeded with fictional demo data,
 *     enforces role-based access in code. Used for the hackathon demo and tests.
 *   - SupabaseRepository: Postgres via supabase-js; authorization is enforced by
 *     Row Level Security, never by the client.
 *
 * Every method is scoped by the session the repository was created with.
 */
export interface Repository {
  /**
   * A system-scoped view used only to re-run the deterministic plan after an
   * action by someone with narrow access (a caregiver accepting an invitation).
   * Local: full access. Supabase client: returns itself (the server performs
   * the refresh with a service role; see server/).
   */
  elevate(): Repository;

  // profiles
  getProfile(id: string): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<Profile>;
  listCoordinators(): Promise<Profile[]>;

  // patients
  getPatient(id: string): Promise<Patient | null>;
  getPatientByProfile(profileId: string): Promise<Patient | null>;
  /** Open to a signed-in caregiver: the plan code is the secret. */
  getPatientByAccessCode(code: string): Promise<Patient | null>;
  listPatients(): Promise<Patient[]>;
  savePatient(p: Patient): Promise<Patient>;

  // equipment
  listEquipment(patientId: string): Promise<PatientEquipment[]>;
  replaceEquipment(patientId: string, items: PatientEquipment[]): Promise<void>;
  saveEquipment(item: PatientEquipment): Promise<void>;

  // caregivers
  listCaregivers(patientId: string): Promise<Caregiver[]>;
  getCaregiver(id: string): Promise<Caregiver | null>;
  getCaregiverByInvite(code: string): Promise<Caregiver | null>;
  listCaregiversByProfile(profileId: string): Promise<Caregiver[]>;
  saveCaregiver(c: Caregiver): Promise<Caregiver>;
  deleteCaregiver(id: string): Promise<void>;
  listAvailability(caregiverIds: string[]): Promise<CaregiverAvailability[]>;
  replaceAvailability(caregiverId: string, blocks: CaregiverAvailability[]): Promise<void>;

  // documents and instructions
  listDocuments(patientId: string): Promise<DischargeDocument[]>;
  addDocument(doc: DischargeDocument, file?: { uri: string; bytes?: Uint8Array }): Promise<DischargeDocument>;
  listInstructions(patientId: string): Promise<ClinicalInstruction[]>;
  saveInstruction(i: ClinicalInstruction): Promise<ClinicalInstruction>;
  deleteInstruction(id: string): Promise<void>;

  // readiness
  listRequirements(patientId: string): Promise<RecoveryRequirement[]>;
  replaceRequirements(patientId: string, reqs: RecoveryRequirement[]): Promise<void>;
  listGaps(patientId: string): Promise<RecoveryGap[]>;
  replaceGaps(patientId: string, gaps: RecoveryGap[]): Promise<void>;
  saveGap(g: RecoveryGap): Promise<RecoveryGap>;

  // providers and programs (read-only reference data)
  listProviders(): Promise<ProviderCompany[]>;
  listProviderAvailability(): Promise<ProviderAvailability[]>;
  listServiceRequests(patientId: string): Promise<ServiceRequest[]>;
  saveServiceRequest(r: ServiceRequest): Promise<ServiceRequest>;
  listPrograms(): Promise<AssistanceProgram[]>;
  listAssistanceRequests(patientId: string): Promise<AssistanceRequest[]>;
  saveAssistanceRequest(a: AssistanceRequest): Promise<AssistanceRequest>;

  // payments (simulated; CareBridge is the middle party)
  /** Readable by the patient, their coordinators, and active caregivers. */
  getBill(patientId: string): Promise<FamilyBill | null>;
  /** Patient or coordinator only: publishes the current bill snapshot. */
  saveBill(b: FamilyBill): Promise<FamilyBill>;
  listPayments(patientId: string): Promise<Payment[]>;
  /** Anyone who can read the bill may pay toward it, only as themselves. Payments are never edited. */
  addPayment(p: Payment): Promise<Payment>;

  // tasks
  listTasks(patientId: string): Promise<RecoveryTask[]>;
  listTasksForCaregiver(caregiverId: string): Promise<RecoveryTask[]>;
  getTask(id: string): Promise<RecoveryTask | null>;
  replaceTasks(patientId: string, tasks: RecoveryTask[]): Promise<void>;
  saveTask(t: RecoveryTask): Promise<RecoveryTask>;
  listTaskEvents(taskId: string): Promise<TaskEvent[]>;
  addTaskEvent(e: TaskEvent): Promise<void>;

  // notifications and reviews
  listNotifications(recipientId: string): Promise<Notification[]>;
  addNotifications(n: Notification[]): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  addReview(r: ClinicalReview): Promise<void>;
  listReviews(patientId: string): Promise<ClinicalReview[]>;
}

export class AccessDenied extends Error {
  constructor(message = 'You are not authorized to access this record.') {
    super(message);
    this.name = 'AccessDenied';
  }
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
