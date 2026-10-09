import type { SupabaseClient } from '@supabase/supabase-js';
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
import { AccessDenied, type Repository } from '../repository';

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const toRow = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]));
const fromRow = <T>(r: Record<string, unknown>): T => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null).map(([k, v]) => [camel(k), v])) as T;

interface Query {
  eq?: Record<string, string>;
  in?: [string, string[]];
  order?: { col: string; ascending?: boolean };
}

/**
 * Postgres-backed repository. Column names are snake_case versions of the
 * domain fields (see supabase/migrations). Authorization is Row Level
 * Security on the server: this class does not filter by role. A denied read
 * returns no rows; a denied write raises AccessDenied.
 */
export class SupabaseRepository implements Repository {
  constructor(private readonly db: SupabaseClient) {}

  elevate(): Repository {
    return this; // The client never holds a service role. See server/ for the elevated path.
  }

  private async rows<T>(table: string, q: Query = {}): Promise<T[]> {
    let b = this.db.from(table).select('*');
    for (const [k, v] of Object.entries(q.eq ?? {})) b = b.eq(k, v);
    if (q.in) b = b.in(q.in[0], q.in[1]);
    if (q.order) b = b.order(q.order.col, { ascending: q.order.ascending ?? true });
    const { data, error } = await b;
    if (error) throw this.wrap(error);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => fromRow<T>(r));
  }

  private async one<T>(table: string, col: string, val: string): Promise<T | null> {
    const { data, error } = await this.db.from(table).select('*').eq(col, val).maybeSingle();
    if (error) throw this.wrap(error);
    return data ? fromRow<T>(data as Record<string, unknown>) : null;
  }

  private async upsert<T extends object>(table: string, item: T): Promise<T> {
    const { error } = await this.db.from(table).upsert(toRow(item));
    if (error) throw this.wrap(error);
    return item;
  }

  private async replace<T extends object>(table: string, where: Record<string, string>, items: T[]) {
    let del = this.db.from(table).delete();
    for (const [k, v] of Object.entries(where)) del = del.eq(k, v);
    const { error } = await del;
    if (error) throw this.wrap(error);
    if (items.length) {
      const { error: e2 } = await this.db.from(table).insert(items.map(toRow));
      if (e2) throw this.wrap(e2);
    }
  }

  private wrap(e: { message: string; code?: string }) {
    return e.code === '42501' || /row-level security/i.test(e.message) ? new AccessDenied(e.message) : new Error(e.message);
  }

  // profiles
  getProfile = (id: string) => this.one<Profile>('profiles', 'id', id);
  saveProfile = (p: Profile) => this.upsert('profiles', p);
  listCoordinators = () => this.rows<Profile>('profiles', { eq: { role: 'coordinator' } });

  // patients. RLS hides the base table from caregivers; `patient_logistics` is a
  // SECURITY DEFINER view that returns the same shape with finances blanked.
  getPatient = async (id: string) => (await this.one<Patient>('patients', 'id', id)) ?? this.one<Patient>('patient_logistics', 'id', id);
  getPatientByProfile = (profileId: string) => this.one<Patient>('patients', 'profile_id', profileId);
  listPatients = async () => {
    const full = await this.rows<Patient>('patients', { order: { col: 'surgery_date' } });
    if (full.length) return full;
    return this.rows<Patient>('patient_logistics', { order: { col: 'surgery_date' } });
  };
  savePatient = (p: Patient) => this.upsert('patients', p);

  // equipment
  listEquipment = (patientId: string) => this.rows<PatientEquipment>('patient_equipment', { eq: { patient_id: patientId } });
  replaceEquipment = (patientId: string, items: PatientEquipment[]) => this.replace('patient_equipment', { patient_id: patientId }, items);
  saveEquipment = async (item: PatientEquipment) => {
    await this.upsert('patient_equipment', item);
  };

  // caregivers
  listCaregivers = (patientId: string) => this.rows<Caregiver>('caregivers', { eq: { patient_id: patientId } });
  getCaregiver = (id: string) => this.one<Caregiver>('caregivers', 'id', id);
  getCaregiverByInvite = async (code: string) => {
    // SECURITY DEFINER function: lets an invited caregiver find the record by code without reading the table.
    const { data, error } = await this.db.rpc('lookup_invite', { code: code.trim().toUpperCase() });
    if (error) throw this.wrap(error);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? fromRow<Caregiver>(row as Record<string, unknown>) : null;
  };
  listCaregiversByProfile = (profileId: string) => this.rows<Caregiver>('caregivers', { eq: { profile_id: profileId } });
  saveCaregiver = (c: Caregiver) => this.upsert('caregivers', c);
  deleteCaregiver = async (id: string) => {
    const { error } = await this.db.from('caregivers').delete().eq('id', id);
    if (error) throw this.wrap(error);
  };
  listAvailability = (caregiverIds: string[]) =>
    caregiverIds.length ? this.rows<CaregiverAvailability>('caregiver_availability', { in: ['caregiver_id', caregiverIds] }) : Promise.resolve([]);
  replaceAvailability = (caregiverId: string, blocks: CaregiverAvailability[]) => this.replace('caregiver_availability', { caregiver_id: caregiverId }, blocks);

  // documents and instructions
  listDocuments = (patientId: string) => this.rows<DischargeDocument>('discharge_documents', { eq: { patient_id: patientId } });
  addDocument = async (doc: DischargeDocument, file?: { uri: string; bytes?: Uint8Array }) => {
    let storagePath = doc.storagePath;
    if (file) {
      storagePath = `${doc.patientId}/${doc.id}-${doc.fileName}`;
      const body = file.bytes ?? (await (await fetch(file.uri)).blob());
      const { error } = await this.db.storage.from('discharge-documents').upload(storagePath, body, { contentType: doc.mimeType ?? 'application/pdf', upsert: true });
      if (error) throw new Error(error.message);
    }
    const saved = { ...doc, storagePath };
    await this.upsert('discharge_documents', saved);
    return saved;
  };
  listInstructions = (patientId: string) => this.rows<ClinicalInstruction>('clinical_instructions', { eq: { patient_id: patientId }, order: { col: 'created_at' } });
  saveInstruction = (i: ClinicalInstruction) => this.upsert('clinical_instructions', i);
  deleteInstruction = async (id: string) => {
    const { error } = await this.db.from('clinical_instructions').delete().eq('id', id);
    if (error) throw this.wrap(error);
  };

  // readiness
  listRequirements = (patientId: string) => this.rows<RecoveryRequirement>('recovery_requirements', { eq: { patient_id: patientId } });
  replaceRequirements = (patientId: string, reqs: RecoveryRequirement[]) => this.replace('recovery_requirements', { patient_id: patientId }, reqs);
  listGaps = (patientId: string) => this.rows<RecoveryGap>('recovery_gaps', { eq: { patient_id: patientId } });
  replaceGaps = (patientId: string, gaps: RecoveryGap[]) => this.replace('recovery_gaps', { patient_id: patientId }, gaps);
  saveGap = (g: RecoveryGap) => this.upsert('recovery_gaps', g);

  // providers and programs (reference data; the isSimulated flag is a build-time fact)
  listProviders = async () => (await this.rows<ProviderCompany>('provider_companies')).map((p) => ({ ...p, isSimulated: true as const }));
  listProviderAvailability = () => this.rows<ProviderAvailability>('provider_availability');
  listServiceRequests = (patientId: string) => this.rows<ServiceRequest>('service_requests', { eq: { patient_id: patientId } });
  saveServiceRequest = (r: ServiceRequest) => this.upsert('service_requests', r);
  listPrograms = async () => (await this.rows<AssistanceProgram>('assistance_programs')).map((p) => ({ ...p, isSimulated: true as const }));
  listAssistanceRequests = (patientId: string) => this.rows<AssistanceRequest>('assistance_requests', { eq: { patient_id: patientId } });
  saveAssistanceRequest = (a: AssistanceRequest) => this.upsert('assistance_requests', a);

  // payments (RLS: see supabase/migrations/0002_payments.sql)
  getBill = (patientId: string) => this.one<FamilyBill>('family_bills', 'patient_id', patientId);
  saveBill = (b: FamilyBill) => this.upsert('family_bills', b);
  listPayments = (patientId: string) => this.rows<Payment>('payments', { eq: { patient_id: patientId }, order: { col: 'created_at' } });
  addPayment = async (p: Payment) => {
    const { error } = await this.db.from('payments').insert(toRow(p));
    if (error) throw this.wrap(error);
    return p;
  };

  // tasks
  listTasks = (patientId: string) => this.rows<RecoveryTask>('recovery_tasks', { eq: { patient_id: patientId }, order: { col: 'scheduled_at' } });
  listTasksForCaregiver = (caregiverId: string) => this.rows<RecoveryTask>('recovery_tasks', { eq: { assigned_caregiver_id: caregiverId }, order: { col: 'scheduled_at' } });
  getTask = (id: string) => this.one<RecoveryTask>('recovery_tasks', 'id', id);
  replaceTasks = (patientId: string, tasks: RecoveryTask[]) => this.replace('recovery_tasks', { patient_id: patientId }, tasks);
  saveTask = (t: RecoveryTask) => this.upsert('recovery_tasks', t);
  listTaskEvents = (taskId: string) => this.rows<TaskEvent>('task_events', { eq: { task_id: taskId }, order: { col: 'created_at' } });
  addTaskEvent = async (e: TaskEvent) => {
    await this.upsert('task_events', e);
  };

  // notifications and reviews
  listNotifications = (recipientId: string) => this.rows<Notification>('notifications', { eq: { recipient_id: recipientId }, order: { col: 'created_at', ascending: false } });
  addNotifications = async (n: Notification[]) => {
    if (!n.length) return;
    const { error } = await this.db.from('notifications').upsert(n.map(toRow));
    if (error) throw this.wrap(error);
  };
  markNotificationRead = async (id: string) => {
    const { error } = await this.db.from('notifications').update({ status: 'read' }).eq('id', id);
    if (error) throw this.wrap(error);
  };
  addReview = async (r: ClinicalReview) => {
    await this.upsert('clinical_reviews', r);
  };
  listReviews = (patientId: string) => this.rows<ClinicalReview>('clinical_reviews', { eq: { patient_id: patientId } });
}
