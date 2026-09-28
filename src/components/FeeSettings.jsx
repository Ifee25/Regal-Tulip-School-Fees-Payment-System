import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, BadgePercent, Bus, GraduationCap, MapPin, Save } from 'lucide-react'
import { loadFeeSettings, saveBusAreaFeeAmount, saveSchoolFeeAmount } from '../lib/schoolApi'
import { formatCurrencyInput } from '../utils/currencyInput'
import DiscountSettings from './DiscountSettings'

const zones = [
  { name: 'Inside Estate', note: 'Within the estate' },
  { name: 'Outside Estate', note: 'Nearby areas' },
  { name: 'Far Away', note: 'Set by specific location' },
]

const emptyBusAmounts = { 'Inside Estate': '', 'Outside Estate': '', 'Far Away': '' }
const savedFeeTab = () => {
  const saved = window.localStorage.getItem('regal-tulip-fee-tab')
  return ['school', 'bus', 'discounts'].includes(saved) ? saved : 'school'
}

export default function FeeSettings({ onSaved, notify }) {
  const [settings, setSettings] = useState({ terms: [], classes: [], schedules: [], pupils: [], discounts: [] })
  const [activeTab, setActiveTab] = useState(savedFeeTab)
  const [termId, setTermId] = useState('')
  const [farAwayLocation, setFarAwayLocation] = useState('')
  const [amounts, setAmounts] = useState({})
  const [busAmounts, setBusAmounts] = useState(emptyBusAmounts)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadFeeSettings()
      setSettings(data)
      setTermId((current) => current || data.terms.find((term) => term.active)?.id || data.terms[0]?.id || '')
    } catch (error) {
      notify(error.message || 'Unable to load fee settings.')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { window.localStorage.setItem('regal-tulip-fee-tab', activeTab) }, [activeTab])

  useEffect(() => {
    if (activeTab === 'school') {
      const nextAmounts = {}
      settings.classes.forEach((schoolClass) => {
        const schedule = settings.schedules.find((item) =>
          item.term_id === termId
          && item.class_id === schoolClass.id
          && item.category_name === 'Tuition'
          && item.fee_section === 'Inside Estate'
          && !item.far_away_location
        )
        nextAmounts[schoolClass.id] = schedule ? formatCurrencyInput(schedule.amount_due) : ''
      })
      setAmounts(nextAmounts)
      return
    }

    const nextBusAmounts = { 'Far Away': '' }
    zones.filter((zone) => zone.name !== 'Far Away').forEach((zone) => {
      const schedule = settings.schedules.find((item) =>
        item.term_id === termId
        && item.category_name === 'School Bus'
        && item.fee_section === zone.name
      )
      nextBusAmounts[zone.name] = schedule ? formatCurrencyInput(schedule.amount_due) : ''
    })
    setBusAmounts(nextBusAmounts)
  }, [settings, activeTab, termId])

  useEffect(() => {
    if (activeTab !== 'bus') return
    if (activeTab !== 'bus') return
    const location = farAwayLocation.trim().toLowerCase()
    const schedule = location && settings.schedules.find((item) =>
      item.term_id === termId
      && item.category_name === 'School Bus'
      && item.fee_section === 'Far Away'
      && (item.far_away_location || '').toLowerCase() === location
    )
    setBusAmounts((current) => ({ ...current, 'Far Away': schedule ? formatCurrencyInput(schedule.amount_due) : '' }))
  }, [settings.schedules, activeTab, termId, farAwayLocation])

  function selectTab(tab) {
    setActiveTab(tab)
    setFarAwayLocation('')
  }

  async function submit(event) {
    event.preventDefault()
    const schoolEntries = settings.classes
      .map((schoolClass) => ({ classId: schoolClass.id, amount: amounts[schoolClass.id] }))
      .filter((entry) => entry.amount !== '')
    const busEntries = zones
      .map((zone) => ({ feeSection: zone.name, amount: busAmounts[zone.name] }))
      .filter((entry) => entry.amount !== '')

    if (activeTab === 'school' && !schoolEntries.length) {
      notify('Enter at least one class amount before saving.')
      return
    }
    if (activeTab === 'bus' && !busEntries.length) {
      notify('Enter at least one expected bus fee before saving.')
      return
    }
    if (activeTab === 'bus' && busAmounts['Far Away'] !== '' && !farAwayLocation.trim()) {
      notify('Enter the specific Far Away location for its bus fee.')
      return
    }

    setSaving(true)
    try {
      if (activeTab === 'school') {
        await Promise.all(schoolEntries.map((entry) => saveSchoolFeeAmount({
          termId,
          classId: entry.classId,
          amount: entry.amount,
        })))
      } else {
        await Promise.all(busEntries.map((entry) => saveBusAreaFeeAmount({
          termId,
          feeSection: entry.feeSection,
          farAwayLocation: entry.feeSection === 'Far Away' ? farAwayLocation : '',
          amount: entry.amount,
        })))
      }

      notify(activeTab === 'school'
        ? `${schoolEntries.length} class school-fee ${schoolEntries.length === 1 ? 'amount was' : 'amounts were'} saved.`
        : `${busEntries.length} bus-area ${busEntries.length === 1 ? 'amount was' : 'amounts were'} saved together.`)
      await refresh()
      onSaved()
    } catch (error) {
      notify(error.message || 'The fee amounts could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="settings-loading">Loading fee settings…</div>
  if (!settings.terms.length) return <div className="settings-empty"><AlertCircle /><h3>Create an academic term first</h3><p>Use Step 1 above before entering school-fee or bus-fee amounts.</p></div>

  return <div className="compact-fees">
    <div className="fee-type-tabs">
      <button type="button" className={activeTab === 'school' ? 'active' : ''} onClick={() => selectTab('school')}><GraduationCap /><span><strong>School Fees</strong><small>Different tuition amount for every class</small></span></button>
      <button type="button" className={activeTab === 'bus' ? 'active bus' : ''} onClick={() => selectTab('bus')}><Bus /><span><strong>Bus Fees</strong><small>Three transport-area amounts</small></span></button>
      <button type="button" className={activeTab === 'discounts' ? 'active discount' : ''} onClick={() => selectTab('discounts')}><BadgePercent /><span><strong>Discounts</strong><small>Individual expected pupil amounts</small></span></button>
    </div>

    {activeTab === 'discounts' ? <div className="compact-fee-form">
      <div className="fee-toolbar">
        <label className="field"><span>Session and term</span><select required value={termId} onChange={(event) => setTermId(event.target.value)}>{settings.terms.map((term) => <option key={term.id} value={term.id}>{term.session?.name} · {term.name}{term.active ? ' (Current)' : ''}</option>)}</select></label>
        <div className="fee-toolbar-note"><strong>Individual expected amounts</strong><span>These amounts remain protected when normal class or bus rates change.</span></div>
      </div>
      <DiscountSettings key={termId} settings={settings} termId={termId} notify={notify} onChanged={async () => { await refresh(); await onSaved() }} />
    </div> : <form className="compact-fee-form" onSubmit={submit}>
      <div className="fee-toolbar">
        <label className="field"><span>Session and term</span><select required value={termId} onChange={(event) => setTermId(event.target.value)}>{settings.terms.map((term) => <option key={term.id} value={term.id}>{term.session?.name} · {term.name}{term.active ? ' (Current)' : ''}</option>)}</select></label>
        <div className="fee-toolbar-note"><strong>{activeTab === 'school' ? 'School fee rates by class' : 'All bus-area rates'}</strong><span>{activeTab === 'school' ? 'Each class keeps its own amount.' : 'Enter the three location rates together and save once.'}</span></div>
      </div>

      {activeTab === 'bus' && <>
        <div className="zone-heading"><MapPin size={16} /><div><strong>Expected bus fees by area</strong><span>One amount per area applies to pupils in every class.</span></div></div>
        <div className="bus-rate-grid">
          {zones.map((zone) => <section className={`bus-rate-card ${zone.name === 'Far Away' ? 'far' : ''}`} key={zone.name}>
            <div><strong>{zone.name}</strong><span>{zone.note}</span></div>
            {zone.name === 'Far Away' && <label><span>Specific location</span><input value={farAwayLocation} onChange={(event) => setFarAwayLocation(event.target.value)} placeholder="e.g. Abakpa" /></label>}
            <label><span>Expected amount</span><div className="naira-input"><span>₦</span><input inputMode="decimal" value={busAmounts[zone.name] ?? ''} onChange={(event) => setBusAmounts((current) => ({ ...current, [zone.name]: formatCurrencyInput(event.target.value) }))} placeholder="0.00" /></div></label>
          </section>)}
        </div>
      </>}

      {activeTab === 'school' && <>
        <div className="class-rate-heading"><div><strong>Expected amounts by class</strong><span>Enter or edit only the classes you need, then save.</span></div><small>{settings.classes.length} classes</small></div>
        <div className="class-rate-grid">
          {settings.classes.map((schoolClass) => <label className="class-rate-field" key={schoolClass.id}>
            <span>{schoolClass.name}</span>
            <div className="naira-input"><span>₦</span><input inputMode="decimal" value={amounts[schoolClass.id] ?? ''} onChange={(event) => setAmounts((current) => ({ ...current, [schoolClass.id]: formatCurrencyInput(event.target.value) }))} placeholder="0.00" /></div>
          </label>)}
        </div>
      </>}

      <div className="class-rate-actions">
        <p>{activeTab === 'school' ? 'Blank classes will remain unchanged.' : 'Blank areas remain unchanged. Saving again updates balances.'}</p>
        <button className="button button-primary" disabled={saving}><Save size={17} />{saving ? 'Saving…' : `Save ${activeTab === 'school' ? 'school fees' : 'all bus fees'}`}</button>
      </div>
    </form>}
  </div>
}
