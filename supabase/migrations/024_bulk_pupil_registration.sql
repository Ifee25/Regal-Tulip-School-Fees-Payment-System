alter table public.pupils
  add column profile_pending boolean not null default false,
  alter column date_of_birth drop not null,
  alter column gender drop not null,
  alter column guardian_name drop not null,
  alter column house_address drop not null,
  add constraint completed_pupil_has_required_details check (
    profile_pending or (
      date_of_birth is not null and gender is not null
      and guardian_name is not null and house_address is not null
    )
  );

create function public.bulk_register_pupils(p_pupils jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_school_admin() is not true then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  if pg_catalog.jsonb_typeof(p_pupils) is distinct from 'array' then
    raise exception 'Enter at least one pupil';
  end if;
  if pg_catalog.jsonb_array_length(p_pupils) not between 1 and 250 then
    raise exception 'Enter between 1 and 250 pupils per batch';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_pupils) as entry(pupil)
    where nullif(trim(pupil->>'first_name'), '') is null
       or nullif(trim(pupil->>'last_name'), '') is null
       or nullif(trim(pupil->>'guardian_phone'), '') is null
  ) then
    raise exception 'Every pupil needs a first name, last name, and parent phone number';
  end if;

  insert into public.pupils (first_name, last_name, guardian_phone, profile_pending)
  select trim(pupil->>'first_name'), trim(pupil->>'last_name'),
         trim(pupil->>'guardian_phone'), true
  from pg_catalog.jsonb_array_elements(p_pupils) with ordinality as entry(pupil, position)
  order by position;
end;
$$;

create function public.complete_pupil_profile(
  p_pupil_id uuid,
  p_details jsonb,
  p_uses_bus boolean,
  p_bus_route text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_details public.pupils;
  v_term_id uuid;
  v_route_id uuid;
begin
  if public.is_school_admin() is not true then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  perform 1 from public.pupils
  where id = p_pupil_id and active and profile_pending
  for update;
  if not found then
    raise exception 'This pupil is no longer awaiting profile completion. Refresh the pupil list.';
  end if;

  select id into v_term_id from public.terms where active;
  if v_term_id is null then
    raise exception 'No active school term has been configured';
  end if;

  v_details := pg_catalog.jsonb_populate_record(null::public.pupils, p_details);
  if v_details.class_id is null then
    raise exception 'Select a class to complete the pupil profile';
  end if;

  perform public.sync_pupil_invoices_after_edit(
    p_pupil_id, v_term_id, v_details.class_id, v_details.fee_section,
    v_details.far_away_location, p_uses_bus
  );

  if p_uses_bus then
    if nullif(trim(p_bus_route), '') is not null then
      insert into public.bus_routes (name) values (trim(p_bus_route))
      on conflict (name) do update set name = excluded.name
      returning id into v_route_id;
    end if;

    insert into public.bus_enrollments (pupil_id, term_id, route_id, pickup_address)
    values (p_pupil_id, v_term_id, v_route_id, v_details.house_address);
  end if;

  update public.pupils set
    first_name = v_details.first_name,
    last_name = v_details.last_name,
    admission_type = v_details.admission_type,
    class_id = v_details.class_id,
    date_of_birth = v_details.date_of_birth,
    gender = v_details.gender,
    guardian_name = v_details.guardian_name,
    guardian_phone = v_details.guardian_phone,
    state_of_origin = v_details.state_of_origin,
    house_address = v_details.house_address,
    height_cm = v_details.height_cm,
    weight_kg = v_details.weight_kg,
    blood_group = v_details.blood_group,
    complexion = v_details.complexion,
    fee_section = v_details.fee_section,
    far_away_location = v_details.far_away_location,
    photo_path = v_details.photo_path,
    profile_pending = false
  where id = p_pupil_id;
end;
$$;

revoke all on function public.bulk_register_pupils(jsonb) from public;
grant execute on function public.bulk_register_pupils(jsonb) to authenticated;
revoke all on function public.complete_pupil_profile(uuid, jsonb, boolean, text) from public;
grant execute on function public.complete_pupil_profile(uuid, jsonb, boolean, text) to authenticated;

notify pgrst, 'reload schema';
