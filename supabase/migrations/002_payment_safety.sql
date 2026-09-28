create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pupils_set_updated_at
before update on public.pupils
for each row execute function public.set_updated_at();

create or replace function public.record_payment(
  p_pupil_id uuid,
  p_term_id uuid,
  p_category_name text,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_payment_id uuid;
  v_amount_due numeric;
  v_amount_paid numeric;
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select i.id, i.amount_due,
    coalesce(sum(a.amount) filter (where p.reversed_at is null), 0)
  into v_invoice_id, v_amount_due, v_amount_paid
  from public.fee_invoices i
  join public.fee_categories c on c.id = i.category_id
  left join public.payment_allocations a on a.invoice_id = i.id
  left join public.payments p on p.id = a.payment_id
  where i.pupil_id = p_pupil_id
    and i.term_id = p_term_id
    and c.name = p_category_name
  group by i.id;

  if v_invoice_id is null then
    raise exception 'No % invoice exists for this pupil in the active term', p_category_name;
  end if;
  if p_amount > greatest(v_amount_due - v_amount_paid, 0) then
    raise exception 'Payment exceeds the outstanding balance of %', greatest(v_amount_due - v_amount_paid, 0);
  end if;

  insert into public.payments(pupil_id, term_id, amount, payment_method, reference)
  values (
    p_pupil_id, p_term_id, p_amount,
    p_payment_method::public.payment_method, nullif(trim(p_reference), '')
  )
  returning id into v_payment_id;

  insert into public.payment_allocations(payment_id, invoice_id, amount)
  values (v_payment_id, v_invoice_id, p_amount);

  return v_payment_id;
end;
$$;

create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_school_admin() then
    raise exception 'Administrator access is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A clear reversal reason is required';
  end if;

  update public.payments
  set reversed_at = now(), reversal_reason = trim(p_reason)
  where id = p_payment_id and reversed_at is null;

  if not found then
    raise exception 'Payment was not found or was already reversed';
  end if;
end;
$$;

revoke all on function public.record_payment(uuid, uuid, text, numeric, text, text) from public;
grant execute on function public.record_payment(uuid, uuid, text, numeric, text, text) to authenticated;
revoke all on function public.reverse_payment(uuid, text) from public;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
