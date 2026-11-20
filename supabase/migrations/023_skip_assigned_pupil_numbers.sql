create or replace function public.assign_pupil_admission_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
  v_prefix text := 'RTS/' || pg_catalog.to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '/';
begin
  -- Use the same lock as archive_pupils so released numbers are claimed once.
  perform pg_catalog.pg_advisory_xact_lock(731415, 22);

  select archived.admission_number into new.admission_number
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
    return new;
  end if;

  -- Older records can already occupy a number reached by the sequence.
  loop
    v_number := pg_catalog.nextval('public.pupil_admission_number_seq')::text;
    new.admission_number := v_prefix ||
      pg_catalog.lpad(v_number, greatest(3, length(v_number)), '0');

    exit when not exists (
      select 1
      from public.pupils
      where active and admission_number = new.admission_number
    );
  end loop;

  return new;
end;
$$;

notify pgrst, 'reload schema';
