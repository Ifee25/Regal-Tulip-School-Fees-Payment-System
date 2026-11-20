import { useRef, useState } from 'react'
import Modal from './Modal'

function parsePupils(value) {
  const pupils = []
  for (const [index, line] of value.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const fields = line.split(line.includes('\t') ? '\t' : ',').map((field) => field.trim())
    if (fields.length !== 3 || fields.some((field) => !field)) {
      throw new Error(`Line ${index + 1} needs a first name, last name, and parent phone number.`)
    }
    const [firstName, lastName, guardianPhone] = fields
    pupils.push({ firstName, lastName, guardianPhone })
  }
  if (pupils.length < 1 || pupils.length > 250) {
    throw new Error('Enter between 1 and 250 pupils per batch.')
  }
  return pupils
}

export default function BulkPupilForm({ onSubmit, onClose }) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [registered, setRegistered] = useState(0)
  const inFlight = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || registered) return
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const pupils = parsePupils(input)
      await onSubmit(pupils)
      setRegistered(pupils.length)
    } catch (failure) {
      setError(failure.message || 'The pupils could not be registered. Please try again.')
    } finally {
      setSaving(false)
      inFlight.current = false
    }
  }

  function close() {
    if (!inFlight.current) onClose()
  }

  return <Modal title="Register multiple pupils" subtitle="Registration numbers are assigned automatically." onClose={close} wide>
  <form onSubmit={submit}>
    <div className="form-scroll">
      {registered > 0 ? <p role="status">
        {registered} {registered === 1 ? 'pupil registered' : 'pupils registered'} with automatic registration numbers.
        Open each pupil’s profile to complete their details.
      </p> : <>
        <label className="field">
          <span>Pupil details</span>
          <textarea rows={8} value={input} onChange={(event) => setInput(event.target.value)}
            aria-describedby="bulk-pupil-format" disabled={saving}
            placeholder="Amara, Okafor, 08012345678" required />
        </label>
        <p id="bulk-pupil-format" className="muted">
          Paste up to 250 spreadsheet rows without the header, or type one pupil per line.
          Use the order first name, last name, parent phone number.
        </p>
        {error && <p className="form-notice" role="alert">{error}</p>}
      </>}
    </div>
    <footer className="modal-actions">
      <button type="button" className={`button ${registered ? 'button-primary' : 'button-ghost'}`}
        onClick={close} disabled={saving}>{registered ? 'Done' : 'Cancel'}</button>
      {!registered && <button className="button button-primary" disabled={saving}>
        {saving ? 'Registering…' : 'Register pupils'}
      </button>}
    </footer>
  </form>
  </Modal>
}
