create extension if not exists pgcrypto;

create type public.admission_type as enum ('New', 'Returning');
create type public.payment_method as enum ('Bank Transfer', 'Cash', 'POS', 'Cheque');

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'admin' check (role in ('admin', 'finance')),
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer not null default 0
);

create table public.pupils (
  id uuid primary key default gen_random_uuid(),
  admission_number text not null unique,
  first_name text not null,
  last_name text not null,
  admission_type public.admission_type not null default 'New',
  class_id uuid references public.classes(id),
  date_of_birth date not null,
  gender text not null check (gender in ('Female', 'Male')),
  guardian_name text not null,
  guardian_phone text not null,
  state_of_origin text,
  house_address text not null,
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  blood_group text,
  complexion text,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  active boolean not null default false
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  name text not null check (name in ('First Term', 'Second Term', 'Third Term')),
  starts_on date not null,
  ends_on date not null,
  active boolean not null default false,
  unique(session_id, name)
);

create table public.fee_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category_type text not null default 'school' check (category_type in ('school', 'transport')),
  active boolean not null default true
);

create table public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  pupil_id uuid not null references public.pupils(id),
  term_id uuid not null references public.terms(id),
  category_id uuid not null references public.fee_categories(id),
  amount_due numeric(12,2) not null check (amount_due >= 0),
  created_at timestamptz not null default now(),
  unique(pupil_id, term_id, category_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  pupil_id uuid not null references public.pupils(id),
  term_id uuid not null references public.terms(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now()
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  invoice_id uuid not null references public.fee_invoices(id),
  amount numeric(12,2) not null check (amount > 0),
  unique(payment_id, invoice_id)
);

create table public.bus_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true
);

create table public.bus_enrollments (
  id uuid primary key default gen_random_uuid(),
  pupil_id uuid not null references public.pupils(id),
  term_id uuid not null references public.terms(id),
  route_id uuid references public.bus_routes(id),
  pickup_address text,
  active boolean not null default true,
  unique(pupil_id, term_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table public.daily_report_logs (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  recipient text,
  total_collected numeric(12,2) not null default 0,
  payload jsonb not null,
  delivery_status text not null default 'pending',
  sent_at timestamptz,
  error_message text
);

create index pupils_name_search_idx on public.pupils using gin (
  to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(admission_number, ''))
);
create index payments_paid_at_idx on public.payments(paid_at);
create index payments_pupil_idx on public.payments(pupil_id);
create index invoices_pupil_term_idx on public.fee_invoices(pupil_id, term_id);

create or replace function public.audit_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(), tg_table_name,
    coalesce(new.id, old.id), tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger pupils_audit after insert or update or delete on public.pupils
for each row execute function public.audit_changes();
create trigger payments_audit after insert or update or delete on public.payments
for each row execute function public.audit_changes();

create or replace view public.invoice_balances
with (security_invoker = true) as
select
  i.id, i.pupil_id, i.term_id, c.name category_name, c.category_type,
  i.amount_due,
  coalesce(sum(a.amount) filter (where p.reversed_at is null), 0) amount_paid,
  greatest(i.amount_due - coalesce(sum(a.amount) filter (where p.reversed_at is null), 0), 0) balance,
  case
    when coalesce(sum(a.amount) filter (where p.reversed_at is null), 0) <= 0 then 'Not Paid'
    when coalesce(sum(a.amount) filter (where p.reversed_at is null), 0) >= i.amount_due then 'Paid'
    else 'Part Payment'
  end payment_status
from public.fee_invoices i
join public.fee_categories c on c.id = i.category_id
left join public.payment_allocations a on a.invoice_id = i.id
left join public.payments p on p.id = a.payment_id
group by i.id, c.name, c.category_type;

alter table public.admin_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.pupils enable row level security;
alter table public.academic_sessions enable row level security;
alter table public.terms enable row level security;
alter table public.fee_categories enable row level security;
alter table public.fee_invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.bus_routes enable row level security;
alter table public.bus_enrollments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.daily_report_logs enable row level security;

create or replace function public.is_school_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_profiles where id = auth.uid());
$$;

create policy "admins read profiles" on public.admin_profiles for select to authenticated using (public.is_school_admin());
create policy "admins manage classes" on public.classes for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage pupils" on public.pupils for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage sessions" on public.academic_sessions for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage terms" on public.terms for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage categories" on public.fee_categories for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage invoices" on public.fee_invoices for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage payments" on public.payments for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage allocations" on public.payment_allocations for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage routes" on public.bus_routes for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins manage bus enrollment" on public.bus_enrollments for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "admins read audit" on public.audit_logs for select to authenticated using (public.is_school_admin());
create policy "admins read reports" on public.daily_report_logs for select to authenticated using (public.is_school_admin());

insert into public.classes(name, display_order) values
('Creche', 1), ('Nursery 1', 2), ('Nursery 2', 3), ('Primary 1', 4),
('Primary 2', 5), ('Primary 3', 6), ('Primary 4', 7), ('Primary 5', 8), ('Primary 6', 9);

insert into public.fee_categories(name, category_type) values
('Tuition', 'school'), ('Books', 'school'), ('Uniform', 'school'), ('Feeding', 'school'),
('Examination', 'school'), ('Development Levy', 'school'), ('School Bus', 'transport');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pupil-photos', 'pupil-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "admins view pupil photos" on storage.objects for select to authenticated
using (bucket_id = 'pupil-photos' and public.is_school_admin());
create policy "admins upload pupil photos" on storage.objects for insert to authenticated
with check (bucket_id = 'pupil-photos' and public.is_school_admin());
create policy "admins update pupil photos" on storage.objects for update to authenticated
using (bucket_id = 'pupil-photos' and public.is_school_admin())
with check (bucket_id = 'pupil-photos' and public.is_school_admin());
