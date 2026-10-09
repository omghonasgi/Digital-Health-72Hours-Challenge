-- Patient plan codes: a patient can share a code before intake so a caregiver
-- can enter the assessment. Sharing the code is the consent.

alter table patients add column if not exists access_code text;
alter table caregivers add column if not exists proxy_access boolean not null default false;

create unique index if not exists patients_access_code_idx on patients (upper(access_code)) where access_code is not null;

-- Proxy caregivers (joined via plan code) manage the patient record the same
-- way the patient does: intake, instructions, resources, finance.
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
  or exists (
    select 1 from caregivers c
    where c.patient_id = pid
      and c.profile_id = cb_my_profile_id()
      and c.accepted_invitation
      and c.consent_status = 'granted'
      and c.proxy_access
  )
$$;

create or replace function lookup_patient_access(code text)
returns table (
  id text,
  profile_id text,
  display_name text,
  preferred_language text,
  access_code text,
  intake_completed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.profile_id, p.display_name, p.preferred_language, p.access_code, p.intake_completed_at
  from patients p
  where upper(p.access_code) = upper(code)
    and cb_my_role() = 'caregiver'
  limit 1
$$;

grant execute on function lookup_patient_access(text) to authenticated;
grant execute on function cb_can_manage_patient(text) to authenticated;

-- A caregiver may insert their own row when redeeming a plan code.
drop policy if exists caregivers_self_insert on caregivers;
create policy caregivers_self_insert on caregivers for insert to authenticated
  with check (cb_my_role() = 'caregiver' and profile_id = cb_my_profile_id());

-- Recreate logistics view with access_code (finances still blank).
create or replace view patient_logistics
with (security_invoker = false) as
  select id, profile_id, organization_id, display_name, age_range, preferred_language, zip, city,
         procedure_name, facility, surgery_date, discharge_at, timezone,
         'other'::text as insurance_type, 0 as recovery_budget, 'prefer_not_to_say'::text as income_range,
         '{"medications":false,"equipment":false,"caregiving":false,"wantsAssistance":false}'::jsonb as financial_concerns,
         home_environment, intake_completed_at, access_code, created_at
  from patients p
  where cb_is_active_caregiver_for(p.id);
grant select on patient_logistics to authenticated;
