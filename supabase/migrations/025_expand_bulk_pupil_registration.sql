create or replace function public.bulk_register_pupils(p_pupils jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_school_admin() is not true then
    raise exception 'Administrator access is required' using errcode = '44001';
  end if;

  if pg_catalog.jsonb_typeof(p_pupils) is distinct from 'array' then
    raise exception 'Enter at least one pupil';
  end if;
  if pg_catalog.jsonb_array_length(p_pupils) not between 1 and 400 then
    raise exception 'Enter between 1 and 400 pupils per batch';
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

notify pgrst, 'reload schema';
