-- CareBridge payments (simulated). CareBridge is the middle party: approved
-- programs and the family pay CareBridge, CareBridge pays each service.
-- No real money moves and no full card number is ever stored.

create table if not exists family_bills (
  id            text primary key,
  patient_id    text not null unique references patients (id) on delete cascade,
  items         jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  is_simulated  boolean not null default true check (is_simulated)
);

create table if not exists payments (
  id                text primary key default gen_random_uuid()::text,
  patient_id        text not null references patients (id) on delete cascade,
  payer_profile_id  text not null references profiles (id),
  payer_name        text not null,
  amount            numeric(10,2) not null check (amount > 0),
  method            text not null check (method in ('card','hsa_fsa')),
  card_brand        text not null,
  last4             text not null check (last4 ~ '^[0-9]{4}$'),
  status            text not null default 'succeeded' check (status = 'succeeded'),
  created_at        timestamptz not null default now(),
  is_simulated      boolean not null default true check (is_simulated)
);

create index if not exists payments_patient_idx on payments (patient_id, created_at);

alter table family_bills enable row level security;
alter table payments     enable row level security;

-- The bill holds line items and who covers them, never income or budget, so
-- active caregivers may read it to split the family share.
create policy bills_select on family_bills for select to authenticated using (cb_can_read_patient(patient_id));
create policy bills_write  on family_bills for all    to authenticated using (cb_can_manage_patient(patient_id)) with check (cb_can_manage_patient(patient_id));

-- Anyone who can read the patient may pay toward the bill, only as themselves.
-- No update or delete policy: payments are immutable.
create policy payments_select on payments for select to authenticated using (cb_can_read_patient(patient_id));
create policy payments_insert on payments for insert to authenticated
  with check (payer_profile_id = cb_my_profile_id() and cb_can_read_patient(patient_id));
