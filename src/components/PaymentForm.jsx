import { useEffect, useMemo, useState } from 'react'
import { Banknote, Check } from 'lucide-react'
import { getPaymentStatus } from '../utils/payments'
import { formatCurrencyInput, parseCurrencyInput } from '../utils/currencyInput'

export default function PaymentForm({ pupils, preselectedPupil, fullFinancialAccess = false, onSubmit, onCancel }) {
  const [pupilId, setPupilId] = useState(preselectedPupil?.id || '')
  const [category, setCategory] = useState('Tuition')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Bank Transfer')
  const pupil = useMemo(() => pupils.find((item) => item.id === pupilId), [pupils, pupilId])
  const expected = category === 'School Bus' ? pupil?.busExpected : pupil?.feeExpected
  const alreadyPaid = category === 'School Bus' ? pupil?.busPaid : pupil?.feePaid
  const canShowFinancialDetails = fullFinancialAccess || (
    category === 'School Bus' ? pupil?.busFinancialVisible : pupil?.feeFinancialVisible
  )
  const numericAmount = parseCurrencyInput(amount)
  const status = getPaymentStatus((alreadyPaid || 0) + numericAmount, expected || 0)

  useEffect(() => {
    if (category === 'School Bus' && !pupil?.usesBus) setCategory('Tuition')
  }, [category, pupil])

  function submit(event) {
    event.preventDefault()
    onSubmit({ id: crypto.randomUUID(), pupilId, category, amount: numericAmount, method, date: new Date().toISOString().slice(0, 10) })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-scroll">
        <div className="payment-icon"><Banknote /></div>
        <div className="form-grid">
          <label className="field field-full"><span>Pupil</span><select required value={pupilId} onChange={(e) => setPupilId(e.target.value)}><option value="">Select pupil</option>{pupils.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} · {item.className}</option>)}</select></label>
          <label className="field"><span>Fee category</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{['Tuition', ...(pupil?.usesBus ? ['School Bus'] : [])].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>Amount received (₦)</span><input required inputMode="decimal" value={amount} onChange={(event) => setAmount(formatCurrencyInput(event.target.value))} placeholder="0.00" /></label>
          <label className="field"><span>Payment method</span><select value={method} onChange={(e) => setMethod(e.target.value)}><option>Bank Transfer</option><option>Cash</option><option>POS</option><option>Cheque</option></select></label>
        </div>
        {pupil && canShowFinancialDetails && <div className="payment-preview"><div><span>Expected</span><strong>₦{(expected || 0).toLocaleString()}</strong></div><div><span>Paid after entry</span><strong>₦{((alreadyPaid || 0) + numericAmount).toLocaleString()}</strong></div><div><span>Calculated status</span><strong className={`text-${status.toLowerCase().replace(' ', '-')}`}>{status}</strong></div></div>}
      </div>
      <footer className="modal-actions"><button type="button" className="button button-ghost" onClick={onCancel}>Cancel</button><button className="button button-primary"><Check size={18} /> Save payment</button></footer>
    </form>
  )
}
