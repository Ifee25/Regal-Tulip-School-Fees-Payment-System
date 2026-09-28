-- Only these two email addresses are authorised to use the administration app.
alter table public.admin_profiles
drop constraint if exists admin_profiles_role_check;

delete from public.admin_profiles
where id not in (
  select id from auth.users
  where lower(email) in (
    'regaltulipschool@gmail.com',
    'ogechukwuifunanya@gmail.com'
  )
);

update public.admin_profiles p
set role = case
  when lower(u.email) = 'regaltulipschool@gmail.com' then 'main_admin'
  else 'payment_admin'
end
from auth.users u
where u.id = p.id
  and lower(u.email) in (
    'regaltulipschool@gmail.com',
    'ogechukwuifunanya@gmail.com'
  );

alter table public.admin_profiles
add constraint admin_profiles_role_check
check (role in ('main_admin', 'payment_admin'));

create or replace function public.is_main_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.role = 'main_admin'
      and lower(u.email) = 'regaltulipschool@gmail.com'
  );
$$;

create or replace function public.is_payment_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.role = 'payment_admin'
      and lower(u.email) = 'ogechukwuifunanya@gmail.com'
  );
$$;

create or replace function public.is_school_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_main_admin() or public.is_payment_admin();
$$;

-- Automatically assign the correct role when either approved email is created.
create or replace function public.assign_approved_admin_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) = 'regaltulipschool@gmail.com' then
    insert into public.admin_profiles(id, full_name, role)
    values (new.id, 'Main Administrator', 'main_admin')
    on conflict (id) do update set role = 'main_admin';
  elsif lower(new.email) = 'ogechukwuifunanya@gmail.com' then
    insert into public.admin_profiles(id, full_name, role)
    values (new.id, 'Payment Administrator', 'payment_admin')
    on conflict (id) do update set role = 'payment_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists assign_approved_admin_after_signup on auth.users;
create trigger assign_approved_admin_after_signup
after insert or update of email on auth.users
for each row execute function public.assign_approved_admin_role();

-- Apply roles to either approved account if it already exists.
insert into public.admin_profiles(id, full_name, role)
select id, 'Main Administrator', 'main_admin'
from auth.users where lower(email) = 'regaltulipschool@gmail.com'
on conflict (id) do update set role = 'main_admin';

insert into public.admin_profiles(id, full_name, role)
select id, 'Payment Administrator', 'payment_admin'
from auth.users where lower(email) = 'ogechukwuifunanya@gmail.com'
on conflict (id) do update set role = 'payment_admin';

-- Remove broad policies that previously gave every administrator full access.
drop policy if exists "admins manage pupils" on public.pupils;
drop policy if exists "admins manage classes" on public.classes;
drop policy if exists "admins manage sessions" on public.academic_sessions;
drop policy if exists "admins manage terms" on public.terms;
drop policy if exists "admins manage categories" on public.fee_categories;
drop policy if exists "admins manage invoices" on public.fee_invoices;
drop policy if exists "admins manage payments" on public.payments;
drop policy if exists "admins manage allocations" on public.payment_allocations;
drop policy if exists "admins manage routes" on public.bus_routes;
drop policy if exists "admins manage bus enrollment" on public.bus_enrollments;
drop policy if exists "admins read audit" on public.audit_logs;
drop policy if exists "admins read reports" on public.daily_report_logs;
drop policy if exists "admins manage fee schedules" on public.fee_schedules;

-- Both administrators need basic pupil identity data to locate a pupil.
create policy "approved admins read pupils"
on public.pupils for select to authenticated
using (public.is_school_admin());

create policy "main admin manages pupils"
on public.pupils for insert to authenticated
with check (public.is_main_admin());
create policy "main admin updates pupils"
on public.pupils for update to authenticated
using (public.is_main_admin()) with check (public.is_main_admin());
create policy "main admin deletes pupils"
on public.pupils for delete to authenticated
using (public.is_main_admin());

-- Lookup data is readable by both, but maintainable only by the main admin.
create policy "approved admins read classes" on public.classes for select to authenticated using (public.is_school_admin());
create policy "main admin manages classes" on public.classes for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "approved admins read sessions" on public.academic_sessions for select to authenticated using (public.is_school_admin());
create policy "main admin manages sessions" on public.academic_sessions for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "approved admins read terms" on public.terms for select to authenticated using (public.is_school_admin());
create policy "main admin manages terms" on public.terms for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "approved admins read categories" on public.fee_categories for select to authenticated using (public.is_school_admin());
create policy "main admin manages categories" on public.fee_categories for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "approved admins read routes" on public.bus_routes for select to authenticated using (public.is_school_admin());
create policy "main admin manages routes" on public.bus_routes for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "approved admins read bus enrollment" on public.bus_enrollments for select to authenticated using (public.is_school_admin());
create policy "main admin manages bus enrollment" on public.bus_enrollments for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());

-- Raw financial records, schedules, reports, and audit history are main-admin only.
create policy "main admin manages invoices" on public.fee_invoices for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "main admin manages payments" on public.payments for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "main admin manages allocations" on public.payment_allocations for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "main admin manages fee schedules" on public.fee_schedules for all to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy "main admin reads audit" on public.audit_logs for select to authenticated using (public.is_main_admin());
create policy "main admin reads reports" on public.daily_report_logs for select to authenticated using (public.is_main_admin());

drop policy if exists "admins upload pupil photos" on storage.objects;
drop policy if exists "admins update pupil photos" on storage.objects;
create policy "main admin uploads pupil photos" on storage.objects for insert to authenticated
with check (bucket_id = 'pupil-photos' and public.is_main_admin());
create policy "main admin updates pupil photos" on storage.objects for update to authenticated
using (bucket_id = 'pupil-photos' and public.is_main_admin())
with check (bucket_id = 'pupil-photos' and public.is_main_admin());

-- The second admin receives only part-payment figures. No paid or unpaid
-- financial rows are returned by this function.
create or replace function public.get_payment_admin_partials()
returns table (
  pupil_id uuid,
  fee_expected numeric,
  fee_paid numeric,
  bus_expected numeric,
  bus_paid numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_payment_admin() then
    raise exception 'Payment administrator access is required';
  end if;

  return query
  with invoice_values as (
    select
      i.id,
      i.pupil_id,
      c.category_type,
      i.amount_due expected,
      coalesce(sum(a.amount) filter (where p.reversed_at is null), 0) paid
    from public.fee_invoices i
    join public.fee_categories c on c.id = i.category_id
    left join public.payment_allocations a on a.invoice_id = i.id
    left join public.payments p on p.id = a.payment_id
    group by i.id, c.category_type
  ),
  balances as (
    select
      pupil_id,
      category_type,
      sum(expected) expected,
      sum(paid) paid
    from invoice_values
    group by pupil_id, category_type
  )
  select
    b.pupil_id,
    max(b.expected) filter (
      where b.category_type = 'school' and b.paid > 0 and b.paid < b.expected
    ),
    max(b.paid) filter (
      where b.category_type = 'school' and b.paid > 0 and b.paid < b.expected
    ),
    max(b.expected) filter (
      where b.category_type = 'transport' and b.paid > 0 and b.paid < b.expected
    ),
    max(b.paid) filter (
      where b.category_type = 'transport' and b.paid > 0 and b.paid < b.expected
    )
  from balances b
  group by b.pupil_id
  having bool_or(b.paid > 0 and b.paid < b.expected);
end;
$$;

revoke all on function public.get_payment_admin_partials() from public;
grant execute on function public.get_payment_admin_partials() to authenticated;

-- Payment entry is available to both approved admins. This security-definer
-- function writes atomically without exposing the underlying financial tables.
create or replace function public.record_payment(
  p_pupil_id uuid,
  p_term_id uuid,
  p_category_name text,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_payment_id uuid;
  v_amount_due numeric;
  v_amount_paid numeric;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select i.id, i.amount_due,
    coalesce(sum(a.amount) filter (where p.reversed_at is null), 0)
  into v_invoice_id, v_amount_due, v_amount_paid
  from public.fee_invoices i
  join public.fee_categories c on c.id = i.category_id
  left join public.payment_allocations a on a.invoice_id = i.id
  left join public.payments p on p.id = a.payment_id
  where i.pupil_id = p_pupil_id
    and i.term_id = p_term_id
    and c.name = p_category_name
  group by i.id;

  if v_invoice_id is null then
    raise exception 'No % invoice exists for this pupil in the active term', p_category_name;
  end if;
  if p_amount > greatest(v_amount_due - v_amount_paid, 0) then
    raise exception 'Payment exceeds the outstanding balance';
  end if;

  insert into public.payments(
    pupil_id, term_id, amount, payment_method, reference, recorded_by
  )
  values (
    p_pupil_id, p_term_id, p_amount,
    p_payment_method::public.payment_method, null, auth.uid()
  )
  returning id into v_payment_id;

  insert into public.payment_allocations(payment_id, invoice_id, amount)
  values (v_payment_id, v_invoice_id, p_amount);

  return v_payment_id;
end;
$$;

revoke all on function public.record_payment(uuid, uuid, text, numeric, text, text) from public;
grant execute on function public.record_payment(uuid, uuid, text, numeric, text, text) to authenticated;

-- Only the main admin can reverse a financial record.
create or replace function public.reverse_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_main_admin() then
    raise exception 'Main administrator access is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A clear reversal reason is required';
  end if;
  update public.payments
  set reversed_at = now(), reversal_reason = trim(p_reason)
  where id = p_payment_id and reversed_at is null;
  if not found then raise exception 'Payment was not found or was already reversed'; end if;
end;
$$;
