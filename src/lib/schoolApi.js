import { supabase } from './supabase'
import { parseCurrencyInput } from '../utils/currencyInput'

const projectUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function getAuthenticatedAdminProfile(accessToken) {
  if (!accessToken) throw new Error('The login session did not include an access token.')
  const response = await fetch(`${projectUrl}/rest/v1/rpc/get_my_admin_profile`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || 'The administrator profile could not be loaded.')
  }
  return Array.isArray(payload) ? payload[0] : payload
}

export async function getActiveTerm() {
  const client = requireClient()
  const { data, error } = await client.from('terms').select('id, name, session:academic_sessions(name)').eq('active', true).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No active school term has been configured.')
  return data
}

export async function loadSchoolData(adminRole = 'main_admin') {
  const client = requireClient()
  const term = await getActiveTerm()
  const { data: pupilRows, error: pupilError } = await client
    .from('pupils')
    .select('*, class:classes(name), bus_enrollments(*, route:bus_routes(name))')
    .eq('active', true)
    .eq('bus_enrollments.term_id', term.id)
    .order('last_name')
  if (pupilError) throw pupilError

  const balances = new Map()
  let paymentRows = []

  if (adminRole === 'main_admin') {
    const [
      { data: balanceRows, error: balanceError },
      { data: rows, error: paymentError },
    ] = await Promise.all([
      client.from('invoice_balances').select('*').eq('term_id', term.id),
      client.from('payments').select('id, pupil_id, amount, payment_method, paid_at, reference, payment_allocations(invoice:fee_invoices(category:fee_categories(name)))').eq('term_id', term.id).is('reversed_at', null).order('paid_at', { ascending: false }).limit(100),
    ])
    if (balanceError) throw balanceError
    if (paymentError) throw paymentError
    paymentRows = rows || []
    for (const row of balanceRows || []) {
      const current = balances.get(row.pupil_id) || { feeExpected: 0, feePaid: 0, busExpected: 0, busPaid: 0, financialVisible: true, feeFinancialVisible: true, busFinancialVisible: true }
      if (row.category_type === 'transport') {
        current.busExpected += Number(row.amount_due)
        current.busPaid += Number(row.amount_paid)
      } else {
        current.feeExpected += Number(row.amount_due)
        current.feePaid += Number(row.amount_paid)
      }
      balances.set(row.pupil_id, current)
    }
  } else {
    const { data: partialRows, error } = await client.rpc('get_payment_admin_partials')
    if (error) throw error
    for (const row of partialRows || []) {
      balances.set(row.pupil_id, {
        feeExpected: Number(row.fee_expected || 0),
        feePaid: Number(row.fee_paid || 0),
        busExpected: Number(row.bus_expected || 0),
        busPaid: Number(row.bus_paid || 0),
        financialVisible: true,
        feeFinancialVisible: row.fee_expected !== null,
        busFinancialVisible: row.bus_expected !== null,
      })
    }
  }

  const pupils = await Promise.all((pupilRows || []).map(async (item) => {
    let photoUrl = ''
    if (item.photo_path) {
      const { data } = await client.storage.from('pupil-photos').createSignedUrl(item.photo_path, 3600)
      photoUrl = data?.signedUrl || ''
    }
    const position = balances.get(item.id) || {
      feeExpected: 0, feePaid: 0, busExpected: 0, busPaid: 0,
      financialVisible: adminRole === 'main_admin',
      feeFinancialVisible: adminRole === 'main_admin',
      busFinancialVisible: adminRole === 'main_admin',
    }
    return {
      id: item.id, admissionNo: item.admission_number, firstName: item.first_name,
      lastName: item.last_name, className: item.class?.name || 'Not assigned',
      dateOfBirth: item.date_of_birth, gender: item.gender, guardianName: item.guardian_name,
      guardianPhone: item.guardian_phone, stateOfOrigin: item.state_of_origin,
      address: item.house_address, height: item.height_cm, weight: item.weight_kg,
      bloodGroup: item.blood_group, complexion: item.complexion,
      feeSection: item.fee_section, farAwayLocation: item.far_away_location || '',
      admissionType: item.admission_type, usesBus: Boolean(item.bus_enrollments?.length),
      busRoute: item.bus_enrollments?.[0]?.route?.name || '', photoUrl, photoPath: item.photo_path,
      ...position,
    }
  }))

  const payments = (paymentRows || []).map((row) => ({
    id: row.id, pupilId: row.pupil_id, amount: Number(row.amount),
    category: row.payment_allocations?.[0]?.invoice?.category?.name || 'Unallocated',
    method: row.payment_method, date: row.paid_at.slice(0, 10), reference: row.reference || '',
  }))
  return { pupils, payments, term }
}

export async function createPupil(form, adminRole = 'main_admin') {
  const client = requireClient()
  let photoPath = null
  if (form.photoFile) {
    const extension = form.photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    photoPath = `${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await client.storage.from('pupil-photos').upload(photoPath, form.photoFile, { contentType: form.photoFile.type, upsert: false })
    if (uploadError) throw uploadError
  }

  if (adminRole === 'payment_admin') {
    const { data, error } = await client.rpc('register_pupil_with_bus_area', {
      p_admission_number: form.admissionNo,
      p_first_name: form.firstName,
      p_last_name: form.lastName,
      p_admission_type: form.admissionType,
      p_class_name: form.className,
      p_date_of_birth: form.dateOfBirth,
      p_gender: form.gender,
      p_guardian_name: form.guardianName,
      p_guardian_phone: form.guardianPhone,
      p_state_of_origin: form.stateOfOrigin || null,
      p_house_address: form.address,
      p_height_cm: form.height || null,
      p_weight_kg: form.weight || null,
      p_blood_group: form.bloodGroup || null,
      p_complexion: form.complexion || null,
      p_photo_path: photoPath,
      p_fee_section: form.feeSection,
      p_far_away_location: form.feeSection === 'Far Away' ? form.farAwayLocation.trim() : null,
      p_uses_bus: form.usesBus,
      p_bus_route: form.busRoute || null,
    })
    if (error) throw error
    return data
  }

  const term = await getActiveTerm()
  const { data: classRow, error: classError } = await client.from('classes').select('id').eq('name', form.className).single()
  if (classError) throw classError
  const { data: schedules, error: scheduleError } = await client
    .from('fee_schedules')
    .select('amount_due, fee_section, far_away_location, category:fee_categories(id, name)')
    .eq('term_id', term.id)
    .eq('class_id', classRow.id)
  if (scheduleError) throw scheduleError
  const tuitionSchedule = schedules?.find((item) =>
    item.category?.name === 'Tuition'
    && item.fee_section === 'Inside Estate'
    && !item.far_away_location
  )
  const busSchedule = schedules?.find((item) =>
    item.category?.name === 'School Bus'
    && item.fee_section === form.feeSection
    && (
      form.feeSection !== 'Far Away'
      || item.far_away_location.toLowerCase() === form.farAwayLocation.trim().toLowerCase()
    )
  )
  if (!tuitionSchedule) throw new Error(`${form.className} does not have a tuition amount configured for ${term.name}. Open Settings → Fee schedule first.`)
  if (form.usesBus && !busSchedule) throw new Error(`${form.className} does not have a school-bus amount configured for ${term.name}. Open Settings → Fee schedule first.`)

  const { data: pupil, error: pupilError } = await client.from('pupils').insert({
    admission_number: form.admissionNo,
    first_name: form.firstName,
    last_name: form.lastName,
    admission_type: form.admissionType,
    class_id: classRow.id,
    date_of_birth: form.dateOfBirth,
    gender: form.gender,
    guardian_name: form.guardianName,
    guardian_phone: form.guardianPhone,
    state_of_origin: form.stateOfOrigin || null,
    house_address: form.address,
    height_cm: form.height || null,
    weight_kg: form.weight || null,
    blood_group: form.bloodGroup || null,
    complexion: form.complexion || null,
    fee_section: form.feeSection,
    far_away_location: form.feeSection === 'Far Away' ? form.farAwayLocation.trim() : null,
    photo_path: photoPath,
  }).select('id').single()
  if (pupilError) {
    if (photoPath) await client.storage.from('pupil-photos').remove([photoPath])
    throw pupilError
  }

  const selectedSchedules = form.usesBus ? [tuitionSchedule, busSchedule] : [tuitionSchedule]
  const invoices = selectedSchedules.map((schedule) => ({
    pupil_id: pupil.id,
    term_id: term.id,
    category_id: schedule.category.id,
    amount_due: Number(schedule.amount_due),
  }))
  if (invoices.length) {
    const { error } = await client.from('fee_invoices').insert(invoices)
    if (error) throw error
  }

  if (form.usesBus) {
    let routeId = null
    if (form.busRoute?.trim()) {
      const { data: route, error } = await client.from('bus_routes').upsert({ name: form.busRoute.trim() }, { onConflict: 'name' }).select('id').single()
      if (error) throw error
      routeId = route.id
    }
    const { error } = await client.from('bus_enrollments').insert({ pupil_id: pupil.id, term_id: term.id, route_id: routeId, pickup_address: form.address })
    if (error) throw error
  }
  return pupil.id
}

export async function updatePupil(form, adminRole = 'main_admin') {
  const client = requireClient()
  const term = await getActiveTerm()
  const { data: classRow, error: classError } = await client
    .from('classes')
    .select('id')
    .eq('name', form.className)
    .single()
  if (classError) throw classError

  let photoPath = form.photoPath || null
  if (form.photoFile) {
    const extension = form.photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    photoPath = `${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage
      .from('pupil-photos')
      .upload(photoPath, form.photoFile, { contentType: form.photoFile.type, upsert: false })
    if (error) throw error
  }

  let tuitionSchedule = null
  let busSchedule = null
  if (adminRole === 'main_admin') {
    const { data: schedules, error: scheduleError } = await client
      .from('fee_schedules')
      .select('amount_due, fee_section, far_away_location, category:fee_categories(id, name)')
      .eq('term_id', term.id)
      .eq('class_id', classRow.id)
    if (scheduleError) throw scheduleError

    tuitionSchedule = schedules?.find((item) =>
      item.category?.name === 'Tuition'
      && item.fee_section === 'Inside Estate'
      && !item.far_away_location
    )
    if (!tuitionSchedule) {
      throw new Error(`${form.className} does not have a school-fee amount configured for ${term.name}.`)
    }

    busSchedule = form.usesBus && schedules?.find((item) =>
      item.category?.name === 'School Bus'
      && item.fee_section === form.feeSection
      && (
        form.feeSection !== 'Far Away'
        || (item.far_away_location || '').toLowerCase() === form.farAwayLocation.trim().toLowerCase()
      )
    )
    if (form.usesBus && !busSchedule) {
      throw new Error(`The ${form.feeSection} bus fee has not been configured for ${term.name}.`)
    }
  }

  const { error: pupilError } = await client
    .from('pupils')
    .update({
      admission_number: form.admissionNo,
      first_name: form.firstName,
      last_name: form.lastName,
      admission_type: form.admissionType,
      class_id: classRow.id,
      date_of_birth: form.dateOfBirth,
      gender: form.gender,
      guardian_name: form.guardianName,
      guardian_phone: form.guardianPhone,
      state_of_origin: form.stateOfOrigin || null,
      house_address: form.address,
      height_cm: form.height || null,
      weight_kg: form.weight || null,
      blood_group: form.bloodGroup || null,
      complexion: form.complexion || null,
      fee_section: form.usesBus ? form.feeSection : 'Inside Estate',
      far_away_location: form.usesBus && form.feeSection === 'Far Away' ? form.farAwayLocation.trim() : null,
      photo_path: photoPath,
    })
    .eq('id', form.id)
  if (pupilError) throw pupilError

  if (adminRole === 'main_admin') {
    const invoices = [{
      pupil_id: form.id,
      term_id: term.id,
      category_id: tuitionSchedule.category.id,
      amount_due: Number(tuitionSchedule.amount_due),
    }]
    if (form.usesBus) {
      invoices.push({
        pupil_id: form.id,
        term_id: term.id,
        category_id: busSchedule.category.id,
        amount_due: Number(busSchedule.amount_due),
      })
    }
    const { error: invoiceError } = await client
      .from('fee_invoices')
      .upsert(invoices, { onConflict: 'pupil_id,term_id,category_id' })
    if (invoiceError) throw invoiceError
  } else {
    const { error } = await client.rpc('sync_pupil_invoices_after_edit', {
      p_pupil_id: form.id,
      p_term_id: term.id,
      p_class_id: classRow.id,
      p_fee_section: form.usesBus ? form.feeSection : 'Inside Estate',
      p_far_away_location: form.usesBus && form.feeSection === 'Far Away' ? form.farAwayLocation.trim() : '',
      p_uses_bus: form.usesBus,
    })
    if (error) throw error
  }

  if (form.usesBus) {
    let routeId = null
    if (form.busRoute?.trim()) {
      const { data: route, error } = await client
        .from('bus_routes')
        .upsert({ name: form.busRoute.trim() }, { onConflict: 'name' })
        .select('id')
        .single()
      if (error) throw error
      routeId = route.id
    }
    const { error } = await client.from('bus_enrollments').upsert({
      pupil_id: form.id,
      term_id: term.id,
      route_id: routeId,
      pickup_address: form.address,
      active: true,
    }, { onConflict: 'pupil_id,term_id' })
    if (error) throw error
  } else {
    const { error } = await client
      .from('bus_enrollments')
      .delete()
      .eq('pupil_id', form.id)
      .eq('term_id', term.id)
    if (error) throw error
  }

  return form.id
}

export async function createPayment(form) {
  const client = requireClient()
  const term = await getActiveTerm()
  const { data, error } = await client.rpc('record_payment', {
    p_pupil_id: form.pupilId,
    p_term_id: term.id,
    p_category_name: form.category,
    p_amount: form.amount,
    p_payment_method: form.method,
    p_reference: form.reference || null,
  })
  if (error) throw error
  return data
}

export async function reversePayment(paymentId, reason) {
  const client = requireClient()
  const { error } = await client.rpc('reverse_payment', { p_payment_id: paymentId, p_reason: reason })
  if (error) throw error
}

export async function loadFeeSettings() {
  const client = requireClient()
  const [
    { data: terms, error: termError },
    { data: classes, error: classError },
    { data: schedules, error: scheduleError },
    { data: pupils, error: pupilError },
    { data: discounts, error: discountError },
  ] = await Promise.all([
    client.from('terms').select('id, name, active, session:academic_sessions(name)').order('starts_on'),
    client.from('classes').select('id, name, display_order').order('display_order'),
    client.from('fee_schedule_overview').select('*'),
    client.from('pupils').select('id, first_name, last_name, admission_number, class:classes(name), bus_enrollments(term_id, active)').eq('active', true).order('last_name'),
    client.from('pupil_discount_overview').select('*'),
  ])
  if (termError) throw termError
  if (classError) throw classError
  if (scheduleError) throw scheduleError
  if (pupilError) throw pupilError
  if (discountError && !discountError.message?.includes('pupil_discount_overview')) throw discountError
  return { terms: terms || [], classes: classes || [], schedules: schedules || [], pupils: pupils || [], discounts: discounts || [] }
}

export async function saveFeeSchedule({ termId, classId, feeSection, farAwayLocation, tuitionAmount, busAmount }) {
  const client = requireClient()
  const updates = [
    client.rpc('save_location_fee_schedule', {
      p_term_id: termId,
      p_class_id: classId,
      p_category_name: 'Tuition',
      p_fee_section: feeSection,
      p_far_away_location: feeSection === 'Far Away' ? farAwayLocation : '',
      p_amount: parseCurrencyInput(tuitionAmount),
    }),
    client.rpc('save_location_fee_schedule', {
      p_term_id: termId,
      p_class_id: classId,
      p_category_name: 'School Bus',
      p_fee_section: feeSection,
      p_far_away_location: feeSection === 'Far Away' ? farAwayLocation : '',
      p_amount: parseCurrencyInput(busAmount),
    }),
  ]
  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed) throw failed.error
}

export async function saveSingleFeeAmount({ termId, classId, categoryName, feeSection, farAwayLocation, amount }) {
  const client = requireClient()
  const { error } = await client.rpc('save_location_fee_schedule', {
    p_term_id: termId,
    p_class_id: classId,
    p_category_name: categoryName,
    p_fee_section: feeSection,
    p_far_away_location: feeSection === 'Far Away' ? farAwayLocation : '',
    p_amount: parseCurrencyInput(amount),
  })
  if (error) throw error
}

export async function saveSchoolFeeAmount({ termId, classId, amount }) {
  const client = requireClient()
  const { error } = await client.rpc('save_school_fee_schedule', {
    p_term_id: termId,
    p_class_id: classId,
    p_amount: parseCurrencyInput(amount),
  })
  if (error) throw error
}

export async function saveBusAreaFeeAmount({ termId, feeSection, farAwayLocation, amount }) {
  const client = requireClient()
  const { error } = await client.rpc('save_bus_area_fee_schedule', {
    p_term_id: termId,
    p_fee_section: feeSection,
    p_far_away_location: feeSection === 'Far Away' ? farAwayLocation : '',
    p_amount: parseCurrencyInput(amount),
  })
  if (!error) return

  const functionIsMissing = error.code === 'PGRST202'
    || error.message?.includes('save_bus_area_fee_schedule')
  if (!functionIsMissing) throw error

  const { data: classes, error: classError } = await client
    .from('classes')
    .select('id')
  if (classError) throw classError

  const results = await Promise.all((classes || []).map((schoolClass) =>
    client.rpc('save_location_fee_schedule', {
      p_term_id: termId,
      p_class_id: schoolClass.id,
      p_category_name: 'School Bus',
      p_fee_section: feeSection,
      p_far_away_location: feeSection === 'Far Away' ? farAwayLocation : '',
      p_amount: parseCurrencyInput(amount),
    })
  ))
  const failed = results.find((result) => result.error)
  if (failed) throw failed.error
}

export async function savePupilDiscount({ pupilId, termId, categoryName, amount }) {
  const client = requireClient()
  const { error } = await client.rpc('save_pupil_discount', {
    p_pupil_id: pupilId,
    p_term_id: termId,
    p_category_name: categoryName,
    p_custom_amount: parseCurrencyInput(amount),
  })
  if (error) throw error
}

export async function removePupilDiscount({ pupilId, termId, categoryName }) {
  const client = requireClient()
  const { error } = await client.rpc('remove_pupil_discount', {
    p_pupil_id: pupilId,
    p_term_id: termId,
    p_category_name: categoryName,
  })
  if (error) throw error
}

export async function loadAcademicSettings() {
  const client = requireClient()
  const { data, error } = await client
    .from('academic_sessions')
    .select('id, name, starts_on, ends_on, active, terms(id, name, starts_on, ends_on, active)')
    .order('starts_on', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveAcademicTerm({
  sessionName,
  sessionStartsOn,
  sessionEndsOn,
  termName,
  termStartsOn,
  termEndsOn,
  makeCurrent,
}) {
  const client = requireClient()
  const { data: session, error: sessionError } = await client
    .from('academic_sessions')
    .upsert({
      name: sessionName.trim(),
      starts_on: sessionStartsOn,
      ends_on: sessionEndsOn,
    }, { onConflict: 'name' })
    .select('id')
    .single()
  if (sessionError) throw sessionError

  const { data: term, error: termError } = await client
    .from('terms')
    .upsert({
      session_id: session.id,
      name: termName,
      starts_on: termStartsOn,
      ends_on: termEndsOn,
    }, { onConflict: 'session_id,name' })
    .select('id')
    .single()
  if (termError) throw termError

  if (makeCurrent) await selectCurrentTerm(term.id, session.id)
  return term.id
}

export async function selectCurrentTerm(termId, sessionId) {
  const client = requireClient()
  const operations = [
    client.from('terms').update({ active: false }).neq('id', termId),
    client.from('academic_sessions').update({ active: false }).neq('id', sessionId),
  ]
  const results = await Promise.all(operations)
  const failed = results.find((result) => result.error)
  if (failed) throw failed.error
  const { error: sessionError } = await client.from('academic_sessions').update({ active: true }).eq('id', sessionId)
  if (sessionError) throw sessionError
  const { error: termError } = await client.from('terms').update({ active: true }).eq('id', termId)
  if (termError) throw termError
}
