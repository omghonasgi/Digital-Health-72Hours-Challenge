-- Simulated insurance claims, one per bill item. Insurance pays CareBridge
-- first; only an approved claim reduces the family share.

create table if not exists insurance_claims (
  id                 text primary key,
  patient_id         text not null references patients (id) on delete cascade,
  item_id            text not null,
  payer_name         text not null,
  requested_amount   numeric(10,2) not null check (requested_amount >= 0),
  approved_amount    numeric(10,2) check (approved_amount >= 0),
  status             text not null check (status in ('submitted','approved','denied')),
  denial_reason_key  text,
  updated_at         timestamptz not null default now(),
  is_simulated       boolean not null default true check (is_simulated),
  unique (patient_id, item_id)
);

alter table insurance_claims enable row level security;

-- Patient or org coordinator only. Caregivers see claim status through family_bills.
create policy claims_select on insurance_claims for select to authenticated using (cb_can_manage_patient(patient_id));
create policy claims_write  on insurance_claims for all    to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));
