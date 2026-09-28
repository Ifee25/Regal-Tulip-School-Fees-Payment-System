create or replace function public.save_bus_area_fee_schedule(
  p_term_id uuid,
  p_fee_section text,
  p_far_away_location text,
  p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_location text;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_amount < 0 then
    raise exception 'Expected bus fee cannot be negative';
  end if;
  if p_fee_section not in ('Inside Estate', 'Outside Estate', 'Far Away') then
    raise exception 'Invalid bus fee area';
  end if;

  v_location := case
    when p_fee_section = 'Far Away' then trim(coalesce(p_far_away_location, ''))
    else ''
  end;
  if p_fee_section = 'Far Away' and v_location = '' then
    raise exception 'A location is required for the Far Away bus fee';
  end if;

  select id into v_category_id
  from public.fee_categories
  where name = 'School Bus' and active = true;
  if v_category_id is null then
    raise exception 'The School Bus fee category was not found';
  end if;

  insert into public.fee_schedules(
    term_id, class_id, category_id, fee_section, far_away_location, amount_due
  )
  select
    p_term_id, c.id, v_category_id, p_fee_section, v_location, p_amount
  from public.classes c
  on conflict (
    term_id, class_id, category_id, fee_section, lower(far_away_location)
  )
  do update set
    amount_due = excluded.amount_due,
    updated_by = auth.uid(),
    updated_at = now();

  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  select p.id, p_term_id, v_category_id, p_amount
  from public.pupils p
  where p.active = true
    and p.fee_section = p_fee_section
    and (
      p_fee_section <> 'Far Away'
      or lower(trim(p.far_away_location)) = lower(v_location)
    )
    and exists (
      select 1
      from public.bus_enrollments b
      where b.pupil_id = p.id
        and b.term_id = p_term_id
        and b.active = true
    )
  on conflict (pupil_id, term_id, category_id)
  do update set amount_due = excluded.amount_due;
end;
$$;

revoke all on function public.save_bus_area_fee_schedule(uuid, text, text, numeric) from public;
grant execute on function public.save_bus_area_fee_schedule(uuid, text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
