alter table public.admin_profiles
add column if not exists account_setup_complete boolean not null default false;

create or replace function public.complete_admin_account_setup(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_username text;
begin
  select lower(email) into v_email
  from auth.users
  where id = auth.uid();

  if v_email not in (
    'regaltulipschool@gmail.com',
    'ogechukwuifunanya@gmail.com'
  ) then
    raise exception 'This email is not approved for administrator access';
  end if;

  v_username := lower(trim(coalesce(p_username, '')));
  if v_username !~ '^[a-z][a-z0-9._]{2,29}$' then
    raise exception 'Username must start with a letter and contain 3 to 30 letters, numbers, dots or underscores';
  end if;

  update public.admin_profiles
  set username = v_username, account_setup_complete = true
  where id = auth.uid();

  if not found then
    raise exception 'Administrator profile was not found';
  end if;
exception
  when unique_violation then
    raise exception 'That username is already in use';
end;
$$;

revoke all on function public.complete_admin_account_setup(text) from public;
grant execute on function public.complete_admin_account_setup(text) to authenticated;
