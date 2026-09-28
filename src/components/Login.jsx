import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import Logo from './Logo'

export default function Login({ onSubmit, onSignUp, error, message, loading }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')

  function submit(event) {
    event.preventDefault()
    setLocalError('')
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setLocalError('The passwords do not match.')
        return
      }
      onSignUp({ email: email.trim(), username: username.trim(), password })
    } else {
      onSubmit(username.trim(), password)
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-story-inner">
          <Logo />
          <div className="login-quote">
            <span>School administration, thoughtfully organised.</span>
            <h1>Every pupil.<br />Every payment.<br />One clear picture.</h1>
            <p>Securely manage pupil records, fees and school transport from one dependable workspace.</p>
          </div>
          <small>Regal Tulip School · Administration Portal</small>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">Authorised personnel only</span>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p>{mode === 'login' ? 'Sign in with your administrator username.' : 'Choose your username and password using one of the two required school email addresses.'}</p>
          {(localError || error) && <div className="form-error">{localError || error}</div>}
          {message && <div className="form-success">{message}</div>}
          <label className="field">
            <span>{mode === 'login' ? 'Username' : 'Choose a username'}</span>
            <div className="input-with-icon"><UserRound size={17} /><input required minLength="3" maxLength="30" pattern="[A-Za-z][A-Za-z0-9._]{2,29}" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={mode === 'login' ? 'Enter your username' : 'Your preferred username'} autoComplete="username" /></div>
          </label>
          {mode === 'signup' && <label className="field">
            <span>Approved email address</span>
            <div className="input-with-icon"><Mail size={17} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your approved school email" autoComplete="email" /></div>
          </label>}
          <label className="field">
            <span>Password</span>
            <div className="input-with-icon"><LockKeyhole size={17} /><input required minLength="8" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          </label>
          {mode === 'signup' && <label className="field"><span>Confirm password</span><div className="input-with-icon"><LockKeyhole size={17} /><input required minLength="8" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" /></div></label>}
          <button className="button button-primary login-button" disabled={loading}>{loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in securely' : 'Create administrator account')}</button>
          <button type="button" className="auth-switch" onClick={() => { setMode((value) => value === 'login' ? 'signup' : 'login'); setLocalError('') }}>{mode === 'login' ? 'First time here? Create your account' : 'Already completed setup? Sign in'}</button>
          <small className="login-help">Contact the school system owner if you cannot access your account.</small>
        </form>
      </section>
    </main>
  )
}
