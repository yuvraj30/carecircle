import '../auth-refresh.css'
import '../invite-welcome.css'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useApp } from '../context'
import { HeartIcon } from '../components/icons'
import { Button, Card, Field } from '../components/ui'
import { api, publicApi, supabase } from '../lib/supabase'
import { useAuthStatus } from '../auth/AuthStatus'
import { returnPath } from '../auth/Gate'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="cc-auth-shell">
    <aside className="cc-auth-story"><Link to="/" className="cc-auth-brand"><span><HeartIcon className="w-5 h-5" /></span>CareCircle</Link><div className="cc-auth-story-copy"><span className="cc-auth-eyebrow">CARE, TOGETHER</span><h1>Care feels lighter<br /><em>when it's shared.</em></h1><p>A thoughtful place for your family to keep track of the little things that matter.</p><div className="cc-auth-story-note"><span>✳</span><div><strong>One circle, many hands.</strong><small>Share care at your own pace.</small></div></div></div><p className="cc-auth-footnote">CareCircle supports coordination, not medical or emergency services.</p></aside>
    <main className="cc-auth-main"><div className="cc-auth-form"><Link to="/" className="cc-auth-mobile-brand"><span><HeartIcon className="w-4 h-4" /></span>CareCircle</Link><span className="cc-auth-form-kicker">YOUR CARE CIRCLE</span><h2>{title}</h2><p className="cc-auth-subtitle">{subtitle}</p>{children}</div></main>
  </div>
}

export function Login() {
  const { state, actions } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [authError, setAuthError] = useState('')
  const hashError = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_code')
  useEffect(() => {
    if (state.currentUser && !state.isLoading) {
      navigate(returnPath(location.search, Object.keys(state.circles).length ? '/app' : '/onboarding'))
    }
  }, [state.currentUser, state.isLoading, state.circles, navigate, location.search])
  const valid = email.includes('@') && password.length >= 8
  return <AuthShell title="Welcome back" subtitle="Sign in to your CareCircle account.">
    <form onSubmit={async event => {
      event.preventDefault()
      setAttempted(true)
      setAuthError('')
      if (!valid) return
      try {
        await actions.signIn(email.trim(), password)
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Sign-in could not be completed. Please try again.')
      }
    }} className="space-y-4">
      {hashError && <Card className="p-4"><p className="text-sm text-amber-800">That confirmation link has expired or was already used.</p><Button type="button" variant="secondary" className="mt-3" disabled={!email.includes('@')} onClick={async () => {
        try {
          await publicApi('/resend-verification', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
          sessionStorage.setItem('carecircle-verification-email', email.trim())
          navigate(`/verify-email${location.search}`)
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'A new link could not be sent')
        }
      }}>Send a new link</Button></Card>}
      <Field label="Email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} error={attempted && !email.includes('@') ? 'Enter a valid email' : undefined} />
      <div className="relative"><Field label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} error={attempted && password.length < 8 ? 'Use at least 8 characters' : undefined} /><button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-9 text-xs font-semibold text-[#2B6B50]">{show ? 'Hide' : 'Show'}</button></div>
      {authError && <p className="text-sm text-rose-600" role="alert">{authError}</p>}
      <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Your account stays signed in on this device</span><Link to={`/forgot-password${location.search}`} className="text-[#2B6B50] font-medium">Forgot password?</Link></div>
      <Button type="submit" className="w-full" disabled={state.isLoading}>{state.isLoading ? 'Signing in…' : 'Sign in'}</Button>
    </form>
    <p className="text-center text-sm text-slate-500 mt-6">New to CareCircle? <Link to={`/create-account${location.search}`} className="text-[#2B6B50] font-semibold">Create account</Link></p>
  </AuthShell>
}

export function CreateAccount() {
  const { state, actions } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false })
  const [attempted, setAttempted] = useState(false)
  const valid = form.name && form.email.includes('@') && form.password.length >= 8 && form.password === form.confirm && form.terms
  return <AuthShell title="Create your account" subtitle="Create an account to start your care circle.">
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault()
      setAttempted(true)
      if (!valid) return
      const result = await actions.signUp(form.name, form.email, form.password)
      if (result.success) {
        sessionStorage.setItem('carecircle-verification-email', form.email.trim())
        navigate(result.needsVerification ? `/verify-email${location.search}` : returnPath(location.search, '/onboarding'))
      }
    }}>
      <Field label="Full name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} error={attempted && !form.name ? 'Name is required' : undefined} />
      <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} error={attempted && !form.email.includes('@') ? 'Enter a valid email' : undefined} />
      <Field label="Password" type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} hint="At least 8 characters. CareCircle never stores this password." />
      <Field label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} error={attempted && form.password !== form.confirm ? 'Passwords do not match' : undefined} />
      <label className="flex gap-3 text-sm text-slate-600"><input type="checkbox" checked={form.terms} onChange={event => setForm({ ...form, terms: event.target.checked })} />I agree to use CareCircle only with appropriate consent.</label>
      <Button className="w-full" disabled={state.isLoading}>{state.isLoading ? 'Creating account…' : 'Create account'}</Button>
    </form>
    <Link to={`/login${location.search}`} className="block text-center mt-6 text-sm text-[#2B6B50]">Back to sign in</Link>
  </AuthShell>
}

export function VerifyEmail() {
  const auth = useAuthStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState(() => sessionStorage.getItem('carecircle-verification-email') ?? '')
  const [cooldown, setCooldown] = useState(0)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (auth.user) navigate(returnPath(location.search, '/onboarding'))
  }, [auth.user, location.search, navigate])
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])
  const resend = async () => {
    setMessage('')
    try {
      await publicApi('/resend-verification', { method: 'POST', body: JSON.stringify({ email }) })
      setCooldown(60)
      setMessage('A new verification link was requested.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'A new link could not be sent')
    }
  }
  const mailUrl = email.endsWith('@gmail.com') ? 'https://mail.google.com' : email.endsWith('@outlook.com') || email.endsWith('@hotmail.com') ? 'https://outlook.live.com/mail/' : `mailto:${email}`
  return <AuthShell title="Check your email" subtitle={`We sent a verification link to ${email || 'your email address'}.`}>
    <Card className="p-5"><p className="text-sm text-slate-600">Open the link to verify this account. This page continues automatically when sign-in completes in this or another tab.</p>{message && <p className="text-sm text-slate-500 mt-3">{message}</p>}<div className="grid grid-cols-2 gap-3 mt-5"><Button disabled={!email.includes('@') || cooldown > 0} onClick={resend}>{cooldown ? `Resend in ${cooldown}s` : 'Resend'}</Button><Button variant="secondary" onClick={() => window.open(mailUrl, '_blank', 'noopener,noreferrer')}>Open my mail</Button></div><button className="w-full text-sm font-semibold text-[#2B6B50] mt-5" onClick={() => { sessionStorage.removeItem('carecircle-verification-email'); setEmail(''); navigate(`/create-account${location.search}`) }}>Change email</button></Card>
  </AuthShell>
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  return <AuthShell title={sent ? 'Reset email requested' : 'Reset password'} subtitle="Enter your email and we’ll send recovery instructions.">
    {sent ? <Card className="p-5"><p className="text-sm text-slate-600">If an account exists, recovery instructions were sent. Follow the link to set a new password.</p></Card> : <div className="space-y-4"><Field label="Email" type="email" value={email} onChange={event => setEmail(event.target.value)} />{error && <p className="text-sm text-rose-600">{error}</p>}<Button className="w-full" disabled={!email.includes('@')} onClick={async () => { const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/set-password` }); if (resetError) setError(resetError.message); else setSent(true) }}>Send recovery email</Button></div>}
    <Link to="/login" className="block text-center mt-6 text-sm text-[#2B6B50]">Back to sign in</Link>
  </AuthShell>
}

export function SetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  return <AuthShell title="Set a new password" subtitle="Choose a new password for your account."><div className="space-y-4"><Field label="New password" type="password" value={password} onChange={event => setPassword(event.target.value)} /><Field label="Confirm password" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} error={confirm && password !== confirm ? 'Passwords do not match' : undefined} />{error && <p className="text-sm text-rose-600">{error}</p>}<Button className="w-full" disabled={password.length < 8 || password !== confirm} onClick={async () => { const { error: updateError } = await supabase.auth.updateUser({ password }); if (updateError) setError(updateError.message); else navigate('/password-success') }}>Update password</Button></div></AuthShell>
}

export function PasswordSuccess() {
  return <AuthShell title="Password updated" subtitle="Your password has been changed."><Link to="/login"><Button className="w-full">Return to sign in</Button></Link></AuthShell>
}

export function Invitation() {
  const { state, actions } = useApp()
  const { status: token = '' } = useParams()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<{
    state: 'sign-in' | 'wrong-account' | 'verified' | 'expired' | 'unavailable'
    inviterName?: string
    circleName?: string
    activeMemberCount?: number
    role?: 'caregiver' | 'view-only'
  } | null>(null)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const auth = useAuthStatus()
  useEffect(() => {
    if (auth.loading) return
    if (!token || token === 'expired' || token === 'active') {
      setInvite({ state: token === 'expired' ? 'expired' : 'unavailable' })
      return
    }
    let current = true
    setInvite(null)
    setError('')
    api<typeof invite>(`/invites/${encodeURIComponent(token)}`).then(result => {
      if (!current) return
      if (!result || !['sign-in', 'wrong-account', 'verified', 'expired', 'unavailable'].includes(result.state)) {
        setError('This invitation could not be checked. Ask the coordinator for help.')
      } else setInvite(result)
    }).catch(() => { if (current) setError('This invitation could not be checked. Ask the coordinator for a new link.') })
    return () => { current = false }
  }, [token, auth.loading, auth.session?.access_token])
  const rememberReturn = () => {
    const path = `/invite/${encodeURIComponent(token)}`
    // Older builds queued automatic acceptance before authentication. Visiting
    // this review flow must require an explicit decision after signing in.
    sessionStorage.removeItem('carecircle-invite-token')
    sessionStorage.setItem('carecircle-return-to', JSON.stringify({ path, action: '' }))
    return `?returnTo=${encodeURIComponent(path)}`
  }
  const status = invite?.state
  return <AuthShell title={status === 'verified' ? `${invite?.inviterName} invited you` : status === 'expired' ? 'Invitation expired' : 'A place in the circle'} subtitle={status === 'verified' ? `Join ${invite?.circleName} and share care together.` : 'Someone has invited you to share care on CareCircle.'}>
    <Card className="cc-invitation-welcome">
      <div className="cc-invitation-welcome-icon" aria-hidden="true"><HeartIcon className="w-5 h-5" /></div>
      {(auth.loading || (!invite && !error)) && <p role="status">Checking your invitation…</p>}
      {error && <p role="alert">{error}</p>}
      {status === 'expired' && <p>Ask the coordinator for a new private invitation link.</p>}
      {status === 'unavailable' && <p>This invitation is no longer available. Ask the coordinator if you still wish to join.</p>}
      {status === 'sign-in' && <><h3>Care is lighter together.</h3><p>Sign in with the email your coordinator invited. You can review the invitation before deciding to join.</p><div className="cc-invitation-welcome-actions"><Button onClick={() => navigate(`/login${rememberReturn()}`)}>Sign in to review</Button><Button variant="secondary" onClick={() => navigate(`/create-account${rememberReturn()}`)}>Create an account</Button></div></>}
      {status === 'wrong-account' && <><h3>Use the invited account</h3><p>The signed-in email doesn’t match this invitation. Sign out and return with the email your coordinator invited.</p><Button className="mt-4" variant="secondary" onClick={() => { rememberReturn(); void actions.signOut() }}>Sign out</Button></>}
      {status === 'verified' && invite && <><h3>A little help makes a difference.</h3><p>{invite.activeMemberCount === 1 ? '1 person is already part of this circle.' : `${invite.activeMemberCount} people are already part of this circle.`} {invite.role === 'view-only' ? 'You have been invited to view permitted updates.' : 'You can help with care tasks and prepare questions for visits.'}</p><p className="cc-invitation-privacy">Only join if you recognise the invitation and have the appropriate consent to share care.</p><div className="cc-invitation-welcome-actions"><Button disabled={accepting || state.isLoading} onClick={async () => { setAccepting(true); setError(''); try { await actions.acceptInvitation(token, true); navigate('/app') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not accept this invitation.') } finally { setAccepting(false) } }}>{accepting ? 'Joining…' : 'Join the circle'}</Button><Button variant="secondary" disabled={accepting} onClick={() => navigate('/')}>Not now</Button></div></>}
    </Card>
  </AuthShell>
}
