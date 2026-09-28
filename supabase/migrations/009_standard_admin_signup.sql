create or replace function public.assign_approved_admin_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_name text;
  v_username text;
  v_setup_complete boolean;
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

  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_setup_complete := v_username <> '';

  if not v_setup_complete then
    v_username := case
      when v_role = 'main_admin' then 'regaltulipadmin'
      else 'ogechukwuifunanya'
    end;
  end if;

  if v_username !~ '^[a-z][a-z0-9._]{2,29}$' then
    raise exception 'Username must start with a letter and contain 3 to 30 letters, numbers, dots or underscores';
  end if;

  insert into public.admin_profiles as existing_profile (
    id, full_name, role, username, account_setup_complete
  )
  values (
    new.id, v_name, v_role, v_username, v_setup_complete
  )
  on conflict (id) do update set
    role = excluded.role,
    username = case
      when excluded.account_setup_complete then excluded.username
      else existing_profile.username
    end,
    account_setup_complete = (
      existing_profile.account_setup_complete
      or excluded.account_setup_complete
    );

  return new;
exception
  when unique_violation then
    raise exception 'That username is already in use';
end;
$$;
