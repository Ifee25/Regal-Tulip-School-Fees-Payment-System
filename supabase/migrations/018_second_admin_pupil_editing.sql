create policy "payment admin updates pupils"
on public.pupils for update to authenticated
using (public.is_payment_admin())
with check (public.is_payment_admin());

create policy "payment admin creates bus routes"
on public.bus_routes for insert to authenticated
with check (public.is_payment_admin());

create policy "payment admin updates bus routes"
on public.bus_routes for update to authenticated
using (public.is_payment_admin())
with check (public.is_payment_admin());

create policy "payment admin creates bus enrollment"
on public.bus_enrollments for insert to authenticated
with check (public.is_payment_admin());

create policy "payment admin updates bus enrollment"
on public.bus_enrollments for update to authenticated
using (public.is_payment_admin())
with check (public.is_payment_admin());

create policy "payment admin deletes bus enrollment"
on public.bus_enrollments for delete to authenticated
using (public.is_payment_admin());

create or replace function public.sync_pupil_invoices_after_edit(
  p_pupil_id uuid,
  p_term_id uuid,
  p_class_id uuid,
  p_fee_section text,
  p_far_away_location text,
  p_uses_bus boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tuition_category_id uuid;
  v_bus_category_id uuid;
  v_tuition_amount numeric;
  v_bus_amount numeric;
  v_location text;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;

  v_location := case
    when p_fee_section = 'Far Away' then trim(coalesce(p_far_away_location, ''))
    else ''
  end;

  select id into v_tuition_category_id
  from public.fee_categories
  where name = 'Tuition' and active = true;

  select amount_due into v_tuition_amount
  from public.fee_schedules
  where term_id = p_term_id
    and class_id = p_class_id
    and category_id = v_tuition_category_id
    and fee_section = 'Inside Estate'
    and far_away_location = '';

  if v_tuition_amount is null then
    raise exception 'The school fee has not been configured for this term and class';
  end if;

  insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
  values (p_pupil_id, p_term_id, v_tuition_category_id, v_tuition_amount)
  on conflict (pupil_id, term_id, category_id)
  do update set amount_due = excluded.amount_due;

  select id into v_bus_category_id
  from public.fee_categories
  where name = 'School Bus' and active = true;

  if p_uses_bus then
    select amount_due into v_bus_amount
    from public.fee_schedules
    where term_id = p_term_id
      and class_id = p_class_id
      and category_id = v_bus_category_id
      and fee_section = p_fee_section
      and lower(far_away_location) = lower(v_location);

    if v_bus_amount is null then
      raise exception 'The expected bus fee has not been configured for this area';
    end if;

    insert into public.fee_invoices(pupil_id, term_id, category_id, amount_due)
    values (p_pupil_id, p_term_id, v_bus_category_id, v_bus_amount)
    on conflict (pupil_id, term_id, category_id)
    do update set amount_due = excluded.amount_due;
  else
    update public.fee_invoices
    set amount_due = 0
    where pupil_id = p_pupil_id
      and term_id = p_term_id
      and category_id = v_bus_category_id;
  end if;
end;
$$;

revoke all on function public.sync_pupil_invoices_after_edit(
  uuid, uuid, uuid, text, text, boolean
) from public;
grant execute on function public.sync_pupil_invoices_after_edit(
  uuid, uuid, uuid, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';
