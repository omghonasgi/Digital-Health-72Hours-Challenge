-- CareBridge schema. Postgres / Supabase.
--
-- Conventions
--   * Column names are snake_case versions of the TypeScript domain fields in
--     src/core/types.ts. SupabaseRepository maps camelCase <-> snake_case 1:1.
--   * Primary keys are text and default to a UUID. The deterministic engines
--     also write stable prefixed ids (req_*, gap_*, task_*) so re-analysis
--     preserves human-set statuses; both forms are opaque strings to the app.
--   * Authorization lives here, in Row Level Security. The client only ever
--     holds the anon key plus the user's JWT. Nothing in the frontend is trusted.
--   * Every row is synthetic demo data. No real PHI is ever expected here, but
--     the policies are written as if it were.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id                 text primary key default gen_random_uuid()::text,
  auth_user_id       uuid not null unique references auth.users (id) on delete cascade,
  role               text not null check (role in ('patient','caregiver','coordinator')),
  display_name       text not null,
  preferred_language text not null default 'en' check (preferred_language in ('en','es')),
  organization_id    text,
  created_at         timestamptz not null default now()
);

create table if not exists patients (
  id                   text primary key default gen_random_uuid()::text,
  profile_id           text not null references profiles (id) on delete cascade,
  organization_id      text,
  display_name         text not null,
  age_range            text check (age_range in ('18-34','35-49','50-64','65-74','75+')),
  preferred_language   text not null default 'en' check (preferred_language in ('en','es')),
  zip                  text not null,
  city                 text,
  procedure_name       text not null,
  facility             text,
  surgery_date         timestamptz not null,
  discharge_at         timestamptz not null,
  timezone             text not null,
  insurance_type       text not null check (insurance_type in ('medicaid','medicare','private','marketplace','uninsured','other')),
  recovery_budget      integer not null default 0 check (recovery_budget >= 0),
  income_range         text not null check (income_range in ('under_25k','25k_50k','50k_75k','75k_100k','over_100k','prefer_not_to_say')),
  financial_concerns   jsonb not null default '{}'::jsonb,
  home_environment     jsonb not null default '{}'::jsonb,
  intake_completed_at  timestamptz,
  created_at           timestamptz not null default now()
);

create table if not exists patient_equipment (
  id                  text primary key default gen_random_uuid()::text,
  patient_id          text not null references patients (id) on delete cascade,
  equipment_name      text not null check (equipment_name in ('walker','crutches','wheelchair','shower_chair','raised_toilet_seat','cold_therapy','wound_care_supplies','other')),
  other_label         text,
  availability_status text not null check (availability_status in ('available','can_borrow','need_to_obtain','unsure')),
  received_at         timestamptz
);

create table if not exists caregivers (
  id                           text primary key default gen_random_uuid()::text,
  patient_id                   text not null references patients (id) on delete cascade,
  profile_id                   text references profiles (id) on delete set null,
  name                         text not null,
  relationship                 text not null,
  languages                    text[] not null default '{en}',
  capabilities                 text[] not null default '{}',
  willing_for_assigned         boolean not null default true,
  needs_translated_instructions boolean not null default false,
  invite_code                  text not null unique,
  accepted_invitation          boolean not null default false,
  consent_status               text not null default 'pending' check (consent_status in ('pending','granted','revoked')),
  created_at                   timestamptz not null default now()
);

create table if not exists caregiver_availability (
  id           text primary key default gen_random_uuid()::text,
  caregiver_id text not null references caregivers (id) on delete cascade,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  confirmed    boolean not null default false,
  check (end_at > start_at)
);

create table if not exists discharge_documents (
  id                text primary key default gen_random_uuid()::text,
  patient_id        text not null references patients (id) on delete cascade,
  file_name         text not null,
  storage_path      text,
  mime_type         text,
  size_bytes        integer,
  extraction_status text not null default 'manual_entry' check (extraction_status in ('uploaded','manual_entry','unreadable')),
  uploaded_by       text not null references profiles (id),
  uploaded_at       timestamptz not null default now()
);

create table if not exists clinical_instructions (
  id            text primary key default gen_random_uuid()::text,
  patient_id    text not null references patients (id) on delete cascade,
  document_id   text references discharge_documents (id) on delete set null,
  category      text not null check (category in ('medication','mobility','equipment','caregiver','transportation','follow_up','wound_care','diet','warning_signs','check_in')),
  original_text text not null,
  source_page   integer,
  structured    jsonb not null,
  review_status text not null default 'draft' check (review_status in ('draft','approved','needs_clarification','rejected')),
  review_notes  text,
  reviewed_by   text references profiles (id),
  reviewed_at   timestamptz,
  entered_by    text not null references profiles (id),
  created_at    timestamptz not null default now()
);

create table if not exists recovery_requirements (
  id                  text primary key,
  patient_id          text not null references patients (id) on delete cascade,
  instruction_id      text not null,
  requirement_type    text not null,
  description         text not null,
  required_start      timestamptz,
  required_end        timestamptz,
  required_resources  text[] not null default '{}',
  required_capability text,
  status              text not null check (status in ('met','unmet','pending','review_required'))
);

create table if not exists recovery_gaps (
  id                   text primary key,
  patient_id           text not null references patients (id) on delete cascade,
  requirement_id       text not null,
  gap_type             text not null check (gap_type in ('equipment','caregiving','transportation','financial','language','medication_access','scheduling','home_accessibility')),
  description_key      text not null,
  description_params   jsonb,
  description          text not null,
  status               text not null check (status in ('identified','assigned','assistance_requested','awaiting_confirmation','verified_resolved','unresolved','escalated')),
  window_start         timestamptz,
  window_end           timestamptz,
  estimated_cost       numeric(10,2),
  actions              jsonb not null default '[]'::jsonb,
  assigned_coordinator text references profiles (id),
  resolution_notes     text,
  updated_at           timestamptz not null default now()
);

create table if not exists provider_companies (
  id                        text primary key default gen_random_uuid()::text,
  company_name              text not null,
  service_area_zip_prefixes text[] not null default '{}',
  service_area_label        text not null,
  languages                 text[] not null default '{en}',
  services                  text[] not null default '{}',
  qualifications            text[] not null default '{}',
  hourly_rate               numeric(8,2) not null default 0,
  minimum_hours             numeric(5,1) not null default 1,
  contact_phone             text,
  contact_email             text,
  verification_status       text not null default 'unverified' check (verification_status in ('verified','pending','unverified')),
  is_simulated              boolean not null default true
);

create table if not exists provider_availability (
  id          text primary key default gen_random_uuid()::text,
  provider_id text not null references provider_companies (id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  check (end_at > start_at)
);

create table if not exists service_requests (
  id             text primary key default gen_random_uuid()::text,
  patient_id     text not null references patients (id) on delete cascade,
  provider_id    text not null references provider_companies (id),
  requirement_id text,
  gap_id         text,
  window_start   timestamptz not null,
  window_end     timestamptz not null,
  quoted_cost    numeric(10,2) not null default 0,
  status         text not null default 'requested' check (status in ('requested','provider_confirmed','declined','cancelled')),
  requested_at   timestamptz not null default now(),
  confirmed_at   timestamptz
);

create table if not exists assistance_programs (
  id                       text primary key default gen_random_uuid()::text,
  program_name             text not null,
  supported_services       text[] not null default '{}',
  eligibility              jsonb not null default '{}'::jsonb,
  application_requirements text not null,
  funding_status           text not null check (funding_status in ('available','limited','unavailable')),
  max_award                numeric(10,2) not null default 0,
  contact_phone            text,
  is_simulated             boolean not null default true
);

create table if not exists assistance_requests (
  id               text primary key default gen_random_uuid()::text,
  patient_id       text not null references patients (id) on delete cascade,
  program_id       text not null references assistance_programs (id),
  requirement_id   text,
  requested_amount numeric(10,2) not null default 0,
  approved_amount  numeric(10,2),
  status           text not null check (status in ('potentially_eligible','application_needed','under_review','approved','unavailable')),
  updated_at       timestamptz not null default now()
);

create table if not exists recovery_tasks (
  id                    text primary key,
  patient_id            text not null references patients (id) on delete cascade,
  instruction_id        text not null,
  requirement_id        text,
  category              text not null,
  title_key             text not null,
  title_params          jsonb not null default '{}'::jsonb,
  title                 text not null,
  description           text not null default '',
  source_text           text not null,
  scheduled_at          timestamptz not null,
  due_at                timestamptz not null,
  assigned_role         text not null check (assigned_role in ('patient','family_caregiver','professional_caregiver','coordinator')),
  assigned_user_id      text,
  assigned_caregiver_id text references caregivers (id) on delete set null,
  service_request_id    text,
  required_resources    text[] not null default '{}',
  priority              text not null default 'normal' check (priority in ('critical','high','normal')),
  status                text not null check (status in ('scheduled','awaiting_resources','assigned','in_progress','patient_reported_complete','caregiver_reported_complete','verified_complete','missed','blocked','escalated')),
  verified_by           text,
  completed_at          timestamptz,
  blocked_reason        text,
  created_at            timestamptz not null default now()
);

create table if not exists task_events (
  id          text primary key default gen_random_uuid()::text,
  task_id     text not null references recovery_tasks (id) on delete cascade,
  actor_id    text not null,
  actor_role  text not null check (actor_role in ('patient','caregiver','coordinator','system')),
  event_type  text not null,
  from_status text,
  to_status   text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists notifications (
  id             text primary key default gen_random_uuid()::text,
  recipient_id   text not null references profiles (id) on delete cascade,
  task_id        text,
  message_key    text not null,
  message_params jsonb,
  message        text not null,
  status         text not null default 'unread' check (status in ('unread','read')),
  created_at     timestamptz not null default now()
);

create table if not exists clinical_reviews (
  id          text primary key default gen_random_uuid()::text,
  patient_id  text not null references patients (id) on delete cascade,
  reviewer_id text not null references profiles (id),
  review_type text not null check (review_type in ('instruction_extraction','readiness','escalation')),
  status      text not null check (status in ('open','completed')),
  notes       text,
  reviewed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists profiles_auth_user_idx         on profiles (auth_user_id);
create index if not exists profiles_role_org_idx          on profiles (role, organization_id);
create index if not exists patients_profile_idx           on patients (profile_id);
create index if not exists patients_org_surgery_idx       on patients (organization_id, surgery_date);
create index if not exists patient_equipment_patient_idx  on patient_equipment (patient_id);
create index if not exists caregivers_patient_idx         on caregivers (patient_id);
create index if not exists caregivers_profile_idx         on caregivers (profile_id);
create index if not exists caregiver_avail_cg_idx         on caregiver_availability (caregiver_id, start_at);
create index if not exists documents_patient_idx          on discharge_documents (patient_id);
create index if not exists instructions_patient_idx       on clinical_instructions (patient_id, created_at);
create index if not exists instructions_review_idx        on clinical_instructions (review_status);
create index if not exists requirements_patient_idx       on recovery_requirements (patient_id);
create index if not exists gaps_patient_status_idx        on recovery_gaps (patient_id, status);
create index if not exists gaps_type_idx                  on recovery_gaps (gap_type);
create index if not exists provider_avail_provider_idx    on provider_availability (provider_id, start_at);
create index if not exists service_requests_patient_idx   on service_requests (patient_id, status);
create index if not exists assistance_requests_patient_idx on assistance_requests (patient_id, status);
create index if not exists tasks_patient_sched_idx        on recovery_tasks (patient_id, scheduled_at);
create index if not exists tasks_caregiver_idx            on recovery_tasks (assigned_caregiver_id, scheduled_at);
create index if not exists tasks_status_idx               on recovery_tasks (status);
create index if not exists tasks_due_idx                  on recovery_tasks (due_at);
create index if not exists task_events_task_idx           on task_events (task_id, created_at);
create index if not exists notifications_recipient_idx    on notifications (recipient_id, status, created_at desc);
create index if not exists reviews_patient_idx            on clinical_reviews (patient_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies don't recurse into RLS)
-- ---------------------------------------------------------------------------

create or replace function cb_my_profile_id() returns text
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function cb_my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function cb_my_org() returns text
language sql stable security definer set search_path = public as $$
  select organization_id from profiles where auth_user_id = auth.uid() limit 1
$$;

-- Patient owner, or coordinator in the same organization. Full read/write.
create or replace function cb_can_manage_patient(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients p
    where p.id = pid
      and (
        p.profile_id = cb_my_profile_id()
        or (cb_my_role() = 'coordinator' and coalesce(p.organization_id, cb_my_org()) = cb_my_org())
      )
  )
$$;

-- Caregiver who accepted an invitation AND whose consent is granted for this patient.
create or replace function cb_is_active_caregiver_for(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from caregivers c
    where c.patient_id = pid
      and c.profile_id = cb_my_profile_id()
      and c.accepted_invitation
      and c.consent_status = 'granted'
  )
$$;

create or replace function cb_can_read_patient(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select cb_can_manage_patient(pid) or cb_is_active_caregiver_for(pid)
$$;

create or replace function cb_my_caregiver_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select id from caregivers where profile_id = cb_my_profile_id()
$$;

-- Invitation lookup by code. Returns the record only if it is still claimable
-- (unaccepted, or already linked to the caller). Never lists caregivers.
create or replace function lookup_invite(code text) returns setof caregivers
language sql stable security definer set search_path = public as $$
  select * from caregivers c
  where upper(c.invite_code) = upper(code)
    and cb_my_role() = 'caregiver'
    and (c.profile_id is null or c.profile_id = cb_my_profile_id())
  limit 1
$$;

grant execute on function cb_my_profile_id, cb_my_role, cb_my_org, cb_can_manage_patient, cb_is_active_caregiver_for, cb_can_read_patient, cb_my_caregiver_ids to authenticated;
grant execute on function lookup_invite(text) to authenticated;

-- Caregivers see logistics, never finances. The client falls back to this view
-- when the base table returns nothing (see SupabaseRepository.getPatient).
create or replace view patient_logistics
with (security_invoker = false) as
  select id, profile_id, organization_id, display_name, age_range, preferred_language, zip, city,
         procedure_name, facility, surgery_date, discharge_at, timezone,
         'other'::text as insurance_type, 0 as recovery_budget, 'prefer_not_to_say'::text as income_range,
         '{"medications":false,"equipment":false,"caregiving":false,"wantsAssistance":false}'::jsonb as financial_concerns,
         home_environment, intake_completed_at, created_at
  from patients p
  where cb_is_active_caregiver_for(p.id);
grant select on patient_logistics to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles              enable row level security;
alter table patients              enable row level security;
alter table patient_equipment     enable row level security;
alter table caregivers            enable row level security;
alter table caregiver_availability enable row level security;
alter table discharge_documents   enable row level security;
alter table clinical_instructions enable row level security;
alter table recovery_requirements enable row level security;
alter table recovery_gaps         enable row level security;
alter table provider_companies    enable row level security;
alter table provider_availability enable row level security;
alter table service_requests      enable row level security;
alter table assistance_programs   enable row level security;
alter table assistance_requests   enable row level security;
alter table recovery_tasks        enable row level security;
alter table task_events           enable row level security;
alter table notifications         enable row level security;
alter table clinical_reviews      enable row level security;

-- profiles: your own row; coordinators see profiles in their org (to list coordinators / caregivers' names).
create policy profiles_select on profiles for select to authenticated
  using (auth_user_id = auth.uid() or (cb_my_role() = 'coordinator' and organization_id = cb_my_org()) or role = 'coordinator');
create policy profiles_insert on profiles for insert to authenticated
  with check (auth_user_id = auth.uid());
create policy profiles_update on profiles for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid() and role = (select role from profiles x where x.auth_user_id = auth.uid()));

-- patients: owner or org coordinator. Caregivers use patient_logistics (view above).
create policy patients_select on patients for select to authenticated using (cb_can_manage_patient(id));
create policy patients_insert on patients for insert to authenticated
  with check (profile_id = cb_my_profile_id() and cb_my_role() = 'patient');
create policy patients_update on patients for update to authenticated using (cb_can_manage_patient(id)) with check (cb_can_manage_patient(id));

-- equipment: readable by anyone who can read the patient; writable by managers; caregivers may update (confirm receipt) existing rows.
create policy equipment_select on patient_equipment for select to authenticated using (cb_can_read_patient(patient_id));
create policy equipment_write  on patient_equipment for all to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));
create policy equipment_caregiver_update on patient_equipment for update to authenticated
  using (cb_is_active_caregiver_for(patient_id)) with check (cb_is_active_caregiver_for(patient_id));

-- caregivers: managers see all for the patient; a caregiver sees only their own record(s).
create policy caregivers_select on caregivers for select to authenticated
  using (cb_can_manage_patient(patient_id) or profile_id = cb_my_profile_id());
create policy caregivers_manage on caregivers for all to authenticated
  using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));
-- Accepting an invitation: a caregiver may claim an unclaimed record found via lookup_invite.
create policy caregivers_accept on caregivers for update to authenticated
  using (cb_my_role() = 'caregiver' and (profile_id is null or profile_id = cb_my_profile_id()))
  with check (profile_id = cb_my_profile_id());

create policy availability_select on caregiver_availability for select to authenticated
  using (caregiver_id in (select cb_my_caregiver_ids()) or exists (select 1 from caregivers c where c.id = caregiver_id and cb_can_manage_patient(c.patient_id)));
create policy availability_write on caregiver_availability for all to authenticated
  using (caregiver_id in (select cb_my_caregiver_ids()) or exists (select 1 from caregivers c where c.id = caregiver_id and cb_can_manage_patient(c.patient_id)))
  with check (caregiver_id in (select cb_my_caregiver_ids()) or exists (select 1 from caregivers c where c.id = caregiver_id and cb_can_manage_patient(c.patient_id)));

create policy documents_select on discharge_documents for select to authenticated using (cb_can_manage_patient(patient_id));
create policy documents_write  on discharge_documents for all to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));

-- instructions: managers see all. Caregivers see only instructions behind tasks assigned to them, plus warning signs.
create policy instructions_select on clinical_instructions for select to authenticated
  using (
    cb_can_manage_patient(patient_id)
    or (
      cb_is_active_caregiver_for(patient_id)
      and (
        category = 'warning_signs'
        or exists (select 1 from recovery_tasks t where t.instruction_id = clinical_instructions.id and t.assigned_caregiver_id in (select cb_my_caregiver_ids()))
      )
    )
  );
create policy instructions_write on clinical_instructions for all to authenticated
  using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));
-- Only coordinators may set review_status away from draft (enforced by trigger below).

create policy requirements_select on recovery_requirements for select to authenticated using (cb_can_read_patient(patient_id));
create policy requirements_write  on recovery_requirements for all to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));

create policy gaps_select on recovery_gaps for select to authenticated using (cb_can_read_patient(patient_id));
create policy gaps_write  on recovery_gaps for all to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));

-- reference data: readable by every signed-in user; only the service role writes it.
create policy providers_select           on provider_companies    for select to authenticated using (true);
create policy provider_avail_select      on provider_availability for select to authenticated using (true);
create policy programs_select            on assistance_programs   for select to authenticated using (true);

create policy service_requests_select on service_requests for select to authenticated using (cb_can_read_patient(patient_id));
create policy service_requests_write  on service_requests for all to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));

create policy assistance_requests_select on assistance_requests for select to authenticated using (cb_can_manage_patient(patient_id));
create policy assistance_requests_write  on assistance_requests for all to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));

-- tasks: managers see all; caregivers only their assigned tasks (and may update those).
create policy tasks_select on recovery_tasks for select to authenticated
  using (cb_can_manage_patient(patient_id) or assigned_caregiver_id in (select cb_my_caregiver_ids()));
create policy tasks_manage on recovery_tasks for all to authenticated
  using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));
create policy tasks_caregiver_update on recovery_tasks for update to authenticated
  using (assigned_caregiver_id in (select cb_my_caregiver_ids()))
  with check (assigned_caregiver_id in (select cb_my_caregiver_ids()));

create policy task_events_select on task_events for select to authenticated
  using (exists (select 1 from recovery_tasks t where t.id = task_id and (cb_can_manage_patient(t.patient_id) or t.assigned_caregiver_id in (select cb_my_caregiver_ids()))));
create policy task_events_insert on task_events for insert to authenticated
  with check (actor_id = cb_my_profile_id() and exists (select 1 from recovery_tasks t where t.id = task_id and (cb_can_manage_patient(t.patient_id) or t.assigned_caregiver_id in (select cb_my_caregiver_ids()))));

create policy notifications_select on notifications for select to authenticated using (recipient_id = cb_my_profile_id());
create policy notifications_update on notifications for update to authenticated using (recipient_id = cb_my_profile_id()) with check (recipient_id = cb_my_profile_id());
-- Notifications for others are created by the API (service role) or by patients/coordinators for a patient they manage.
create policy notifications_insert on notifications for insert to authenticated
  with check (recipient_id = cb_my_profile_id() or (task_id is not null and exists (select 1 from recovery_tasks t where t.id = task_id and cb_can_manage_patient(t.patient_id))));

create policy reviews_select on clinical_reviews for select to authenticated using (cb_can_manage_patient(patient_id));
create policy reviews_insert on clinical_reviews for insert to authenticated
  with check (cb_my_role() = 'coordinator' and reviewer_id = cb_my_profile_id() and cb_can_manage_patient(patient_id));

-- ---------------------------------------------------------------------------
-- Integrity triggers: clinical review is a coordinator act; verification too.
-- ---------------------------------------------------------------------------

create or replace function cb_guard_instruction_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.review_status <> 'draft' and (tg_op = 'INSERT' or new.review_status is distinct from old.review_status or new.reviewed_by is distinct from old.reviewed_by) then
    if cb_my_role() <> 'coordinator' then
      raise exception 'Only a care coordinator can review instructions' using errcode = '42501';
    end if;
    new.reviewed_by := cb_my_profile_id();
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end $$;
drop trigger if exists instructions_review_guard on clinical_instructions;
create trigger instructions_review_guard before insert or update on clinical_instructions
  for each row execute function cb_guard_instruction_review();

create or replace function cb_guard_task_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.status = 'verified_complete' and old.status is distinct from 'verified_complete' and cb_my_role() <> 'coordinator' then
    raise exception 'Only a care coordinator can verify a task' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tasks_verify_guard on recovery_tasks;
create trigger tasks_verify_guard before update on recovery_tasks
  for each row execute function cb_guard_task_verification();

-- ---------------------------------------------------------------------------
-- Storage: private bucket, one folder per patient.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discharge-documents', 'discharge-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy documents_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'discharge-documents' and cb_can_manage_patient((storage.foldername(name))[1]));
create policy documents_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'discharge-documents' and cb_can_manage_patient((storage.foldername(name))[1]));
create policy documents_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'discharge-documents' and cb_can_manage_patient((storage.foldername(name))[1]));
