-- Both approved administrators may register pupils. Financial schedules remain
-- private because all invoice calculation happens inside this function.
create or replace function public.register_pupil(
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
  v_pupil_id uuid;
  v_class_id uuid;
  v_term_id uuid;
  v_tuition_category_id uuid;
  v_bus_category_id uuid;
  v_tuition_amount numeric;
  v_bus_amount numeric;
  v_route_id uuid;
  v_location text;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
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

  select id into v_class_id
  from public.classes where name = p_class_name;
  if v_class_id is null then raise exception 'Class was not found'; end if;

  select id into v_term_id
  from public.terms where active = true;
  if v_term_id is null then raise exception 'No active school term has been configured'; end if;

  select id into v_tuition_category_id
  from public.fee_categories where name = 'Tuition' and active = true;
  select id into v_bus_category_id
  from public.fee_categories where name = 'School Bus' and active = true;

  select amount_due into v_tuition_amount
  from public.fee_schedules
  where term_id = v_term_id
    and class_id = v_class_id
    and category_id = v_tuition_category_id
    and fee_section = p_fee_section
    and lower(far_away_location) = lower(v_location);
  if v_tuition_amount is null then
    raise exception 'The expected school fee has not been configured for this term, class and section';
  end if;

  if p_uses_bus then
    select amount_due into v_bus_amount
    from public.fee_schedules
    where term_id = v_term_id
      and class_id = v_class_id
      and category_id = v_bus_category_id
      and fee_section = p_fee_section
      and lower(far_away_location) = lower(v_location);
    if v_bus_amount is null then
      raise exception 'The expected bus fee has not been configured for this term, class and section';
    end if;
  end if;

  insert into public.pupils(
    admission_number, first_name, last_name, admission_type, class_id,
    date_of_birth, gender, guardian_name, guardian_phone, state_of_origin,
    house_address, height_cm, weight_kg, blood_group, complexion, photo_path,
    fee_section, far_away_location
  )
  values (
    trim(p_admission_number), trim(p_first_name), trim(p_last_name),
    p_admission_type::public.admission_type, v_class_id, p_date_of_birth,
    p_gender, trim(p_guardian_name), trim(p_guardian_phone),
    nullif(trim(p_state_of_origin), ''), trim(p_house_address),
    p_height_cm, p_weight_kg, nullif(trim(p_blood_group), ''),
    nullif(trim(p_complexion), ''), nullif(trim(p_photo_path), ''),
    p_fee_section, nullif(v_location, '')
  )
  returning id into v_pupil_id;

  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  values (v_pupil_id, v_term_id, v_tuition_category_id, v_tuition_amount);

  if p_uses_bus then
    insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
    values (v_pupil_id, v_term_id, v_bus_category_id, v_bus_amount);

    if length(trim(coalesce(p_bus_route, ''))) > 0 then
      insert into public.bus_routes(name)
      values (trim(p_bus_route))
      on conflict (name) do update set name = excluded.name
      returning id into v_route_id;
    end if;

    insert into public.bus_enrollments(
      pupil_id, term_id, route_id, pickup_address
    )
    values (v_pupil_id, v_term_id, v_route_id, trim(p_house_address));
  end if;

  return v_pupil_id;
end;
$$;

revoke all on function public.register_pupil(
  text, text, text, text, text, date, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, boolean, text
) from public;

grant execute on function public.register_pupil(
  text, text, text, text, text, date, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, boolean, text
) to authenticated;

drop policy if exists "main admin uploads pupil photos" on storage.objects;
create policy "approved admins upload pupil photos" on storage.objects for insert to authenticated
with check (bucket_id = 'pupil-photos' and public.is_school_admin());
