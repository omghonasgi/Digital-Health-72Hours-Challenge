import type {
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
  RecoveryGap,
  RecoveryRequirement,
  RecoveryTask,
  ServiceRequest,
  Session,
  TaskEvent,
} from '@/core/types';
import { AccessDenied, type Repository } from '../repository';
import type { Store } from './store';

export interface StorageAdapter {
  load(): Promise<Store | null>;
  save(store: Store): Promise<void>;
}

export class MemoryStorage implements StorageAdapter {
  private data: Store | null = null;
  async load() {
    return this.data;
  }
  async save(store: Store) {
    this.data = store;
  }
}

type Access = 'full' | 'caregiver' | null;

/**
 * Demo repository. Holds the whole store in memory and writes it through to
 * the adapter after each mutation. Authorization is enforced here per
 * session, mirroring the RLS policies in supabase/migrations.
 */
export class LocalRepository implements Repository {
  constructor(
    private readonly store: Store,
    private readonly session: Session | null,
    private readonly storage: StorageAdapter,
    private readonly systemMode = false,
  ) {}

  elevate(): Repository {
    return new LocalRepository(this.store, this.session, this.storage, true);
  }

  // -- authorization ------------------------------------------------------------

  private get me() {
    if (!this.session) throw new AccessDenied('Sign in required.');
    return this.session.profile;
  }

  private myCaregiverRecords() {
    return this.store.caregivers.filter(
      (c) => c.profileId === this.me.id && c.acceptedInvitation && c.consentStatus === 'granted',
    );
  }

  private access(patientId: string): Access {
    if (this.systemMode) return 'full';
    const me = this.me;
    const patient = this.store.patients.find((p) => p.id === patientId);
    if (!patient) return me.role === 'patient' ? 'full' : null; // new record being created by its owner
    if (me.role === 'coordinator') return (patient.organizationId ?? me.organizationId) === me.organizationId ? 'full' : null;
    if (me.role === 'patient') return patient.profileId === me.id ? 'full' : null;
    if (me.role === 'caregiver') {
      const rec = this.myCaregiverRecords().find((c) => c.patientId === patientId);
      if (!rec) return null;
      return rec.proxyAccess ? 'full' : 'caregiver';
    }
    return null;
  }

  private requireFull(patientId: string) {
    if (this.access(patientId) !== 'full') throw new AccessDenied();
  }

  private requireAny(patientId: string): Access {
    const a = this.access(patientId);
    if (!a) throw new AccessDenied();
    return a;
  }

  private hasProxyAccess() {
    return this.myCaregiverRecords().some((c) => c.proxyAccess && c.acceptedInvitation && c.consentStatus === 'granted');
  }

  private async commit() {
    await this.storage.save(this.store);
  }

  private upsert<T extends { id: string }>(list: T[], item: T) {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item;
    else list.push(item);
    return item;
  }

  // -- profiles ----------------------------------------------------------------------

  async getProfile(id: string) {
    const p = this.store.profiles.find((x) => x.id === id) ?? null;
    if (!p) return null;
    if (p.id === this.me.id || this.me.role === 'coordinator') return p;
    // Caregivers may see the display name of the patient they help, and vice versa.
    return { ...p, organizationId: undefined };
  }
  async saveProfile(p: Profile) {
    if (p.id !== this.me.id && this.me.role !== 'coordinator') throw new AccessDenied();
    this.upsert(this.store.profiles, p);
    await this.commit();
    return p;
  }
  async listCoordinators() {
    return this.store.profiles.filter((p) => p.role === 'coordinator' && p.organizationId === this.me.organizationId);
  }

  // -- patients -----------------------------------------------------------------------

  private redact(p: Patient, access: Access): Patient {
    if (access === 'full') return p;
    // Caregivers see logistics they are responsible for, never finances.
    return {
      ...p,
      insuranceType: 'other',
      recoveryBudget: 0,
      incomeRange: 'prefer_not_to_say',
      financialConcerns: { medications: false, equipment: false, caregiving: false, wantsAssistance: false },
    };
  }
  async getPatient(id: string) {
    const p = this.store.patients.find((x) => x.id === id);
    if (!p) return null;
    const a = this.access(id);
    if (!a) throw new AccessDenied();
    return this.redact(p, a);
  }
  async getPatientByProfile(profileId: string) {
    const p = this.store.patients.find((x) => x.profileId === profileId);
    if (!p) return null;
    const a = this.access(p.id);
    if (!a) throw new AccessDenied();
    return this.redact(p, a);
  }
  async listPatients() {
    const me = this.me;
    if (me.role === 'coordinator') return this.store.patients.filter((p) => (p.organizationId ?? me.organizationId) === me.organizationId);
    if (me.role === 'patient') return this.store.patients.filter((p) => p.profileId === me.id);
    const ids = new Set(this.myCaregiverRecords().map((c) => c.patientId));
    return this.store.patients.filter((p) => ids.has(p.id)).map((p) => this.redact(p, this.access(p.id)));
  }
  async getPatientByAccessCode(code: string) {
    if (this.me.role !== 'caregiver') throw new AccessDenied();
    const needle = code.trim().toUpperCase();
    const p = this.store.patients.find((x) => x.accessCode?.toUpperCase() === needle);
    if (!p) return null;
    // Code holders see identity only until they redeem it; finances stay blank here.
    return this.redact(p, 'caregiver');
  }
  async savePatient(p: Patient) {
    this.requireFull(p.id);
    const prev = this.store.patients.find((x) => x.id === p.id);
    if (this.me.role === 'patient' && p.profileId !== this.me.id) throw new AccessDenied();
    if (this.me.role === 'caregiver') {
      if (!prev || prev.profileId !== p.profileId) throw new AccessDenied();
      p.accessCode = prev.accessCode;
    }
    this.upsert(this.store.patients, p);
    await this.commit();
    return p;
  }

  // -- equipment ------------------------------------------------------------------------

  async listEquipment(patientId: string) {
    this.requireAny(patientId);
    return this.store.equipment.filter((e) => e.patientId === patientId);
  }
  async replaceEquipment(patientId: string, items: PatientEquipment[]) {
    this.requireFull(patientId);
    this.store.equipment = [...this.store.equipment.filter((e) => e.patientId !== patientId), ...items];
    await this.commit();
  }
  async saveEquipment(item: PatientEquipment) {
    const a = this.requireAny(item.patientId); // caregivers may confirm receipt of equipment they fetched
    if (a === 'caregiver' && !this.store.equipment.some((e) => e.id === item.id)) throw new AccessDenied();
    this.upsert(this.store.equipment, item);
    await this.commit();
  }

  // -- caregivers -------------------------------------------------------------------------

  async listCaregivers(patientId: string) {
    const a = this.requireAny(patientId);
    const list = this.store.caregivers.filter((c) => c.patientId === patientId);
    return a === 'full' ? list : list.filter((c) => c.profileId === this.me.id);
  }
  async getCaregiver(id: string) {
    const c = this.store.caregivers.find((x) => x.id === id);
    if (!c) return null;
    if (c.profileId === this.me.id) return c;
    this.requireFull(c.patientId);
    return c;
  }
  async getCaregiverByInvite(code: string) {
    // Invite lookup is intentionally open to any signed-in caregiver: the code is the secret.
    return this.store.caregivers.find((c) => c.inviteCode.toUpperCase() === code.trim().toUpperCase()) ?? null;
  }
  async listCaregiversByProfile(profileId: string) {
    if (profileId !== this.me.id && this.me.role !== 'coordinator') throw new AccessDenied();
    return this.store.caregivers.filter((c) => c.profileId === profileId);
  }
  async saveCaregiver(c: Caregiver) {
    if (c.profileId !== this.me.id) this.requireFull(c.patientId);
    this.upsert(this.store.caregivers, c);
    await this.commit();
    return c;
  }
  async deleteCaregiver(id: string) {
    const c = this.store.caregivers.find((x) => x.id === id);
    if (!c) return;
    this.requireFull(c.patientId);
    this.store.caregivers = this.store.caregivers.filter((x) => x.id !== id);
    this.store.availability = this.store.availability.filter((a) => a.caregiverId !== id);
    await this.commit();
  }
  async listAvailability(caregiverIds: string[]) {
    const allowed = new Set(
      this.store.caregivers
        .filter((c) => caregiverIds.includes(c.id) && (c.profileId === this.me.id || this.access(c.patientId)))
        .map((c) => c.id),
    );
    return this.store.availability.filter((a) => allowed.has(a.caregiverId));
  }
  async replaceAvailability(caregiverId: string, blocks: CaregiverAvailability[]) {
    const c = this.store.caregivers.find((x) => x.id === caregiverId);
    if (!c) throw new AccessDenied();
    if (c.profileId !== this.me.id) this.requireFull(c.patientId);
    this.store.availability = [...this.store.availability.filter((a) => a.caregiverId !== caregiverId), ...blocks];
    await this.commit();
  }

  // -- documents and instructions ------------------------------------------------------------

  async listDocuments(patientId: string) {
    this.requireFull(patientId);
    return this.store.documents.filter((d) => d.patientId === patientId);
  }
  async addDocument(doc: DischargeDocument) {
    this.requireFull(doc.patientId);
    this.upsert(this.store.documents, doc);
    await this.commit();
    return doc;
  }
  async listInstructions(patientId: string) {
    const a = this.requireAny(patientId);
    const list = this.store.instructions.filter((i) => i.patientId === patientId);
    if (a === 'full') return list;
    // Caregivers: only instructions behind their tasks, plus warning signs (safety-relevant to anyone present).
    const myTasks = await this.listTasksForCaregiverInternal(patientId);
    const ids = new Set(myTasks.map((t) => t.instructionId));
    return list.filter((i) => i.reviewStatus === 'approved' && (ids.has(i.id) || i.category === 'warning_signs'));
  }
  async saveInstruction(i: ClinicalInstruction) {
    this.requireFull(i.patientId);
    const prev = this.store.instructions.find((x) => x.id === i.id);
    if (this.me.role !== 'coordinator') {
      // Patients and proxy caregivers may enter drafts; review is a coordinator action.
      if (i.reviewStatus !== 'draft' || (prev && prev.reviewStatus !== 'draft')) throw new AccessDenied('Only a coordinator can review instructions.');
    }
    this.upsert(this.store.instructions, i);
    await this.commit();
    return i;
  }
  async deleteInstruction(id: string) {
    const i = this.store.instructions.find((x) => x.id === id);
    if (!i) return;
    this.requireFull(i.patientId);
    if (this.me.role !== 'coordinator' && i.reviewStatus !== 'draft') throw new AccessDenied();
    this.store.instructions = this.store.instructions.filter((x) => x.id !== id);
    await this.commit();
  }

  // -- readiness -------------------------------------------------------------------------------

  async listRequirements(patientId: string) {
    this.requireFull(patientId);
    return this.store.requirements.filter((r) => r.patientId === patientId);
  }
  async replaceRequirements(patientId: string, reqs: RecoveryRequirement[]) {
    this.requireAny(patientId);
    this.store.requirements = [...this.store.requirements.filter((r) => r.patientId !== patientId), ...reqs];
    await this.commit();
  }
  async listGaps(patientId: string) {
    this.requireFull(patientId);
    return this.store.gaps.filter((g) => g.patientId === patientId);
  }
  async replaceGaps(patientId: string, gaps: RecoveryGap[]) {
    this.requireAny(patientId);
    this.store.gaps = [...this.store.gaps.filter((g) => g.patientId !== patientId), ...gaps];
    await this.commit();
  }
  async saveGap(g: RecoveryGap) {
    this.requireFull(g.patientId);
    this.upsert(this.store.gaps, g);
    await this.commit();
    return g;
  }

  // -- providers and programs ------------------------------------------------------------------

  async listProviders() {
    if (this.me.role === 'caregiver' && !this.systemMode && !this.hasProxyAccess()) throw new AccessDenied();
    return this.store.providers;
  }
  async listProviderAvailability() {
    if (this.me.role === 'caregiver' && !this.systemMode) throw new AccessDenied();
    return this.store.providerAvailability;
  }
  async listServiceRequests(patientId: string) {
    const a = this.requireAny(patientId);
    const list = this.store.serviceRequests.filter((r) => r.patientId === patientId);
    return a === 'full' ? list : list.filter((r) => r.status === 'provider_confirmed');
  }
  async saveServiceRequest(r: ServiceRequest) {
    this.requireFull(r.patientId);
    this.upsert(this.store.serviceRequests, r);
    await this.commit();
    return r;
  }
  async listPrograms() {
    if (this.me.role === 'caregiver' && !this.systemMode && !this.hasProxyAccess()) throw new AccessDenied();
    return this.store.programs;
  }
  async listAssistanceRequests(patientId: string) {
    this.requireFull(patientId);
    return this.store.assistanceRequests.filter((a) => a.patientId === patientId);
  }
  async saveAssistanceRequest(a: AssistanceRequest) {
    this.requireFull(a.patientId);
    this.upsert(this.store.assistanceRequests, a);
    await this.commit();
    return a;
  }

  // -- payments --------------------------------------------------------------------------------------

  async getBill(patientId: string) {
    this.requireAny(patientId); // caregivers see the bill (no income, budget or eligibility) so they can split it
    return this.store.bills.find((b) => b.patientId === patientId) ?? null;
  }
  async saveBill(b: FamilyBill) {
    this.requireFull(b.patientId);
    this.upsert(this.store.bills, b);
    await this.commit();
    return b;
  }
  async listPayments(patientId: string) {
    this.requireAny(patientId);
    return this.store.payments.filter((p) => p.patientId === patientId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async addPayment(p: Payment) {
    this.requireAny(p.patientId);
    if (!this.systemMode && p.payerProfileId !== this.me.id) throw new AccessDenied('You can only pay as yourself.');
    if (this.store.payments.some((x) => x.id === p.id)) throw new AccessDenied('Payments cannot be changed.');
    this.store.payments.push(p);
    await this.commit();
    return p;
  }

  async listInsuranceClaims(patientId: string) {
    this.requireFull(patientId);
    return this.store.insuranceClaims.filter((c) => c.patientId === patientId);
  }
  async saveInsuranceClaim(c: InsuranceClaim) {
    this.requireFull(c.patientId);
    this.upsert(this.store.insuranceClaims, c);
    await this.commit();
    return c;
  }

  // -- tasks -----------------------------------------------------------------------------------------

  private async listTasksForCaregiverInternal(patientId: string) {
    // An accepted caregiver sees the whole schedule so they can report a task done when the patient can't.
    if (!this.myCaregiverRecords().some((c) => c.patientId === patientId)) return [];
    return this.store.tasks.filter((t) => t.patientId === patientId);
  }
  async listTasks(patientId: string) {
    const a = this.requireAny(patientId);
    if (a === 'full') return this.store.tasks.filter((t) => t.patientId === patientId);
    return this.listTasksForCaregiverInternal(patientId);
  }
  async listTasksForCaregiver(caregiverId: string) {
    const c = this.store.caregivers.find((x) => x.id === caregiverId);
    if (!c) return [];
    if (c.profileId !== this.me.id) this.requireFull(c.patientId);
    if (c.profileId === this.me.id && !(c.acceptedInvitation && c.consentStatus === 'granted')) return [];
    return this.store.tasks.filter((t) => t.assignedCaregiverId === caregiverId);
  }
  async getTask(id: string) {
    const t = this.store.tasks.find((x) => x.id === id);
    if (!t) return null;
    const a = this.requireAny(t.patientId);
    if (a === 'caregiver' && !(await this.listTasksForCaregiverInternal(t.patientId)).some((x) => x.id === id)) throw new AccessDenied();
    return t;
  }
  async replaceTasks(patientId: string, tasks: RecoveryTask[]) {
    this.requireAny(patientId);
    this.store.tasks = [...this.store.tasks.filter((t) => t.patientId !== patientId), ...tasks];
    await this.commit();
  }
  async saveTask(t: RecoveryTask) {
    await this.getTask(t.id); // enforces read access to this exact task
    this.upsert(this.store.tasks, t);
    await this.commit();
    return t;
  }
  async listTaskEvents(taskId: string) {
    await this.getTask(taskId);
    return this.store.taskEvents.filter((e) => e.taskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async addTaskEvent(e: TaskEvent) {
    await this.getTask(e.taskId);
    this.upsert(this.store.taskEvents, e);
    await this.commit();
  }

  // -- notifications and reviews ----------------------------------------------------------------------

  async listNotifications(recipientId: string) {
    if (recipientId !== this.me.id) throw new AccessDenied();
    return this.store.notifications.filter((n) => n.recipientId === recipientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async addNotifications(n: Notification[]) {
    for (const x of n) this.upsert(this.store.notifications, x);
    await this.commit();
  }
  async markNotificationRead(id: string) {
    const n = this.store.notifications.find((x) => x.id === id);
    if (!n || n.recipientId !== this.me.id) throw new AccessDenied();
    n.status = 'read';
    await this.commit();
  }
  async addReview(r: ClinicalReview) {
    if (this.me.role !== 'coordinator') throw new AccessDenied();
    this.upsert(this.store.reviews, r);
    await this.commit();
  }
  async listReviews(patientId: string) {
    this.requireFull(patientId);
    return this.store.reviews.filter((r) => r.patientId === patientId);
  }

  // -- demo helpers -------------------------------------------------------------------------------------

  /** Raw access for the auth shim and tests. Not part of the Repository contract. */
  get raw() {
    return this.store;
  }
}
