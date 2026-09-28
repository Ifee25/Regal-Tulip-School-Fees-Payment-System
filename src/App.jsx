import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell, Bus, ChevronDown, ChevronRight, ClipboardList,
  Download, GraduationCap, LayoutDashboard, Menu, Plus, ReceiptText,
  Search, Settings, UserPlus, Users, X, LogOut, AlertCircle, Printer, Pencil,
} from 'lucide-react'
import Login from './components/Login'
import AccountSetup from './components/AccountSetup'
import AcademicSettings from './components/AcademicSettings'
import FeeSettings from './components/FeeSettings'
import Logo from './components/Logo'
import Modal from './components/Modal'
import PaymentForm from './components/PaymentForm'
import PupilForm from './components/PupilForm'
import StatusBadge from './components/StatusBadge'
import { getPaymentStatus } from './utils/payments'
import { demoPayments, demoPupils } from './data/demoData'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { createPayment, createPupil, loadSchoolData, updatePupil } from './lib/schoolApi'

const currency = (value) => `₦${Number(value || 0).toLocaleString()}`
const readableError = (error, fallback) => {
  if (typeof error?.message === 'string' && error.message && error.message !== '{}') return error.message
  if (typeof error?.error_description === 'string' && error.error_description) return error.error_description
  return fallback
}
const initials = (pupil) => `${pupil.firstName?.[0] || ''}${pupil.lastName?.[0] || ''}`
const displayUsername = (username = '') => username
  .trim()
  .replace(/(^|[\s._-])([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`)
const age = (dob) => {
  if (!dob) return '—'
  const born = new Date(dob)
  const now = new Date()
  let years = now.getFullYear() - born.getFullYear()
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) years--
  return years
}

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'pupils', label: 'Pupils', icon: Users },
  { id: 'fees', label: 'School fees', icon: NairaIcon },
  { id: 'bus', label: 'School bus', icon: Bus },
  { id: 'reports', label: 'Reports', icon: ClipboardList },
]

function NairaIcon({ size = 24 }) {
  return <svg className="naira-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 17V7l7 10V7M7 10h10M7 14h10" />
  </svg>
}

const pageIds = new Set([...navItems.map((item) => item.id), 'settings'])
const getSavedPage = () => {
  const hashPage = window.location.hash.replace(/^#\/?/, '')
  const savedPage = window.localStorage.getItem('regal-tulip-active-page')
  if (pageIds.has(hashPage)) return hashPage
  if (pageIds.has(savedPage)) return savedPage
  return 'dashboard'
}

function Avatar({ pupil, large = false }) {
  return pupil.photoUrl
    ? <img className={`avatar ${large ? 'avatar-large' : ''}`} src={pupil.photoUrl} alt={`${pupil.firstName} ${pupil.lastName}`} />
    : <span className={`avatar avatar-fallback ${large ? 'avatar-large' : ''}`}>{initials(pupil)}</span>
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><Icon /><h3>{title}</h3><p>{text}</p></div>
}

function App() {
  const [activePage, setActivePage] = useState(getSavedPage)
  const [pupils, setPupils] = useState(isSupabaseConfigured ? [] : demoPupils)
  const [payments, setPayments] = useState(isSupabaseConfigured ? [] : demoPayments)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('All classes')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [modal, setModal] = useState(null)
  const [selectedPupil, setSelectedPupil] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [session, setSession] = useState(null)
  const [adminRole, setAdminRole] = useState(isSupabaseConfigured ? null : 'main_admin')
  const [adminUsername, setAdminUsername] = useState(isSupabaseConfigured ? '' : 'Admin Office')
  const [accountSetupComplete, setAccountSetupComplete] = useState(isSupabaseConfigured ? null : true)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [dataLoading, setDataLoading] = useState(false)
  const [currentTermLabel, setCurrentTermLabel] = useState('No current term selected')

  const notify = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  const refreshSchoolData = useCallback(async () => {
    if (!adminRole) return
    setDataLoading(true)
    try {
      const data = await loadSchoolData(adminRole)
      setPupils(data.pupils)
      setPayments(data.payments)
      setCurrentTermLabel(`${data.term.session?.name || 'Academic session'} · ${data.term.name}`)
    } catch (error) {
      notify(error.message || 'Unable to load school data.')
    } finally {
      setDataLoading(false)
    }
  }, [adminRole, notify])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setAuthLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !session) return
    const email = session.user.email?.toLowerCase()
    if (email === 'regaltulipschool@gmail.com') {
      setAdminRole('main_admin')
    } else if (email === 'ogechukwuifunanya@gmail.com') {
      setAdminRole('payment_admin')
    } else {
      supabase.auth.signOut()
      setAuthError('This email address is not approved to use the school administration system.')
      return
    }
    setAdminUsername(session.user.user_metadata?.username || email.split('@')[0])
    setAccountSetupComplete(true)
  }, [session])

  useEffect(() => {
    if (isSupabaseConfigured && session && adminRole && accountSetupComplete) refreshSchoolData()
  }, [session, adminRole, accountSetupComplete, refreshSchoolData])

  useEffect(() => {
    if (adminRole === 'payment_admin' && !['dashboard', 'pupils'].includes(activePage)) {
      setActivePage('dashboard')
    }
  }, [adminRole, activePage])

  useEffect(() => {
    window.localStorage.setItem('regal-tulip-active-page', activePage)
    const nextHash = `#${activePage}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
    }
  }, [activePage])

  async function signIn(username, password) {
    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')
    const { data: email, error: lookupError } = await supabase.rpc('lookup_approved_admin_email', { p_username: username })
    if (lookupError || !email) {
      setAuthError('Invalid username or password.')
      setAuthLoading(false)
      return
    }
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError('Invalid username or password.')
      setAuthLoading(false)
      return
    }
    const signedInEmail = authData.user?.email?.toLowerCase()
    setSession(authData.session)
    setAdminRole(signedInEmail === 'regaltulipschool@gmail.com' ? 'main_admin' : 'payment_admin')
    setAdminUsername(authData.user?.user_metadata?.username || username.toLowerCase())
    setAccountSetupComplete(true)
    setAuthLoading(false)
  }

  async function signUp({ email, username, password }) {
    const approvedEmails = ['regaltulipschool@gmail.com', 'ogechukwuifunanya@gmail.com']
    const normalisedEmail = email.toLowerCase()
    if (!approvedEmails.includes(normalisedEmail)) {
      setAuthError('This email address is not approved for administrator signup.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')
    const existingUsername = normalisedEmail === 'regaltulipschool@gmail.com'
      ? 'regaltulipadmin'
      : 'ogechukwuifunanya'
    const { data: existingAccount } = await supabase.rpc('lookup_approved_admin_email', {
      p_username: existingUsername,
    })
    if (existingAccount) {
      setAuthError('An account already exists for this approved email. Remove the old user from Supabase Authentication first, then submit this form again to choose your own username and password.')
      setAuthLoading(false)
      return
    }
    const { data, error } = await supabase.auth.signUp({
      email: normalisedEmail,
      password,
      options: {
        data: { username: username.toLowerCase() },
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) {
      setAuthError(readableError(error, 'Account creation failed. Confirm that the old Supabase user was removed and that migration 009 was run, then try again.'))
      setAuthLoading(false)
      return
    }
    if (!data.session) {
      setAuthMessage('Account created. Open the approved email inbox and confirm the email address, then sign in with your chosen username.')
    } else {
      const signedUpEmail = data.user?.email?.toLowerCase()
      setSession(data.session)
      setAdminRole(signedUpEmail === 'regaltulipschool@gmail.com' ? 'main_admin' : 'payment_admin')
      setAdminUsername(data.user?.user_metadata?.username || username.toLowerCase())
      setAccountSetupComplete(true)
    }
    setAuthLoading(false)
  }

  async function completeAccountSetup({ username, password }) {
    setAuthLoading(true)
    setAuthError('')
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      setAuthError(readableError(passwordError, 'The password could not be saved. Please try again.'))
      setAuthLoading(false)
      return
    }
    const { error: profileError } = await supabase.rpc('complete_admin_account_setup', { p_username: username })
    if (profileError) {
      setAuthError(readableError(profileError, 'The username could not be saved. Please try another username.'))
      setAuthLoading(false)
      return
    }
    setAdminUsername(username.toLowerCase())
    setAccountSetupComplete(true)
    setAuthLoading(false)
    notify('Your administrator account is ready.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setPupils([])
    setPayments([])
    setAdminRole(null)
    setAdminUsername('')
    setAccountSetupComplete(null)
  }

  const filteredPupils = useMemo(() => pupils.filter((pupil) => {
    const haystack = `${pupil.firstName} ${pupil.lastName} ${pupil.admissionNo} ${pupil.guardianPhone}`.toLowerCase()
    const matchesSearch = haystack.includes(search.toLowerCase())
    const matchesClass = classFilter === 'All classes' || pupil.className === classFilter
    const matchesStatus = statusFilter === 'All statuses' || getPaymentStatus(pupil.feePaid, pupil.feeExpected) === statusFilter
    return matchesSearch && matchesClass && matchesStatus
  }), [pupils, search, classFilter, statusFilter])

  const stats = useMemo(() => {
    const collected = pupils.reduce((sum, pupil) => sum + Number(pupil.feePaid || 0) + Number(pupil.busPaid || 0), 0)
    const expected = pupils.reduce((sum, pupil) => sum + Number(pupil.feeExpected || 0) + Number(pupil.busExpected || 0), 0)
    const feeStatuses = pupils.map((pupil) => getPaymentStatus(pupil.feePaid, pupil.feeExpected))
    return {
      total: pupils.length,
      newPupils: pupils.filter((pupil) => pupil.admissionType === 'New').length,
      paid: feeStatuses.filter((status) => status === 'Paid').length,
      partPayment: feeStatuses.filter((status) => status === 'Part Payment').length,
      notPaid: feeStatuses.filter((status) => status === 'Not Paid').length,
      collected, outstanding: expected - collected,
    }
  }, [pupils])

  async function addPupil(pupil) {
    try {
      if (isSupabaseConfigured) {
        await createPupil(pupil, adminRole)
        await refreshSchoolData()
      } else {
        setPupils((current) => [pupil, ...current])
      }
      notify(`${pupil.firstName} ${pupil.lastName} was registered successfully`)
      return true
    } catch (error) {
      notify(error.message || 'Pupil registration failed.')
      return false
    }
  }

  async function addPayment(payment) {
    try {
      if (isSupabaseConfigured) {
        await createPayment(payment)
        await refreshSchoolData()
      } else {
        setPayments((current) => [payment, ...current])
        setPupils((current) => current.map((pupil) => {
          if (pupil.id !== payment.pupilId) return pupil
          return payment.category === 'School Bus'
            ? { ...pupil, busPaid: Number(pupil.busPaid || 0) + payment.amount }
            : { ...pupil, feePaid: Number(pupil.feePaid || 0) + payment.amount }
        }))
      }
      setModal(null)
      notify(`Payment of ${currency(payment.amount)} recorded`)
    } catch (error) {
      notify(error.message || 'Payment could not be recorded.')
    }
  }

  async function editPupil(pupil) {
    try {
      await updatePupil(pupil, adminRole)
      await refreshSchoolData()
      notify(`${pupil.firstName} ${pupil.lastName}'s information was updated successfully`)
      return true
    } catch (error) {
      notify(error.message || 'The pupil information could not be updated.')
      return false
    }
  }

  function navigate(page) {
    setActivePage(page)
    setMenuOpen(false)
  }

  function exportReport() {
    const header = ['Admission No', 'Pupil', 'Class', 'Expected', 'Paid', 'Outstanding', 'Status']
    const rows = pupils.map((p) => [p.admissionNo, `${p.firstName} ${p.lastName}`, p.className, currency(p.feeExpected), currency(p.feePaid), currency(Math.max(0, p.feeExpected - p.feePaid)), getPaymentStatus(p.feePaid, p.feeExpected)])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = `regal-tulip-fees-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    notify('Report downloaded')
  }

  if (isSupabaseConfigured && (authLoading || (session && (!adminRole || accountSetupComplete === null)))) {
    return <div className="app-loading"><Logo /><span className="loading-spinner" /><p>Securing your workspace…</p></div>
  }

  if (isSupabaseConfigured && !session) {
    return <Login onSubmit={signIn} onSignUp={signUp} error={authError} message={authMessage} loading={authLoading} />
  }

  if (isSupabaseConfigured && session && !accountSetupComplete) {
    return <AccountSetup email={session.user.email} onComplete={completeAccountSetup} loading={authLoading} error={authError} />
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setMenuOpen(false)}><X /></button></div>
        <div className="term-card"><span>Current term</span><button onClick={() => adminRole === 'main_admin' && navigate('settings')}>{currentTermLabel} <ChevronDown size={15} /></button></div>
        <nav>
          <span className="nav-label">Workspace</span>
          {(adminRole === 'main_admin' ? navItems : navItems.filter((item) => ['dashboard', 'pupils'].includes(item.id))).map(({ id, label, icon: Icon }) => (
            <button key={id} className={activePage === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}{activePage === id && <i />}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {adminRole === 'main_admin' && <button className={activePage === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={19} /> Fee settings</button>}
          {isSupabaseConfigured && <button onClick={signOut}><LogOut size={19} /> Sign out</button>}
          <div className="admin-card"><span className="admin-avatar"><img src="/regal-tulip-logo.png" alt="Regal Tulip School logo" /></span><div><strong>{displayUsername(adminUsername) || 'Admin Office'}</strong><small>{adminRole === 'main_admin' ? 'Main administrator' : 'Payment administrator'}</small></div><ChevronRight size={16} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button>
          <form className="global-search" onSubmit={(event) => { event.preventDefault(); navigate('pupils') }}>
            <div className="global-search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pupil, admission number or guardian phone..." /></div>
            <button className="global-search-button" type="submit"><Search size={16} /><span>Search</span></button>
          </form>
          <div className="topbar-actions"><span className={`connection-pill ${isSupabaseConfigured ? 'connected' : ''}`}><i />{isSupabaseConfigured ? 'Supabase connected' : 'Demo mode'}</span><button className="notification-button"><Bell size={20} /><i /></button></div>
        </header>

        <div className={`page ${dataLoading ? 'page-loading' : ''}`}>
          {activePage === 'dashboard' && (adminRole === 'main_admin'
            ? <Dashboard adminUsername={adminUsername} stats={stats} pupils={pupils} payments={payments} setSelectedPupil={setSelectedPupil} openRegistration={() => setModal('pupil')} openPayment={() => setModal('payment')} navigate={navigate} />
            : <PaymentAdminDashboard pupils={pupils} openPayment={(pupil) => { setSelectedPupil(pupil || null); setModal('payment') }} />)}
          {activePage === 'pupils' && (adminRole === 'main_admin'
            ? <PupilsPage pupils={filteredPupils} search={search} setSearch={setSearch} classFilter={classFilter} setClassFilter={setClassFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} setSelectedPupil={setSelectedPupil} openRegistration={() => setModal('pupil')} />
            : <PaymentEntryPage pupils={filteredPupils} search={search} setSearch={setSearch} openRegistration={() => setModal('pupil')} onView={setSelectedPupil} openPayment={(pupil) => { setSelectedPupil(pupil); setModal('payment') }} />)}
          {adminRole === 'main_admin' && activePage === 'fees' && <FeesPage pupils={filteredPupils} search={search} setSearch={setSearch} setSelectedPupil={setSelectedPupil} openPayment={(pupil) => { setSelectedPupil(pupil || null); setModal('payment') }} onPrint={() => window.print()} />}
          {adminRole === 'main_admin' && activePage === 'bus' && <BusPage pupils={pupils.filter((pupil) => pupil.usesBus)} openPayment={(pupil) => { setSelectedPupil(pupil); setModal('payment') }} />}
          {adminRole === 'main_admin' && activePage === 'reports' && <ReportsPage pupils={pupils} payments={payments} onExport={exportReport} />}
          {adminRole === 'main_admin' && activePage === 'settings' && <SettingsPage refreshSchoolData={refreshSchoolData} notify={notify} />}
        </div>
      </main>

      {menuOpen && <div className="mobile-overlay" onClick={() => setMenuOpen(false)} />}
      {modal === 'pupil' && <Modal title="Register a pupil" subtitle="Create a complete pupil record for this academic session." onClose={() => setModal(null)} wide><PupilForm onSubmit={addPupil} onCancel={() => setModal(null)} /></Modal>}
      {modal === 'edit-pupil' && selectedPupil && <Modal title="Edit pupil information" subtitle="Update personal details and school-bus enrollment." onClose={() => { setModal(null); setSelectedPupil(null) }} wide><PupilForm initialPupil={selectedPupil} onSubmit={editPupil} onCancel={() => { setModal(null); setSelectedPupil(null) }} /></Modal>}
      {modal === 'payment' && <Modal title="Record a payment" subtitle="Enter the amount received by the school and the payment method." onClose={() => setModal(null)}><PaymentForm pupils={pupils} preselectedPupil={selectedPupil} fullFinancialAccess={adminRole === 'main_admin'} onSubmit={addPayment} onCancel={() => setModal(null)} /></Modal>}
      {selectedPupil && !modal && <><button className="drawer-edit-launch button button-secondary" onClick={() => setModal('edit-pupil')}><Pencil size={17} /> Edit pupil</button><PupilDrawer pupil={selectedPupil} payments={payments.filter((item) => item.pupilId === selectedPupil.id)} fullFinancialAccess={adminRole === 'main_admin'} onClose={() => setSelectedPupil(null)} onPayment={() => setModal('payment')} /></>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      {adminRole === 'main_admin' && <PaymentPrintReport pupils={pupils} />}
    </div>
  )
}

function PageHeading({ eyebrow, title, text, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>
}

function Dashboard({ adminUsername, stats, pupils, payments, setSelectedPupil, openRegistration, openPayment, navigate }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(clock)
  }, [])

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Intl.DateTimeFormat('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const recent = payments.slice(0, 4)
  const totalStatuses = stats.paid + stats.partPayment + stats.notPaid
  const paidDegrees = (stats.paid / (totalStatuses || 1)) * 360
  const partDegrees = paidDegrees + (stats.partPayment / (totalStatuses || 1)) * 360
  const busStatuses = pupils
    .filter((pupil) => pupil.usesBus)
    .map((pupil) => getPaymentStatus(pupil.busPaid, pupil.busExpected))
  const busPaid = busStatuses.filter((status) => status === 'Paid').length
  const busPartPayment = busStatuses.filter((status) => status === 'Part Payment').length
  const busNotPaid = busStatuses.filter((status) => status === 'Not Paid').length
  const busTotal = busPaid + busPartPayment + busNotPaid
  const busPaidDegrees = (busPaid / (busTotal || 1)) * 360
  const busPartDegrees = busPaidDegrees + (busPartPayment / (busTotal || 1)) * 360
  return <>
    <PageHeading eyebrow={today} title={`${greeting}, ${displayUsername(adminUsername) || 'Administrator'}.`} text="Here’s what’s happening at Regal Tulip School today." action={<div className="heading-actions"><button className="button button-secondary" onClick={openPayment}><ReceiptText size={18} /> Record payment</button><button className="button button-primary" onClick={openRegistration}><UserPlus size={18} /> Register pupil</button></div>} />
    <section className="stat-grid">
      <StatCard title="Total pupils" value={stats.total} note={`${stats.newPupils} new admissions`} icon={Users} tone="forest" />
      <StatCard title="Fees collected" value={currency(stats.collected)} icon={NairaIcon} tone="gold" breakdown={[
        { label: 'Paid Completely', value: stats.paid, tone: 'paid' },
        { label: 'Part Payment', value: stats.partPayment, tone: 'partial' },
        { label: 'Not Paid', value: stats.notPaid, tone: 'unpaid' },
      ]} />
      <StatCard title="Outstanding" value={currency(stats.outstanding)} note="Across fees and transport" icon={ReceiptText} tone="coral" />
      <StatCard title="Using school bus" value={pupils.filter((p) => p.usesBus).length} note={`${pupils.filter((p) => p.usesBus && getPaymentStatus(p.busPaid, p.busExpected) !== 'Paid').length} require attention`} icon={Bus} tone="blue" />
    </section>
    <section className="dashboard-grid">
      <div className="panel recent-payment-panel">
        <div className="panel-header"><div><h2>Recent payments</h2><p>Latest transactions recorded</p></div><button className="text-button" onClick={() => navigate('fees')}>View all <ChevronRight size={15} /></button></div>
        <div className="transaction-list">{recent.map((payment) => {
          const pupil = pupils.find((p) => p.id === payment.pupilId)
          return <button className="transaction" key={payment.id} onClick={() => pupil && setSelectedPupil(pupil)}><Avatar pupil={pupil} /><div><strong>{pupil?.firstName} {pupil?.lastName}</strong><span>{payment.category} · {payment.method}</span></div><div className="transaction-value"><strong>{currency(payment.amount)}</strong><span>{payment.date === '2026-08-02' ? 'Today' : payment.date}</span></div></button>
        })}</div>
      </div>
      <div className="panel collection-panel">
        <div className="panel-header"><div><h2>Fee collection</h2><p>Current term progress</p></div><span className="mini-chip">First Term</span></div>
        <div className="donut-wrap"><div className={`donut status-donut ${totalStatuses ? '' : 'empty-donut'}`} style={{ '--paid-end': `${paidDegrees}deg`, '--part-end': `${partDegrees}deg` }}><div><strong>{stats.paid}</strong><span>Paid Completely</span></div></div></div>
        <div className="collection-legend status-legend">
          <div><i className="green-dot" /><span>Paid Completely</span><strong>{stats.paid} pupils</strong></div>
          <div><i className="blue-dot" /><span>Part Payment</span><strong>{stats.partPayment} pupils</strong></div>
          <div><i className="red-dot" /><span>Not Paid</span><strong>{stats.notPaid} pupils</strong></div>
        </div>
      </div>
      <div className="panel collection-panel bus-collection-panel">
        <div className="panel-header"><div><h2>School bus collection</h2><p>Current term transport status</p></div><span className="mini-chip">{busTotal} pupils</span></div>
        <div className="donut-wrap"><div className={`donut status-donut ${busTotal ? '' : 'empty-donut'}`} style={{ '--paid-end': `${busPaidDegrees}deg`, '--part-end': `${busPartDegrees}deg` }}><div><strong>{busPaid}</strong><span>Paid Completely</span></div></div></div>
        <div className="collection-legend status-legend">
          <div><i className="green-dot" /><span>Paid Completely</span><strong>{busPaid} pupils</strong></div>
          <div><i className="blue-dot" /><span>Part Payment</span><strong>{busPartPayment} pupils</strong></div>
          <div><i className="red-dot" /><span>Not Paid</span><strong>{busNotPaid} pupils</strong></div>
        </div>
      </div>
    </section>
    <section className="panel">
      <div className="panel-header"><div><h2>Pupils requiring attention</h2><p>Incomplete school-fee or school-bus payments</p></div><button className="text-button" onClick={() => navigate('pupils')}>View pupils <ChevronRight size={15} /></button></div>
      <AttentionPupilTable pupils={pupils.filter((pupil) =>
        getPaymentStatus(pupil.feePaid, pupil.feeExpected) !== 'Paid'
        || (pupil.usesBus && getPaymentStatus(pupil.busPaid, pupil.busExpected) !== 'Paid')
      ).slice(0, 5)} onSelect={setSelectedPupil} />
    </section>
  </>
}

function StatCard({ title, value, note, icon: Icon, tone, breakdown }) {
  return <article className={`stat-card ${breakdown ? 'stat-card-breakdown' : ''}`}><div className={`stat-icon ${tone}`}><Icon size={21} /></div><div className="stat-body"><span>{title}</span><strong>{value}</strong>{note && <small>{note}</small>}{breakdown && <div className="stat-breakdown">{breakdown.map((item) => <span className={item.tone} key={item.label}><b>{item.value}</b>{item.label}</span>)}</div>}</div><span className="stat-spark">↗</span></article>
}

function PupilsPage({ pupils, search, setSearch, classFilter, setClassFilter, statusFilter, setStatusFilter, setSelectedPupil, openRegistration }) {
  return <>
    <PageHeading eyebrow="Pupil records" title="All pupils" text={`${pupils.length} pupil records found in the current session.`} action={<button className="button button-primary" onClick={openRegistration}><Plus size={18} /> Register pupil</button>} />
    <div className="filter-bar"><div className="table-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records..." /></div><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option>All classes</option>{['Nursery 1','Nursery 2','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'].map((x) => <option key={x}>{x}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All statuses</option><option>Paid</option><option>Part Payment</option><option>Not Paid</option></select></div>
    <section className="panel table-panel">{pupils.length ? <PupilTable pupils={pupils} onSelect={setSelectedPupil} /> : <EmptyState icon={Search} title="No pupil found" text="Try changing your search or filters." />}</section>
  </>
}

function PaymentAdminDashboard({ pupils, openPayment }) {
  const partials = pupils.filter((pupil) => pupil.financialVisible)
  const paid = partials.reduce((sum, pupil) => sum + pupil.feePaid + pupil.busPaid, 0)
  const outstanding = partials.reduce((sum, pupil) => sum + Math.max(0, pupil.feeExpected - pupil.feePaid) + Math.max(0, pupil.busExpected - pupil.busPaid), 0)
  return <>
    <PageHeading eyebrow="Payment administration" title="Pupils requiring attention" text="Pupils with a permitted part payment in either school fees or school-bus fees are shown here." action={<button className="button button-primary" onClick={() => openPayment(null)}><Plus size={18} /> Record payment</button>} />
    <section className="stat-grid secondary-stats">
      <StatCard title="Part-payment pupils" value={partials.length} note="School fees or school bus" icon={Users} tone="blue" />
      <StatCard title="Amount paid" value={currency(paid)} note="For visible part payments only" icon={NairaIcon} tone="forest" />
      <StatCard title="Outstanding" value={currency(outstanding)} note="For visible part payments only" icon={ReceiptText} tone="coral" />
    </section>
    <section className="panel table-panel">{partials.length
      ? <PartPaymentTable pupils={partials} onPayment={openPayment} />
      : <EmptyState icon={NairaIcon} title="No part payments" text="There are currently no part-payment figures available to this account." />}</section>
  </>
}

function PaymentEntryPage({ pupils, search, setSearch, openRegistration, onView, openPayment }) {
  return <>
    <PageHeading eyebrow="Pupil administration" title="Pupils" text="Register pupils, view their profiles and record amounts received by the school." action={<button className="button button-primary" onClick={openRegistration}><UserPlus size={18} /> Register pupil</button>} />
    <div className="filter-bar"><div className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, admission number or guardian phone..." /></div></div>
    <section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Pupil</th><th>Admission no.</th><th>Class</th><th>Part-payment figures</th><th></th></tr></thead><tbody>{pupils.map((pupil) => <tr key={pupil.id}><td><div className="pupil-cell"><Avatar pupil={pupil} /><div><strong>{pupil.firstName} {pupil.lastName}</strong><span>{pupil.guardianPhone}</span></div></div></td><td><span className="mono">{pupil.admissionNo}</span></td><td>{pupil.className}</td><td>{pupil.financialVisible ? <div className="partial-inline"><span>Paid: {currency(pupil.feePaid + pupil.busPaid)}</span><strong>Outstanding: {currency(Math.max(0, pupil.feeExpected - pupil.feePaid) + Math.max(0, pupil.busExpected - pupil.busPaid))}</strong></div> : <span className="restricted-value">Financial figures restricted</span>}</td><td><div className="row-actions"><button className="text-button" onClick={() => onView(pupil)}>View profile</button><button className="button button-secondary" onClick={() => openPayment(pupil)}>Record payment</button></div></td></tr>)}</tbody></table></div></section>
  </>
}

function PartPaymentTable({ pupils, onPayment }) {
  return <div className="table-wrap"><table><thead><tr><th>Pupil</th><th>Class</th><th>Section</th><th>Amount paid</th><th>Outstanding</th><th></th></tr></thead><tbody>{pupils.map((pupil) => <tr key={pupil.id}><td><div className="pupil-cell"><Avatar pupil={pupil} /><div><strong>{pupil.firstName} {pupil.lastName}</strong><span>{pupil.admissionNo}</span></div></div></td><td>{pupil.className}</td><td>{pupil.feeSection}</td><td><strong className="balance-partial">{currency(pupil.feePaid + pupil.busPaid)}</strong></td><td><strong className="balance-unpaid">{currency(Math.max(0, pupil.feeExpected - pupil.feePaid) + Math.max(0, pupil.busExpected - pupil.busPaid))}</strong></td><td><button className="button button-secondary" onClick={() => onPayment(pupil)}>Add payment</button></td></tr>)}</tbody></table></div>
}

function AttentionPupilTable({ pupils, onSelect }) {
  if (!pupils.length) return <EmptyState icon={NairaIcon} title="No pupil requires attention" text="All current school-fee and school-bus balances are complete." />

  return <div className="table-wrap"><table className="attention-table">
    <thead><tr><th>Pupil</th><th>Admission no.</th><th>Class</th><th>School fees</th><th>School bus</th><th>Total outstanding</th><th></th></tr></thead>
    <tbody>{pupils.map((pupil) => {
      const feeBalance = Math.max(0, pupil.feeExpected - pupil.feePaid)
      const busBalance = pupil.usesBus ? Math.max(0, pupil.busExpected - pupil.busPaid) : 0
      return <tr key={pupil.id} onClick={() => onSelect(pupil)}>
        <td><div className="pupil-cell"><Avatar pupil={pupil} /><div><strong>{pupil.firstName} {pupil.lastName}</strong><span>{pupil.guardianPhone}</span></div></div></td>
        <td><span className="mono">{pupil.admissionNo}</span></td>
        <td>{pupil.className}</td>
        <td><StatusBadge paid={pupil.feePaid} expected={pupil.feeExpected} /><small className="attention-balance">{currency(feeBalance)} outstanding</small></td>
        <td>{pupil.usesBus ? <><StatusBadge paid={pupil.busPaid} expected={pupil.busExpected} /><small className="attention-balance">{currency(busBalance)} outstanding</small></> : <span className="restricted-value">Not using bus</span>}</td>
        <td><strong className="balance-unpaid">{currency(feeBalance + busBalance)}</strong></td>
        <td><button className="row-button"><ChevronRight size={17} /></button></td>
      </tr>
    })}</tbody>
  </table></div>
}

function PupilTable({ pupils, onSelect }) {
  return <div className="table-wrap"><table><thead><tr><th>Pupil</th><th>Admission no.</th><th>Class</th><th>School Bus</th><th>School fees</th><th>Amount paid</th><th>Outstanding balance</th><th></th></tr></thead><tbody>{pupils.map((pupil) => { const balance = Math.max(0, pupil.feeExpected - pupil.feePaid); const status = getPaymentStatus(pupil.feePaid, pupil.feeExpected); return <tr key={pupil.id} onClick={() => onSelect(pupil)}><td><div className="pupil-cell"><Avatar pupil={pupil} /><div><strong>{pupil.firstName} {pupil.lastName}</strong><span>{pupil.guardianPhone}</span></div></div></td><td><span className="mono">{pupil.admissionNo}</span></td><td>{pupil.className}</td><td>{pupil.usesBus ? <><span className="fee-section-label">{pupil.feeSection || 'Bus area not set'}</span>{pupil.feeSection === 'Far Away' && <small className="table-sub">{pupil.farAwayLocation}</small>}</> : <span className="restricted-value">Not using bus</span>}</td><td><StatusBadge paid={pupil.feePaid} expected={pupil.feeExpected} /></td><td><strong>{currency(pupil.feePaid)}</strong><small className="table-sub">of {currency(pupil.feeExpected)}</small></td><td><strong className={status === 'Part Payment' ? 'balance-partial' : status === 'Not Paid' ? 'balance-unpaid' : 'balance-clear'}>{currency(balance)}</strong>{status === 'Part Payment' && <small className="table-sub">still to be paid</small>}</td><td><button className="row-button"><ChevronRight size={17} /></button></td></tr> })}</tbody></table></div>
}

function FeesPage({ pupils, search, setSearch, setSelectedPupil, openPayment, onPrint }) {
  const totals = pupils.reduce((acc, p) => ({ expected: acc.expected + p.feeExpected, paid: acc.paid + p.feePaid }), { expected: 0, paid: 0 })
  return <>
    <PageHeading eyebrow="Finance" title="School fees" text="Track invoices, balances and pupil payment history." action={<div className="heading-actions"><button className="button button-secondary" onClick={onPrint}><Printer size={18} /> Print records</button><button className="button button-primary" onClick={() => openPayment()}><Plus size={18} /> Record payment</button></div>} />
    <section className="finance-summary"><div><span>Total billed</span><strong>{currency(totals.expected)}</strong></div><div><span>Total received</span><strong>{currency(totals.paid)}</strong></div><div><span>Outstanding balance</span><strong>{currency(totals.expected - totals.paid)}</strong></div></section>
    <div className="filter-bar"><div className="table-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a pupil..." /></div><button className="button button-secondary"><Download size={17} /> Export</button></div>
    <section className="panel table-panel"><PupilTable pupils={pupils} onSelect={setSelectedPupil} /></section>
  </>
}

function PaymentPrintReport({ pupils }) {
  const printedOn = new Intl.DateTimeFormat('en-NG', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
  return <section className="print-report">
    <header className="print-header">
      <Logo />
      <div><h1>School Fees Payment Record</h1><p>Current academic term</p></div>
    </header>
    <div className="print-meta"><span>Generated by the Main Administrator</span><span>{printedOn}</span></div>
    <table>
      <thead><tr><th>No.</th><th>Pupil</th><th>Admission No.</th><th>Class</th><th>Fee Section</th><th>Payment Record</th></tr></thead>
      <tbody>{pupils.map((pupil, index) => {
        const status = getPaymentStatus(pupil.feePaid, pupil.feeExpected)
        return <tr key={pupil.id}>
          <td>{index + 1}</td>
          <td><strong>{pupil.firstName} {pupil.lastName}</strong></td>
          <td>{pupil.admissionNo}</td>
          <td>{pupil.className}</td>
          <td>{pupil.feeSection}{pupil.feeSection === 'Far Away' ? ` — ${pupil.farAwayLocation}` : ''}</td>
          <td>{status === 'Part Payment'
            ? <div className="print-part-payment"><strong>Part Payment</strong><span>Paid: {currency(pupil.feePaid)}</span><span>Outstanding: {currency(Math.max(0, pupil.feeExpected - pupil.feePaid))}</span></div>
            : <strong className={status === 'Paid' ? 'print-paid' : 'print-unpaid'}>{status}</strong>}</td>
        </tr>
      })}</tbody>
    </table>
    <footer className="print-footer"><span>Regal Tulip School · Confidential financial record</span><span>Administrator’s signature: ____________________</span></footer>
  </section>
}

function BusPage({ pupils, openPayment }) {
  return <>
    <PageHeading eyebrow="Transport" title="School bus" text={`${pupils.length} pupils are enrolled for school transport.`} />
    <section className="route-grid">
      {pupils.map((pupil) => <article className="route-card" key={pupil.id}><div className="route-card-top"><Avatar pupil={pupil} /><StatusBadge paid={pupil.busPaid} expected={pupil.busExpected} /></div><h3>{pupil.firstName} {pupil.lastName}</h3><p>{pupil.className} · {pupil.busRoute || 'Route not assigned'}</p><div className="route-payment"><span>{currency(pupil.busPaid)} paid</span><strong>{currency(Math.max(0, pupil.busExpected - pupil.busPaid))} due</strong></div><div className="progress"><i style={{ width: `${Math.min(100, (pupil.busPaid / (pupil.busExpected || 1)) * 100)}%` }} /></div><button className="button button-secondary button-full" onClick={() => openPayment(pupil)}>Record bus payment</button></article>)}
    </section>
  </>
}

function ReportsPage({ pupils, payments, onExport }) {
  const today = '2026-08-02'
  const daily = payments.filter((payment) => payment.date === today)
  const byCategory = daily.reduce((acc, p) => ({ ...acc, [p.category]: (acc[p.category] || 0) + p.amount }), {})
  return <>
    <PageHeading eyebrow="Insights" title="Daily payment report" text="A concise summary ready for the school’s daily update." action={<button className="button button-primary" onClick={onExport}><Download size={18} /> Download CSV</button>} />
    <section className="report-hero"><div><span>Collected today</span><strong>{currency(daily.reduce((sum, p) => sum + p.amount, 0))}</strong><p>From {new Set(daily.map((p) => p.pupilId)).size} pupils across {Object.keys(byCategory).length} categories</p></div><GraduationCap size={76} /></section>
    <section className="dashboard-grid">
      <div className="panel"><div className="panel-header"><div><h2>Collection by category</h2><p>Payments entered today</p></div></div><div className="category-list">{Object.entries(byCategory).map(([name, amount]) => <div key={name}><span><i />{name}</span><strong>{currency(amount)}</strong></div>)}</div></div>
      <div className="panel"><div className="panel-header"><div><h2>Payment position</h2><p>All current pupil invoices</p></div></div><div className="status-summary">{['Paid','Part Payment','Not Paid'].map((status) => <div key={status}><StatusBadge label={status} /><strong>{pupils.filter((p) => getPaymentStatus(p.feePaid, p.feeExpected) === status).length} pupils</strong></div>)}</div><div className="report-note"><Bell size={18} /><p>The scheduled Supabase function can email this summary to approved recipients every evening.</p></div></div>
    </section>
  </>
}

function SettingsPage({ refreshSchoolData, notify }) {
  const [settingsVersion, setSettingsVersion] = useState(0)
  const changed = async () => {
    setSettingsVersion((value) => value + 1)
    await refreshSchoolData()
  }
  return <>
    <PageHeading eyebrow="Administration" title="Academic and fee settings" text="Create sessions and terms, select the current term, then enter expected school-fee and bus-fee amounts." />
    <AcademicSettings notify={notify} onChanged={changed} />
    <section className="settings-intro"><div><span className="settings-naira"><NairaIcon size={24} /></span><div><h3>Set fees and track balances</h3><p>Enter expected amounts here, then record payments after the school confirms receipt.</p></div></div></section>
    {isSupabaseConfigured
      ? <div className="fee-settings-section"><div className="settings-section-heading"><div className="settings-heading-icon gold"><NairaIcon /></div><div><span>Step 2</span><h2>School-fee and bus-fee amounts</h2><p>Select a session, term, class and fee section, then enter the expected Naira amounts.</p></div></div><FeeSettings key={settingsVersion} notify={notify} onSaved={refreshSchoolData} /></div>
      : <section className="panel settings-empty"><AlertCircle /><h3>Connect Supabase to manage fee schedules</h3><p>Fee-setting controls become available after the project URL and publishable key are added.</p></section>}
  </>
}

function PupilDrawer({ pupil, payments, fullFinancialAccess, onClose, onPayment }) {
  const details = [
    ['Admission number', pupil.admissionNo], ['Class', pupil.className], ['Age', `${age(pupil.dateOfBirth)} years`],
    ['Gender', pupil.gender], ['Guardian', pupil.guardianName], ['Guardian phone', pupil.guardianPhone],
    ['State of origin', pupil.stateOfOrigin], ['House address', pupil.address],
    ['Fee section', pupil.feeSection === 'Far Away' ? `Far Away · ${pupil.farAwayLocation}` : pupil.feeSection],
    ['Height', pupil.height ? `${pupil.height} cm` : '—'],
    ['Weight', pupil.weight ? `${pupil.weight} kg` : '—'], ['Blood group', pupil.bloodGroup || '—'], ['Complexion', pupil.complexion || '—'],
  ]
  const hasVisiblePartPayment = pupil.financialVisible && !fullFinancialAccess
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}><button className="drawer-close icon-button" onClick={onClose}><X /></button><div className="drawer-profile"><Avatar pupil={pupil} large /><span>{pupil.admissionType} pupil</span><h2>{pupil.firstName} {pupil.lastName}</h2><p>{pupil.className} · {pupil.admissionNo}</p></div><div className="drawer-actions"><button className="button button-primary" onClick={onPayment}><Plus size={17} /> Record payment</button></div>{fullFinancialAccess && <section className="drawer-section"><h3>Payment position</h3><div className="drawer-payments"><div><span>School fees</span><StatusBadge paid={pupil.feePaid} expected={pupil.feeExpected} /><strong>{currency(pupil.feePaid)} <small>/ {currency(pupil.feeExpected)}</small></strong><em>Outstanding: {currency(Math.max(0, pupil.feeExpected - pupil.feePaid))}</em></div><div><span>School bus</span>{pupil.usesBus ? <StatusBadge paid={pupil.busPaid} expected={pupil.busExpected} /> : <span className="mini-chip">Not enrolled</span>}<strong>{currency(pupil.busPaid)} <small>/ {currency(pupil.busExpected)}</small></strong>{pupil.usesBus && <em>Outstanding: {currency(Math.max(0, pupil.busExpected - pupil.busPaid))}</em>}</div></div></section>}{hasVisiblePartPayment && <section className="drawer-section"><h3>Part-payment figures</h3><div className="secondary-balance"><div><span>Amount paid</span><strong>{currency(pupil.feePaid + pupil.busPaid)}</strong></div><div><span>Outstanding</span><strong>{currency(Math.max(0, pupil.feeExpected - pupil.feePaid) + Math.max(0, pupil.busExpected - pupil.busPaid))}</strong></div></div></section>}<section className="drawer-section"><h3>Pupil details</h3><dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>{fullFinancialAccess && <section className="drawer-section"><h3>Recent payments</h3>{payments.length ? payments.map((p) => <div className="drawer-transaction" key={p.id}><div><strong>{p.category}</strong><span>{p.date} · {p.method}</span></div><strong>{currency(p.amount)}</strong></div>) : <p className="muted">No payments recorded.</p>}</section>}</aside></div>
}

export default App
