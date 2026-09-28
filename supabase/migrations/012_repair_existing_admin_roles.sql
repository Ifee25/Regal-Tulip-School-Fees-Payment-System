-- Repair role/profile mismatches for approved users that already completed
-- signup. Chosen usernames are preserved.
insert into public.admin_profiles as existing_profile (
  id,
  full_name,
  role,
  username,
  account_setup_complete
)
select
  u.id,
  case
    when lower(u.email) = 'regaltulipschool@gmail.com'
      then 'Main Administrator'
    else 'Payment Administrator'
  end,
  case
    when lower(u.email) = 'regaltulipschool@gmail.com'
      then 'main_admin'
    else 'payment_admin'
  end,
  lower(coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'username'), ''),
    case
      when lower(u.email) = 'regaltulipschool@gmail.com'
        then 'regaltulipadmin'
      else 'ogechukwuifunanya'
    end
  )),
  true
from auth.users u
where lower(u.email) in (
  'regaltulipschool@gmail.com',
  'ogechukwuifunanya@gmail.com'
)
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  username = coalesce(existing_profile.username, excluded.username),
  account_setup_complete = true;

create or replace function public.get_my_admin_profile()
returns table (
  id uuid,
  role text,
  username text,
  account_setup_complete boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  return query
  select p.id, p.role, p.username, p.account_setup_complete
  from public.admin_profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and (
      (lower(u.email) = 'regaltulipschool@gmail.com' and p.role = 'main_admin')
      or
      (lower(u.email) = 'ogechukwuifunanya@gmail.com' and p.role = 'payment_admin')
    );
end;
$$;

revoke all on function public.get_my_admin_profile() from public;
grant execute on function public.get_my_admin_profile() to authenticated;
