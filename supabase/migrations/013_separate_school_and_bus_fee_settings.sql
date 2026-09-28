create or replace function public.save_school_fee_schedule(
  p_term_id uuid,
  p_class_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_schedule_id uuid;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_amount < 0 then
    raise exception 'Expected fee cannot be negative';
  end if;

  select id into v_category_id
  from public.fee_categories
  where name = 'Tuition' and active = true;

  if v_category_id is null then
    raise exception 'The Tuition fee category was not found';
  end if;

  select id into v_schedule_id
  from public.fee_schedules
  where term_id = p_term_id
    and class_id = p_class_id
    and category_id = v_category_id
    and fee_section = 'Inside Estate'
    and far_away_location = '';

  if v_schedule_id is null then
    insert into public.fee_schedules(
      term_id, class_id, category_id, fee_section, far_away_location, amount_due
    )
    values (
      p_term_id, p_class_id, v_category_id, 'Inside Estate', '', p_amount
    )
    returning id into v_schedule_id;
  else
    update public.fee_schedules
    set amount_due = p_amount, updated_by = auth.uid(), updated_at = now()
    where id = v_schedule_id;
  end if;

  -- Keep any older location-based Tuition rows consistent with the single class rate.
  update public.fee_schedules
  set amount_due = p_amount, updated_by = auth.uid(), updated_at = now()
  where term_id = p_term_id
    and class_id = p_class_id
    and category_id = v_category_id;

  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  select id, p_term_id, v_category_id, p_amount
  from public.pupils
  where class_id = p_class_id and active = true
  on conflict (pupil_id, term_id, category_id)
  do update set amount_due = excluded.amount_due;

  return v_schedule_id;
end;
$$;

revoke all on function public.save_school_fee_schedule(uuid, uuid, numeric) from public;
grant execute on function public.save_school_fee_schedule(uuid, uuid, numeric) to authenticated;

-- A newly registered pupil receives the class-wide Tuition rate regardless of bus area.
create or replace function public.apply_school_fee_to_new_pupil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  select
    new.id,
    s.term_id,
    s.category_id,
    s.amount_due
  from public.fee_schedules s
  join public.fee_categories c on c.id = s.category_id
  where s.class_id = new.class_id
    and s.fee_section = 'Inside Estate'
    and s.far_away_location = ''
    and c.name = 'Tuition'
  on conflict (pupil_id, term_id, category_id)
  do update set amount_due = excluded.amount_due;

  return new;
end;
$$;

drop trigger if exists apply_school_fee_after_pupil_insert on public.pupils;
create trigger apply_school_fee_after_pupil_insert
after insert on public.pupils
for each row execute function public.apply_school_fee_to_new_pupil();
