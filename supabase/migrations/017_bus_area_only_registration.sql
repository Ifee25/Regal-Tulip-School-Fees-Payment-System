create or replace function public.register_pupil_with_bus_area(
  p_admission_number text,
  p_first_name text,
  p_last_name text,
  p_admission_type text,
  p_class_name text,
  p_date_of_birth date,
  p_gender text,
  p_guardian_name text,
  p_guardian_phone text,
  p_state_of_origin text,
  p_house_address text,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_blood_group text,
  p_complexion text,
  p_photo_path text,
  p_fee_section text,
  p_far_away_location text,
  p_uses_bus boolean,
  p_bus_route text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term_id uuid;
  v_class_id uuid;
  v_tuition_category_id uuid;
  v_tuition_amount numeric;
  v_location text;
  v_pupil_id uuid;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;

  -- A pupil who does not use the bus has no meaningful transport area.
  if not p_uses_bus then
    p_fee_section := 'Inside Estate';
    p_far_away_location := null;
  end if;

  if p_fee_section not in ('Inside Estate', 'Outside Estate', 'Far Away') then
    raise exception 'Invalid bus fee area';
  end if;

  v_location := case
    when p_fee_section = 'Far Away' then trim(coalesce(p_far_away_location, ''))
    else ''
  end;
  if p_uses_bus and p_fee_section = 'Far Away' and v_location = '' then
    raise exception 'A location is required for the Far Away bus area';
  end if;

  select id into v_class_id
  from public.classes
  where name = p_class_name;

  select id into v_term_id
  from public.terms
  where active = true;

  select id into v_tuition_category_id
  from public.fee_categories
  where name = 'Tuition' and active = true;

  select amount_due into v_tuition_amount
  from public.fee_schedules
  where term_id = v_term_id
    and class_id = v_class_id
    and category_id = v_tuition_category_id
    and fee_section = 'Inside Estate'
    and far_away_location = '';

  if v_tuition_amount is null then
    raise exception 'The expected school fee has not been configured for this term and class';
  end if;

  -- The older registration function expects a location-matched schedule.
  -- Keep a synchronized Tuition row internally without exposing location in
  -- the school-fee registration interface.
  insert into public.fee_schedules(
    term_id, class_id, category_id, fee_section, far_away_location, amount_due
  )
  values (
    v_term_id, v_class_id, v_tuition_category_id,
    p_fee_section, v_location, v_tuition_amount
  )
  on conflict (
    term_id, class_id, category_id, fee_section, lower(far_away_location)
  )
  do update set amount_due = excluded.amount_due;

  select public.register_pupil(
    p_admission_number,
    p_first_name,
    p_last_name,
    p_admission_type,
    p_class_name,
    p_date_of_birth,
    p_gender,
    p_guardian_name,
    p_guardian_phone,
    p_state_of_origin,
    p_house_address,
    p_height_cm,
    p_weight_kg,
    p_blood_group,
    p_complexion,
    p_photo_path,
    p_fee_section,
    nullif(v_location, ''),
    p_uses_bus,
    p_bus_route
  )
  into v_pupil_id;

  return v_pupil_id;
end;
$$;

revoke all on function public.register_pupil_with_bus_area(
  text, text, text, text, text, date, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, boolean, text
) from public;

grant execute on function public.register_pupil_with_bus_area(
  text, text, text, text, text, date, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, boolean, text
) to authenticated;

notify pgrst, 'reload schema';
