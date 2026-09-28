-- Keep the payment administrator dashboard scoped to the selected term.
create or replace function public.get_payment_admin_partials()
returns table (
  pupil_id uuid,
  fee_expected numeric,
  fee_paid numeric,
  bus_expected numeric,
  bus_paid numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term_id uuid;
begin
  if not public.is_payment_admin() then
    raise exception 'Payment administrator access is required';
  end if;

  select id into v_term_id
  from public.terms
  where active = true;

  if v_term_id is null then
    raise exception 'No active school term has been configured';
  end if;

  return query
  with invoice_values as (
    select
      i.id,
      i.pupil_id,
      c.category_type,
      i.amount_due expected,
      coalesce(sum(a.amount) filter (where p.reversed_at is null), 0) paid
    from public.fee_invoices i
    join public.fee_categories c on c.id = i.category_id
    left join public.payment_allocations a on a.invoice_id = i.id
    left join public.payments p on p.id = a.payment_id
    where i.term_id = v_term_id
    group by i.id, c.category_type
  ),
  balances as (
    select
      iv.pupil_id,
      iv.category_type,
      sum(iv.expected) expected,
      sum(iv.paid) paid
    from invoice_values iv
    group by iv.pupil_id, iv.category_type
  )
  select
    b.pupil_id,
    max(b.expected) filter (
      where b.category_type = 'school' and b.paid > 0 and b.paid < b.expected
    ),
    max(b.paid) filter (
      where b.category_type = 'school' and b.paid > 0 and b.paid < b.expected
    ),
    max(b.expected) filter (
      where b.category_type = 'transport' and b.paid > 0 and b.paid < b.expected
    ),
    max(b.paid) filter (
      where b.category_type = 'transport' and b.paid > 0 and b.paid < b.expected
    )
  from balances b
  group by b.pupil_id
  having bool_or(b.paid > 0 and b.paid < b.expected);
end;
$$;

revoke all on function public.get_payment_admin_partials() from public;
grant execute on function public.get_payment_admin_partials() to authenticated;

notify pgrst, 'reload schema';
