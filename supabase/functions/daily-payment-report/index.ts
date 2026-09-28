import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const reportDate = new Date().toISOString().slice(0, 10)
  const start = `${reportDate}T00:00:00.000Z`
  const end = `${reportDate}T23:59:59.999Z`

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, amount, payment_method, paid_at, pupil:pupils(first_name,last_name,admission_number), allocations:payment_allocations(amount, invoice:fee_invoices(category:fee_categories(name)))')
    .gte('paid_at', start)
    .lte('paid_at', end)
    .is('reversed_at', null)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const categories: Record<string, number> = {}
  for (const payment of payments ?? []) {
    for (const allocation of payment.allocations ?? []) {
      const name = allocation.invoice?.category?.name ?? 'Unallocated'
      categories[name] = (categories[name] ?? 0) + Number(allocation.amount)
    }
  }

  const payload = {
    reportDate,
    paymentCount: payments?.length ?? 0,
    totalCollected: (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0),
    categories,
    payments,
  }

  const { error: logError } = await supabase.from('daily_report_logs').upsert({
    report_date: reportDate,
    total_collected: payload.totalCollected,
    payload,
    delivery_status: 'generated',
  }, { onConflict: 'report_date' })

  if (logError) return new Response(JSON.stringify({ error: logError.message }), { status: 500 })

  // Add your approved email or WhatsApp provider here, using a secret stored
  // with `supabase secrets set`. Never expose provider keys in browser code.
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
