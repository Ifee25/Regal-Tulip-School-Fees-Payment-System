alter table public.pupils
add column fee_section text not null default 'Inside Estate'
check (fee_section in ('Inside Estate', 'Outside Estate', 'Far Away')),
add column far_away_location text;

alter table public.pupils
add constraint far_away_location_required
check (
  fee_section <> 'Far Away'
  or length(trim(coalesce(far_away_location, ''))) > 0
);

alter table public.fee_schedules
drop constraint if exists fee_schedules_term_id_class_id_category_id_key;

alter table public.fee_schedules
add column fee_section text not null default 'Inside Estate'
check (fee_section in ('Inside Estate', 'Outside Estate', 'Far Away')),
add column far_away_location text not null default '';

alter table public.fee_schedules
add constraint fee_schedule_location_consistency
check (
  (fee_section = 'Far Away' and length(trim(far_away_location)) > 0)
  or (fee_section <> 'Far Away' and far_away_location = '')
);

create unique index fee_schedules_unique_rate
on public.fee_schedules (
  term_id,
  class_id,
  category_id,
  fee_section,
  lower(far_away_location)
);

drop view if exists public.fee_schedule_overview;

create view public.fee_schedule_overview
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
  s.fee_section,
  s.far_away_location,
  s.amount_due,
  s.updated_at
from public.fee_schedules s
join public.terms t on t.id = s.term_id
join public.academic_sessions a on a.id = t.session_id
join public.classes c on c.id = s.class_id
join public.fee_categories f on f.id = s.category_id;

create or replace function public.save_location_fee_schedule(
  p_term_id uuid,
  p_class_id uuid,
  p_category_name text,
  p_fee_section text,
  p_far_away_location text,
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
  v_location text;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_amount < 0 then
    raise exception 'Expected fee cannot be negative';
  end if;
  if p_fee_section not in ('Inside Estate', 'Outside Estate', 'Far Away') then
    raise exception 'Invalid fee section';
  end if;

  v_location := case
    when p_fee_section = 'Far Away' then trim(coalesce(p_far_away_location, ''))
    else ''
  end;
  if p_fee_section = 'Far Away' and v_location = '' then
    raise exception 'A location is required for the Far Away section';
  end if;

  select id into v_category_id
  from public.fee_categories
  where name = p_category_name and active = true;
  if v_category_id is null then
    raise exception 'Fee category % was not found', p_category_name;
  end if;

  select id into v_schedule_id
  from public.fee_schedules
  where term_id = p_term_id
    and class_id = p_class_id
    and category_id = v_category_id
    and fee_section = p_fee_section
    and lower(far_away_location) = lower(v_location);

  if v_schedule_id is null then
    insert into public.fee_schedules(
      term_id, class_id, category_id, fee_section, far_away_location, amount_due
    )
    values (
      p_term_id, p_class_id, v_category_id, p_fee_section, v_location, p_amount
    )
    returning id into v_schedule_id;
  else
    update public.fee_schedules
    set amount_due = p_amount, updated_by = auth.uid(), updated_at = now()
    where id = v_schedule_id;
  end if;

  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  select p.id, p_term_id, v_category_id, p_amount
  from public.pupils p
  where p.class_id = p_class_id
    and p.active = true
    and p.fee_section = p_fee_section
    and (
      p_fee_section <> 'Far Away'
      or lower(trim(p.far_away_location)) = lower(v_location)
    )
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

revoke all on function public.save_location_fee_schedule(uuid, uuid, text, text, text, numeric) from public;
grant execute on function public.save_location_fee_schedule(uuid, uuid, text, text, text, numeric) to authenticated;
