import { useMemo, useState } from 'react'
import { Plus, Save, Search, Trash2, Users } from 'lucide-react'
import { removePupilDiscount, savePupilDiscount } from '../lib/schoolApi'
import { formatCurrencyInput } from '../utils/currencyInput'

export default function DiscountSettings({ settings, termId, notify, onChanged }) {
  const existing = useMemo(() => settings.discounts.filter((item) => item.term_id === termId), [settings.discounts, termId])
  const [selectedPupilId, setSelectedPupilId] = useState('')
  const [search, setSearch] = useState('')
  const [addedIds, setAddedIds] = useState([])
  const [amounts, setAmounts] = useState({})
  const [saving, setSaving] = useState(false)

  const rowIds = [...new Set([...existing.map((item) => item.pupil_id), ...addedIds])]
  const rows = rowIds
    .map((id) => settings.pupils.find((pupil) => pupil.id === id))
    .filter(Boolean)
  const availablePupils = settings.pupils.filter((pupil) => {
    const text = `${pupil.first_name} ${pupil.last_name} ${pupil.admission_number} ${pupil.class?.name || ''}`.toLowerCase()
    return !rowIds.includes(pupil.id) && text.includes(search.toLowerCase())
  })

  function valueFor(pupilId, categoryName) {
    const key = `${pupilId}:${categoryName}`
    if (amounts[key] !== undefined) return amounts[key]
    const saved = existing.find((item) => item.pupil_id === pupilId && item.category_name === categoryName)
    return saved ? formatCurrencyInput(saved.custom_amount_due) : ''
  }

  function setValue(pupilId, categoryName, value) {
    setAmounts((current) => ({ ...current, [`${pupilId}:${categoryName}`]: formatCurrencyInput(value) }))
  }

  function addPupil() {
    if (!selectedPupilId) return
    setAddedIds((current) => [...current, selectedPupilId])
    setSelectedPupilId('')
    setSearch('')
  }

  async function saveAll() {
    const changes = rows.flatMap((pupil) => [
      { pupilId: pupil.id, categoryName: 'Tuition', amount: valueFor(pupil.id, 'Tuition') },
      { pupilId: pupil.id, categoryName: 'School Bus', amount: valueFor(pupil.id, 'School Bus') },
    ]).filter((item) => item.amount !== '')

    if (!changes.length) {
      notify('Enter at least one custom expected amount before saving.')
      return
    }

    setSaving(true)
    try {
      await Promise.all(changes.map((item) => savePupilDiscount({ ...item, termId })))
      notify(`${changes.length} individual expected ${changes.length === 1 ? 'amount was' : 'amounts were'} saved successfully.`)
      setAmounts({})
      setAddedIds([])
      await onChanged()
    } catch (error) {
      notify(error.message || 'The individual expected amounts could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function removePupil(pupilId) {
    setSaving(true)
    try {
      const categories = existing
        .filter((item) => item.pupil_id === pupilId)
        .map((item) => item.category_name)
      await Promise.all(categories.map((categoryName) => removePupilDiscount({ pupilId, termId, categoryName })))
      setAddedIds((current) => current.filter((id) => id !== pupilId))
      setAmounts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${pupilId}:`))))
      notify('The pupil was removed from Discounts and standard expected amounts were restored.')
      await onChanged()
    } catch (error) {
      notify(error.message || 'The pupil could not be removed from Discounts.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="discount-settings">
    <div className="discount-add">
      <div className="discount-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pupil name or admission number" /></div>
      <select value={selectedPupilId} onChange={(event) => setSelectedPupilId(event.target.value)}>
        <option value="">Select a pupil</option>
        {availablePupils.map((pupil) => <option key={pupil.id} value={pupil.id}>{pupil.first_name} {pupil.last_name} · {pupil.class?.name}</option>)}
      </select>
      <button type="button" className="button button-secondary" onClick={addPupil} disabled={!selectedPupilId}><Plus size={16} /> Add pupil</button>
    </div>

    {rows.length ? <div className="discount-list">
      <div className="discount-list-head"><div><Users size={17} /><span>Pupil</span></div><span>Custom school fee</span><span>Custom bus fee</span><span />
      </div>
      {rows.map((pupil) => {
        const usesBus = pupil.bus_enrollments?.some((item) => item.term_id === termId && item.active)
        return <div className="discount-row" key={pupil.id}>
          <div className="discount-pupil"><strong>{pupil.first_name} {pupil.last_name}</strong><span>{pupil.admission_number} · {pupil.class?.name}</span></div>
          <div className="naira-input"><span>₦</span><input inputMode="decimal" value={valueFor(pupil.id, 'Tuition')} onChange={(event) => setValue(pupil.id, 'Tuition', event.target.value)} placeholder="Expected amount" /></div>
          <div className={`naira-input ${usesBus ? '' : 'disabled-amount'}`}><span>₦</span><input disabled={!usesBus} inputMode="decimal" value={usesBus ? valueFor(pupil.id, 'School Bus') : ''} onChange={(event) => setValue(pupil.id, 'School Bus', event.target.value)} placeholder={usesBus ? 'Expected amount' : 'Not using bus'} /></div>
          <button type="button" className="discount-remove" onClick={() => removePupil(pupil.id)} disabled={saving} title="Remove discount"><Trash2 size={16} /></button>
        </div>
      })}
      <div className="discount-actions"><p>Saved custom amounts replace the normal expected amount only for the selected pupil and term.</p><button type="button" className="button button-primary" onClick={saveAll} disabled={saving}><Save size={17} />{saving ? 'Saving…' : 'Save discounts'}</button></div>
    </div> : <div className="discount-empty"><Users /><strong>No pupils added yet</strong><span>Search for a pupil, add their name, then enter the individual amount they are expected to pay.</span></div>}
  </div>
}
