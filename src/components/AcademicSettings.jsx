import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Plus } from 'lucide-react'
import { loadAcademicSettings, saveAcademicTerm, selectCurrentTerm } from '../lib/schoolApi'

const emptyForm = {
  sessionName: '',
  sessionStartsOn: '',
  sessionEndsOn: '',
  termName: 'First Term',
  termStartsOn: '',
  termEndsOn: '',
  makeCurrent: true,
}

export default function AcademicSettings({ notify, onChanged }) {
  const [sessions, setSessions] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }))
  const currentYear = new Date().getFullYear()
  const generatedSessions = Array.from({ length: 16 }, (_, index) => {
    const startYear = currentYear - 5 + index
    return `${startYear}/${startYear + 1}`
  })
  const sessionOptions = [...new Set([
    ...sessions.map((session) => session.name),
    ...generatedSessions,
  ])].sort((a, b) => a.localeCompare(b))

  function selectSession(sessionName) {
    const existing = sessions.find((session) => session.name === sessionName)
    setForm((current) => ({
      ...current,
      sessionName,
      sessionStartsOn: existing?.starts_on || '',
      sessionEndsOn: existing?.ends_on || '',
    }))
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSessions(await loadAcademicSettings())
    } catch (error) {
      notify(error.message || 'Unable to load academic sessions.')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { refresh() }, [refresh])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveAcademicTerm(form)
      notify(`${form.sessionName} · ${form.termName} saved successfully.`)
      setForm((current) => ({ ...emptyForm, sessionName: current.sessionName, sessionStartsOn: current.sessionStartsOn, sessionEndsOn: current.sessionEndsOn, termName: current.termName }))
      await refresh()
      onChanged()
    } catch (error) {
      notify(error.message || 'The academic term could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function makeCurrent(term, sessionId) {
    try {
      await selectCurrentTerm(term.id, sessionId)
      notify(`${term.name} is now the current academic term.`)
      await refresh()
      onChanged()
    } catch (error) {
      notify(error.message || 'The current term could not be changed.')
    }
  }

  return <section className="academic-settings">
    <div className="settings-section-heading"><div className="settings-heading-icon"><CalendarDays /></div><div><span>Step 1</span><h2>Academic session and term</h2><p>Create First, Second and Third Term, then select which one is currently active.</p></div></div>
    <form className="academic-form" onSubmit={submit}>
      <div className="settings-grid">
        <label className="field"><span>Academic session</span><select required value={form.sessionName} onChange={(event) => selectSession(event.target.value)}><option value="">Select academic session</option>{sessionOptions.map((sessionName) => <option key={sessionName} value={sessionName}>{sessionName}</option>)}</select></label>
        <label className="field"><span>Term</span><select value={form.termName} onChange={(event) => update('termName', event.target.value)}><option>First Term</option><option>Second Term</option><option>Third Term</option></select></label>
        <label className="field"><span>Session starts</span><input required type="date" value={form.sessionStartsOn} onChange={(event) => update('sessionStartsOn', event.target.value)} /></label>
        <label className="field"><span>Session ends</span><input required type="date" value={form.sessionEndsOn} onChange={(event) => update('sessionEndsOn', event.target.value)} /></label>
        <label className="field"><span>Term starts</span><input required type="date" value={form.termStartsOn} onChange={(event) => update('termStartsOn', event.target.value)} /></label>
        <label className="field"><span>Term ends</span><input required type="date" value={form.termEndsOn} onChange={(event) => update('termEndsOn', event.target.value)} /></label>
      </div>
      <label className="check-field"><input type="checkbox" checked={form.makeCurrent} onChange={(event) => update('makeCurrent', event.target.checked)} /><span>Make this the current term after saving</span></label>
      <button className="button button-primary" disabled={saving}><Plus size={17} />{saving ? 'Saving…' : 'Save session and term'}</button>
    </form>
    <div className="term-list">
      <h3>Configured sessions and terms</h3>
      {loading ? <p>Loading…</p> : sessions.length ? sessions.map((session) => <div className="session-row" key={session.id}><div className="session-name"><strong>{session.name}</strong><span>{session.starts_on} — {session.ends_on}</span></div><div className="session-terms">{(session.terms || []).sort((a, b) => a.starts_on.localeCompare(b.starts_on)).map((term) => <div className={term.active ? 'term-row current' : 'term-row'} key={term.id}><div><strong>{term.name}</strong><span>{term.starts_on} — {term.ends_on}</span></div>{term.active ? <span className="current-chip"><Check size={13} /> Current</span> : <button className="text-button" onClick={() => makeCurrent(term, session.id)}>Make current</button>}</div>)}</div></div>) : <p>No academic session has been created yet.</p>}
    </div>
  </section>
}
