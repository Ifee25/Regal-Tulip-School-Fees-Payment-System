create sequence public.pupil_admission_number_seq;

select pg_catalog.setval(
  'public.pupil_admission_number_seq',
  coalesce(max(substring(admission_number from '^RTS/[0-9]{4}/([0-9]{1,18})$')::bigint), 0) + 1,
  false
)
from public.pupils;

create function public.assign_pupil_admission_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  v_number := pg_catalog.nextval('public.pupil_admission_number_seq')::text;
  new.admission_number := 'RTS/' ||
    pg_catalog.to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '/' ||
    pg_catalog.lpad(v_number, greatest(3, length(v_number)), '0');
  return new;
end;
$$;

revoke all on function public.assign_pupil_admission_number() from public;

create trigger assign_pupil_admission_number
before insert on public.pupils
for each row execute function public.assign_pupil_admission_number();

create function public.archive_pupils(p_pupil_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_main_admin() is not true then
    raise exception 'Main administrator access is required' using errcode = '42501';
  end if;

  update public.pupils
  set active = false
  where id = any(p_pupil_ids) and active;
end;
$$;

revoke all on function public.archive_pupils(uuid[]) from public;
grant execute on function public.archive_pupils(uuid[]) to authenticated;

notify pgrst, 'reload schema';
