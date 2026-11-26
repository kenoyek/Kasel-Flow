import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { cloud, readCloud, writeCloud, type CloudWorkspace } from './cloud-workspace'
import { TeamPicker } from './TeamPicker'
import { readTeam, saveTeam, type Team } from './team-workspace'
import type { Workspace } from './data'

export type CloudControls = {
  owner: string
  email: string
  initial: CloudWorkspace
  save: (workspace: Workspace, revision: number) => Promise<number>
  team?: Team
  switchWorkspace: (focusInvites?: boolean) => void
  signOut: () => Promise<void>
  setPassword: (password: string) => Promise<void>
}

function signInError(error: AuthError, method: 'link' | 'password') {
  if (error.code === 'over_email_send_rate_limit') {
    return 'Supabase has reached its email sending limit. Wait before requesting another link. If this continues, ask your administrator to check email rate limits and SMTP settings in Supabase.'
  }
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Too many sign-in requests. Wait at least a minute before trying again.'
  }
  if (error.code === 'email_address_not_authorized') {
    return 'Supabase cannot send email to this address with the current mail settings. Ask your administrator to check the email provider settings.'
  }
  if (error.code === 'otp_disabled' || error.code === 'email_provider_disabled') {
    return 'Email sign-in is disabled in Supabase. Ask your administrator to enable it.'
  }
  if (error.code === 'signup_disabled' || error.code === 'user_not_found' || error.code === 'email_not_confirmed') {
    return 'Use the verified email for your existing Kasel OS account. Ask your administrator to check your account in Supabase if this continues.'
  }
  if (error.status === 0 || (error.name === 'AuthRetryableFetchError' && !error.status)) {
    return 'Could not reach Supabase. Check your connection and try again.'
  }
  return method === 'link'
    ? 'Supabase could not send a sign-in link. Ask your administrator to check the Supabase Auth logs for this attempt.'
    : 'Supabase could not sign you in. Ask your administrator to check the Supabase Auth logs for this attempt.'
}

export function CloudGate({ render }: {render: (options?: CloudControls, openAccount?: () => void) => ReactNode}) {
  const [session, setSession] = useState<Session | null>()
  const [picker, setPicker] = useState<false | 'teams' | 'invitations'>(false)
  const [team, setTeam] = useState<Team | null>(null)
  const [demo, setDemo] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const inDemo = session === null || (demo && !(signInOpen && session?.user.id))
  const [workspace, setWorkspace] = useState<{owner:string; team?: string; snapshot:CloudWorkspace} | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [method, setMethod] = useState<'link' | 'password'>('password')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const owner = session?.user.id

  useEffect(() => {
    if (!cloud) return
    const subscription = cloud.auth.onAuthStateChange((event, current) => {
      if (event === 'SIGNED_OUT') {
        setTeam(null)
        setPicker(false)
        setSignInOpen(false)
        setWorkspace(null)
        setLoadError('')
      }
      setSession(current)
    })
    return () => subscription.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!owner || inDemo || picker) return
    const controller = new AbortController()
    const request = team ? readTeam(team.id, controller.signal) : readCloud(owner, controller.signal)
    request.then(snapshot => {
      if (!controller.signal.aborted) setWorkspace({owner, team:team?.id, snapshot})
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError('The selected workspace could not be loaded.')
    })
    return () => controller.abort()
  }, [owner, inDemo, picker, team, attempt])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cloud || sending) return
    const values = new FormData(event.currentTarget)
    const password = String(values.get('password') ?? '')
    setSending(true)
    setNotice('')
    try {
      if (method === 'password') {
        const {error} = await cloud.auth.signInWithPassword({email:email.trim(),password})
        if (error) {
          setNotice(error.code === 'invalid_credentials'
            ? 'Email or password is incorrect. If your account has never had a password, use a sign-in link first.'
            : signInError(error, method))
        } else {
          setDemo(false)
          setSignInOpen(false)
        }
        return
      }
      const {error} = await cloud.auth.signInWithOtp({email:email.trim(), options:{
        shouldCreateUser:false, emailRedirectTo:new URL(import.meta.env.BASE_URL, window.location.origin).href,
      }})
      setNotice(error ? signInError(error, method) : 'Check your email for the sign-in link. Open it in this browser.')
    } catch {
      setNotice('Unable to reach Supabase. Try again when you’re online.')
    } finally { setSending(false) }
  }

  function openWorkspace(next: Team | null) {
    setWorkspace(null)
    setLoadError('')
    setTeam(next)
    setPicker(false)
  }

  function signInForm(close: () => void) {
    return <form onSubmit={signIn}>
      <div className="dialog-heading">
        <h2 id="sign-in-heading">Sign in to your private workspace</h2>
        <button className="icon-button" type="button" aria-label="Close sign-in" onClick={close}><X size={20} /></button>
      </div>
      <label>Email<input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label>
      {method === 'password' && <div className="sign-in-password">
        <label htmlFor="sign-in-password">Password</label>
        <div>
          <input id="sign-in-password" required name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" />
          <button className="text-button" type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide password' : 'Show password'}</button>
        </div>
      </div>}
      <div className="creative-actions">
        <button className="primary" disabled={sending}>{method === 'link' ? sending ? 'Sending…' : 'Send sign-in link' : sending ? 'Signing in…' : 'Sign in with password'}</button>
        <button type="button" className="text-button" disabled={sending} onClick={() => {
          setMethod(method === 'link' ? 'password' : 'link')
          setShowPassword(false)
          setNotice('')
        }}>{method === 'link' ? 'Use a password' : 'Use a sign-in link'}</button>
      </div>
      {notice && <p role="status" className="dev-muted">{notice}</p>}
    </form>
  }

  if (!cloud) return render()
  if (inDemo) return <>
    {render(undefined, () => {
      if (owner) {
        setDemo(false)
        setLoadError('')
        return
      }
      setNotice('')
      setShowPassword(false)
      setSignInOpen(true)
    })}
    {signInOpen && <dialog
      ref={node => {if (node && !node.open) node.showModal()}}
      onCancel={() => setSignInOpen(false)}
      aria-labelledby="sign-in-heading">
      {signInForm(() => setSignInOpen(false))}
    </dialog>}
  </>
  if (owner && picker) return <TeamPicker owner={owner} focusInvites={picker === 'invitations'} openPrivate={() => openWorkspace(null)} openTeam={openWorkspace} />
  if (owner && workspace?.owner === owner && workspace.team === team?.id && session) return render({
    owner,
    email:session.user.email ?? 'Signed in',
    initial:workspace.snapshot,
    team:team ?? undefined,
    switchWorkspace:focusInvites => setPicker(focusInvites ? 'invitations' : 'teams'),
    save:(data, revision) => team ? saveTeam(team.id, data, revision) : writeCloud(owner, data, revision),
    async setPassword(password) {
      const {error} = await cloud!.auth.updateUser({password})
      if (error) {
        if (error.code === 'reauthentication_needed') throw new Error('Sign in again before setting a password.')
        if (error.code === 'weak_password') throw new Error('Choose a stronger password that meets your workspace password policy.')
        throw new Error('Could not update your password. Try again or check your Supabase Auth settings.')
      }
    },
    async signOut() {
      const {error} = await cloud!.auth.signOut({scope:'local'})
      if (error) throw error
      setWorkspace(null)
      setLoadError('')
    },
  })

  return <main className="account-gate"><section className="panel dev-card assistant-panel">
    <h1>Kasel OS</h1>
    <p className="dev-muted" role="status">{loadError || 'Loading workspace…'}</p>
    {owner && <button className="text-button gate-demo" onClick={() => setPicker('teams')}>Choose workspace</button>}
    {loadError && <button className="primary" onClick={() => {setLoadError('');setAttempt(current => current + 1)}}>Retry load</button>}
    <button className="text-button gate-demo" onClick={() => {setSignInOpen(false);setDemo(true)}}>Open browser demo</button>
    {owner && <button className="text-button gate-demo" onClick={() => void cloud?.auth.signOut({scope:'local'})}>Sign out</button>}
  </section></main>
}
