create table public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  category_id uuid not null references public.fee_categories(id),
  amount_due numeric(12,2) not null check (amount_due >= 0),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(term_id, class_id, category_id)
);

alter table public.fee_schedules enable row level security;

create policy "admins manage fee schedules"
on public.fee_schedules for all to authenticated
using (public.is_school_admin())
with check (public.is_school_admin());

create trigger fee_schedules_set_updated_at
before update on public.fee_schedules
for each row execute function public.set_updated_at();

create or replace function public.save_fee_schedule(
  p_term_id uuid,
  p_class_id uuid,
  p_category_name text,
  p_amount numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_schedule_id uuid;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_amount < 0 then
    raise exception 'Expected fee cannot be negative';
  end if;

  select id into v_category_id
  from public.fee_categories
  where name = p_category_name and active = true;

  if v_category_id is null then
    raise exception 'Fee category % was not found', p_category_name;
  end if;

  insert into public.fee_schedules(term_id, class_id, category_id, amount_due)
  values (p_term_id, p_class_id, v_category_id, p_amount)
  on conflict (term_id, class_id, category_id)
  do update set
    amount_due = excluded.amount_due,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_schedule_id;

  -- Apply the new expected amount to every matching pupil invoice. Existing
  -- payments remain unchanged, so balances and statuses recalculate safely.
  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  select p.id, p_term_id, v_category_id, p_amount
  from public.pupils p
  where p.class_id = p_class_id
    and p.active = true
    and (
      p_category_name <> 'School Bus'
      or exists (
        select 1 from public.bus_enrollments b
        where b.pupil_id = p.id and b.term_id = p_term_id and b.active = true
      )
    )
  on conflict (pupil_id, term_id, category_id)
  do update set amount_due = excluded.amount_due;

  return v_schedule_id;
end;
$$;

revoke all on function public.save_fee_schedule(uuid, uuid, text, numeric) from public;
grant execute on function public.save_fee_schedule(uuid, uuid, text, numeric) to authenticated;

create or replace view public.fee_schedule_overview
with (security_invoker = true) as
select
  s.id,
  s.term_id,
  t.name term_name,
  a.name session_name,
  s.class_id,
  c.name class_name,
  f.name category_name,
  f.category_type,
  s.amount_due,
  s.updated_at
from public.fee_schedules s
join public.terms t on t.id = s.term_id
join public.academic_sessions a on a.id = t.session_id
join public.classes c on c.id = s.class_id
join public.fee_categories f on f.id = s.category_id;
