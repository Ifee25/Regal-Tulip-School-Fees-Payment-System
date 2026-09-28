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
  select
    p.id,
    p.role,
    p.username,
    p.account_setup_complete
  from public.admin_profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and lower(u.email) in (
      'regaltulipschool@gmail.com',
      'ogechukwuifunanya@gmail.com'
    )
    and (
      (lower(u.email) = 'regaltulipschool@gmail.com' and p.role = 'main_admin')
      or
      (lower(u.email) = 'ogechukwuifunanya@gmail.com' and p.role = 'payment_admin')
    );
end;
$$;

revoke all on function public.get_my_admin_profile() from public;
grant execute on function public.get_my_admin_profile() to authenticated;
