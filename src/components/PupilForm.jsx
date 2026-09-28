import { useRef, useState } from 'react'
import { Camera, Check, Upload } from 'lucide-react'

const initialForm = {
  firstName: '', lastName: '', admissionNo: '', admissionType: 'New', className: '',
  dateOfBirth: '', gender: '', guardianName: '', guardianPhone: '', stateOfOrigin: '',
  address: '', height: '', weight: '', bloodGroup: '', complexion: '', usesBus: false,
  busRoute: '', feeSection: 'Inside Estate', farAwayLocation: '', photoUrl: '',
}

const Field = ({ label, children, full = false }) => (
  <label className={full ? 'field field-full' : 'field'}>
    <span>{label}</span>
    {children}
  </label>
)

export default function PupilForm({ onSubmit, onCancel, initialPupil = null }) {
  const editing = Boolean(initialPupil)
  const [form, setForm] = useState(() => initialPupil ? {
    ...initialForm,
    ...initialPupil,
    height: initialPupil.height || '',
    weight: initialPupil.weight || '',
  } : initialForm)
  const [photoPreview, setPhotoPreview] = useState(initialPupil?.photoUrl || '')
  const [submitting, setSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)
  const fileRef = useRef(null)
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }))

  function handlePhoto(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result)
    reader.readAsDataURL(file)
    update('photoFile', file)
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting || registered) return
    setSubmitting(true)
    const succeeded = await onSubmit({ ...form, photoUrl: photoPreview, id: initialPupil?.id || crypto.randomUUID(), feePaid: initialPupil?.feePaid || 0, busPaid: initialPupil?.busPaid || 0 })
    setSubmitting(false)
    if (!succeeded) return
    setRegistered(true)
    window.setTimeout(onCancel, 1400)
  }

  return (
    <form onSubmit={submit}>
      <div className="form-scroll">
        <div className="photo-uploader" onClick={() => fileRef.current?.click()}>
          {photoPreview ? <img src={photoPreview} alt="Pupil preview" /> : <Camera size={30} />}
          <div><strong>{photoPreview ? 'Change pupil photo' : 'Upload pupil photo'}</strong><span>JPG or PNG, maximum 5 MB</span></div>
          <Upload size={18} />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={handlePhoto} hidden />
        </div>
        <h3 className="form-section-title">Pupil information</h3>
        <div className="form-grid">
          <Field label="First name"><input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="e.g. Amara" /></Field>
          <Field label="Last name"><input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="e.g. Okafor" /></Field>
          <Field label="Admission number"><input required value={form.admissionNo} onChange={(e) => update('admissionNo', e.target.value)} placeholder="RTS/2026/001" /></Field>
          <Field label="Admission type"><select value={form.admissionType} onChange={(e) => update('admissionType', e.target.value)}><option>New</option><option>Returning</option></select></Field>
          <Field label="Class"><select required value={form.className} onChange={(e) => update('className', e.target.value)}><option value="">Select class</option>{['Creche','Play Group','Nursery 1','Nursery 2','Nursery 3','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Date of birth"><input required type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} /></Field>
          <Field label="Gender"><select required value={form.gender} onChange={(e) => update('gender', e.target.value)}><option value="">Select gender</option><option>Female</option><option>Male</option></select></Field>
          <Field label="State of origin"><input value={form.stateOfOrigin} onChange={(e) => update('stateOfOrigin', e.target.value)} placeholder="e.g. Enugu" /></Field>
          <Field label="Height (cm)"><input type="number" value={form.height} onChange={(e) => update('height', e.target.value)} /></Field>
          <Field label="Weight (kg)"><input type="number" value={form.weight} onChange={(e) => update('weight', e.target.value)} /></Field>
          <Field label="Blood group"><select value={form.bloodGroup} onChange={(e) => update('bloodGroup', e.target.value)}><option value="">Select</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Complexion"><select value={form.complexion} onChange={(e) => update('complexion', e.target.value)}><option value="">Select</option><option>Fair</option><option>Medium</option><option>Dark</option></select></Field>
        </div>
        <h3 className="form-section-title">Guardian & address</h3>
        <div className="form-grid">
          <Field label="Guardian's full name"><input required value={form.guardianName} onChange={(e) => update('guardianName', e.target.value)} /></Field>
          <Field label="Guardian's phone number"><input required type="tel" value={form.guardianPhone} onChange={(e) => update('guardianPhone', e.target.value)} /></Field>
          <Field label="House address" full><textarea required value={form.address} onChange={(e) => update('address', e.target.value)} rows="2" /></Field>
        </div>
        <h3 className="form-section-title">Fees & transport</h3>
        <div className="form-notice">The expected school-fee and bus amounts are taken automatically from the active term’s fee schedule.</div>
        <div className="form-grid">
          <Field label="Uses school bus"><select value={form.usesBus ? 'Yes' : 'No'} onChange={(e) => {
            const usesBus = e.target.value === 'Yes'
            setForm((current) => ({
              ...current,
              usesBus,
              feeSection: usesBus ? (current.feeSection || 'Inside Estate') : 'Inside Estate',
              farAwayLocation: usesBus ? current.farAwayLocation : '',
              busRoute: usesBus ? current.busRoute : '',
            }))
          }}><option>No</option><option>Yes</option></select></Field>
          {form.usesBus && <>
            <Field label="Bus fee area"><select required value={form.feeSection} onChange={(e) => { update('feeSection', e.target.value); if (e.target.value !== 'Far Away') update('farAwayLocation', '') }}><option>Inside Estate</option><option>Outside Estate</option><option>Far Away</option></select></Field>
            {form.feeSection === 'Far Away' && <Field label="Far Away location"><input required value={form.farAwayLocation} onChange={(e) => update('farAwayLocation', e.target.value)} placeholder="Enter town, area or community" /></Field>}
            <Field label="Bus route"><input value={form.busRoute} onChange={(e) => update('busRoute', e.target.value)} placeholder="Optional route name" /></Field>
          </>}
        </div>
      </div>
      <footer className="modal-actions"><button type="button" className="button button-ghost" onClick={onCancel} disabled={submitting || registered}>Cancel</button><button className={`button ${registered ? 'button-success' : 'button-primary'}`} disabled={submitting || registered}><Check size={18} />{registered ? (editing ? 'Successfully updated' : 'Successfully registered') : submitting ? (editing ? 'Updating…' : 'Registering…') : (editing ? 'Save pupil changes' : 'Register pupil')}</button></footer>
    </form>
  )
}
