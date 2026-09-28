import { useState } from 'react'
import { CheckCircle2, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import Logo from './Logo'

export default function AccountSetup({ email, onComplete, loading, error }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')

  function submit(event) {
    event.preventDefault()
    setLocalError('')
    if (password !== confirmPassword) {
      setLocalError('The passwords do not match.')
      return
    }
    onComplete({ username: username.trim(), password })
  }

  return (
    <main className="setup-page">
      <form className="setup-card" onSubmit={submit}>
        <Logo />
        <div className="setup-icon"><CheckCircle2 /></div>
        <span className="eyebrow">Email verified</span>
        <h1>Finish creating your account</h1>
        <p>Your approved email is <strong>{email}</strong>. Choose the username and password you want to use.</p>
        {(localError || error) && <div className="form-error">{localError || error}</div>}
        <label className="field"><span>Choose a username</span><div className="input-with-icon"><UserRound size={17} /><input required minLength="3" maxLength="30" pattern="[A-Za-z][A-Za-z0-9._]{2,29}" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your preferred username" autoComplete="username" /></div></label>
        <label className="field"><span>Create a password</span><div className="input-with-icon"><LockKeyhole size={17} /><input required minLength="8" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <label className="field"><span>Confirm password</span><div className="input-with-icon"><LockKeyhole size={17} /><input required minLength="8" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" /></div></label>
        <button className="button button-primary login-button" disabled={loading}>{loading ? 'Saving your account…' : 'Complete account setup'}</button>
      </form>
    </main>
  )
}
