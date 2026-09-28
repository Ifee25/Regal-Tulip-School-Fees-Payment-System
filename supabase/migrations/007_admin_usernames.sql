alter table public.admin_profiles
add column if not exists username text;

update public.admin_profiles p
set username = case
  when lower(u.email) = 'regaltulipschool@gmail.com' then 'regaltulipadmin'
  when lower(u.email) = 'ogechukwuifunanya@gmail.com' then 'ogechukwuifunanya'
end
from auth.users u
where u.id = p.id and p.username is null;

create unique index if not exists admin_profiles_username_unique
on public.admin_profiles(lower(username));

alter table public.admin_profiles
drop constraint if exists admin_username_format;

alter table public.admin_profiles
add constraint admin_username_format
check (username ~ '^[A-Za-z][A-Za-z0-9._]{2,29}$');

create or replace function public.assign_approved_admin_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_name text;
  v_username text;
begin
  if lower(new.email) = 'regaltulipschool@gmail.com' then
    v_role := 'main_admin';
    v_name := 'Main Administrator';
  elsif lower(new.email) = 'ogechukwuifunanya@gmail.com' then
    v_role := 'payment_admin';
    v_name := 'Payment Administrator';
  else
    return new;
  end if;

  v_username := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if v_username = '' then
    v_username := case
      when v_role = 'main_admin' then 'regaltulipadmin'
      else 'ogechukwuifunanya'
    end;
  end if;
  if v_username !~ '^[A-Za-z][A-Za-z0-9._]{2,29}$' then
    raise exception 'Username must start with a letter and contain 3 to 30 letters, numbers, dots or underscores';
  end if;

  insert into public.admin_profiles(id, full_name, role, username)
  values (new.id, v_name, v_role, lower(v_username))
  on conflict (id) do update set
    role = excluded.role,
    username = coalesce(public.admin_profiles.username, excluded.username);

  return new;
exception
  when unique_violation then
    raise exception 'That username is already in use';
end;
$$;

create or replace function public.lookup_approved_admin_email(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select lower(u.email) into v_email
  from public.admin_profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
    and lower(u.email) in (
      'regaltulipschool@gmail.com',
      'ogechukwuifunanya@gmail.com'
    );
  return v_email;
end;
$$;

revoke all on function public.lookup_approved_admin_email(text) from public;
grant execute on function public.lookup_approved_admin_email(text) to anon, authenticated;
