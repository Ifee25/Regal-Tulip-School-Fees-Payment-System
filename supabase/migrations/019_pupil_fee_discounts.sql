create table if not exists public.pupil_fee_discounts (
  id uuid primary key default gen_random_uuid(),
  pupil_id uuid not null references public.pupils(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  category_id uuid not null references public.fee_categories(id) on delete cascade,
  custom_amount_due numeric(12,2) not null check (custom_amount_due >= 0),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pupil_id, term_id, category_id)
);

alter table public.pupil_fee_discounts enable row level security;

create policy "main admin manages pupil discounts"
on public.pupil_fee_discounts for all to authenticated
using (public.is_main_admin())
with check (public.is_main_admin());

create or replace function public.protect_discounted_invoice_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_custom_amount numeric;
begin
  select custom_amount_due into v_custom_amount
  from public.pupil_fee_discounts
  where pupil_id = new.pupil_id
    and term_id = new.term_id
    and category_id = new.category_id;

  if found then
    new.amount_due := v_custom_amount;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_discounted_invoice_amount on public.fee_invoices;
create trigger protect_discounted_invoice_amount
before insert or update of amount_due on public.fee_invoices
for each row execute function public.protect_discounted_invoice_amount();

create or replace function public.save_pupil_discount(
  p_pupil_id uuid,
  p_term_id uuid,
  p_category_name text,
  p_custom_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_discount_id uuid;
begin
  if not public.is_main_admin() then
    raise exception 'Main administrator access is required';
  end if;
  if p_custom_amount < 0 then
    raise exception 'The custom expected amount cannot be negative';
  end if;
  if p_category_name not in ('Tuition', 'School Bus') then
    raise exception 'Invalid fee category';
  end if;

  select id into v_category_id
  from public.fee_categories
  where name = p_category_name and active = true;
  if v_category_id is null then
    raise exception 'Fee category was not found';
  end if;

  insert into public.pupil_fee_discounts(
    pupil_id, term_id, category_id, custom_amount_due, created_by
  )
  values (
    p_pupil_id, p_term_id, v_category_id, p_custom_amount, auth.uid()
  )
  on conflict (pupil_id, term_id, category_id)
  do update set
    custom_amount_due = excluded.custom_amount_due,
    updated_at = now()
  returning id into v_discount_id;

  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  values (p_pupil_id, p_term_id, v_category_id, p_custom_amount)
  on conflict (pupil_id, term_id, category_id)
  do update set amount_due = excluded.amount_due;

  return v_discount_id;
end;
$$;

create or replace function public.remove_pupil_discount(
  p_pupil_id uuid,
  p_term_id uuid,
  p_category_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_class_id uuid;
  v_fee_section text;
  v_location text;
  v_standard_amount numeric;
begin
  if not public.is_main_admin() then
    raise exception 'Main administrator access is required';
  end if;

  select id into v_category_id
  from public.fee_categories
  where name = p_category_name and active = true;

  delete from public.pupil_fee_discounts
  where pupil_id = p_pupil_id
    and term_id = p_term_id
    and category_id = v_category_id;

  select class_id, fee_section, coalesce(far_away_location, '')
  into v_class_id, v_fee_section, v_location
  from public.pupils
  where id = p_pupil_id;

  if p_category_name = 'Tuition' then
    v_fee_section := 'Inside Estate';
    v_location := '';
  end if;

  select amount_due into v_standard_amount
  from public.fee_schedules
  where term_id = p_term_id
    and class_id = v_class_id
    and category_id = v_category_id
    and fee_section = v_fee_section
    and lower(far_away_location) = lower(v_location);

  if v_standard_amount is not null then
    update public.fee_invoices
    set amount_due = v_standard_amount
    where pupil_id = p_pupil_id
      and term_id = p_term_id
      and category_id = v_category_id;
  end if;
end;
$$;

create or replace view public.pupil_discount_overview
with (security_invoker = true) as
select
  d.id,
  d.pupil_id,
  d.term_id,
  c.name category_name,
  d.custom_amount_due,
  d.updated_at
from public.pupil_fee_discounts d
join public.fee_categories c on c.id = d.category_id;

revoke all on function public.save_pupil_discount(uuid, uuid, text, numeric) from public;
grant execute on function public.save_pupil_discount(uuid, uuid, text, numeric) to authenticated;
revoke all on function public.remove_pupil_discount(uuid, uuid, text) from public;
grant execute on function public.remove_pupil_discount(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
