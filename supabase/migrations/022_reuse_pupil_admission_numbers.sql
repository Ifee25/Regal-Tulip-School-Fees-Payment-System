create unique index pupils_active_admission_number_key
on public.pupils (admission_number)
where active;

alter table public.pupils drop constraint pupils_admission_number_key;

create or replace function public.assign_pupil_admission_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  -- Serialize allocation and archiving so each released number is claimed once.
  perform pg_catalog.pg_advisory_xact_lock(731415, 22);

  select archived.admission_number into v_number
  from public.pupils as archived
  where not archived.active
    and not exists (
      select 1
      from public.pupils as enrolled
      where enrolled.active and enrolled.admission_number = archived.admission_number
    )
  order by archived.admission_number
  limit 1;

  if found then
    new.admission_number := v_number;
  else
    v_number := pg_catalog.nextval('public.pupil_admission_number_seq')::text;
    new.admission_number := 'RTS/' ||
      pg_catalog.to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '/' ||
      pg_catalog.lpad(v_number, greatest(3, length(v_number)), '0');
  end if;

  return new;
end;
$$;

create or replace function public.archive_pupils(p_pupil_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_school_admin() is not true then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(731415, 22);

  update public.pupils
  set active = false
  where id = any(p_pupil_ids) and active;
end;
$$;

notify pgrst, 'reload schema';
