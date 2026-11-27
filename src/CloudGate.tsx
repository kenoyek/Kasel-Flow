import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { cloud, readCloud, writeCloud, type CloudWorkspace } from './cloud-workspace'
import { InviteSignup } from './InviteSignup'
import { PasswordSettings } from './WorkspaceSettings'
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

const recoveryKey = 'kasel-password-recovery-user'

function recoveryOwner() {
  try {return sessionStorage.getItem(recoveryKey) ?? ''}
  catch {return ''}
}

function rememberRecovery(owner: string) {
  try {
    if (owner) sessionStorage.setItem(recoveryKey,owner)
    else sessionStorage.removeItem(recoveryKey)
  } catch { /* Recovery still works for this page. */ }
}

export function CloudGate({ render }: {render: (options?: CloudControls, openAccount?: () => void) => ReactNode}) {
  const [recovery, setRecovery] = useState(recoveryOwner)
  const [recoveryError,setRecoveryError] = useState('')
  const [session, setSession] = useState<Session | null>()
  const [access, setAccess] = useState<{owner: string; allowed: boolean; missing?: boolean} | null>(null)
  const [picker, setPicker] = useState<false | 'teams' | 'invitations'>(false)
  const [team, setTeam] = useState<Team | null>(null)
  const [demo, setDemo] = useState(false)
  const [invite, setInvite] = useState(() => {
    const token = new URLSearchParams(location.search).get('invite') ?? ''
    return /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(token) ? token : ''
  })
  const [showSignup, setShowSignup] = useState(Boolean(invite))
  const [signInOpen, setSignInOpen] = useState(false)
  const inDemo = session === null || (demo && !(signInOpen && session?.user.id))
  const [workspace, setWorkspace] = useState<{owner:string; team?: string; snapshot:CloudWorkspace} | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [method, setMethod] = useState<'link' | 'password' | 'recovery'>('password')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const owner = session?.user.id
  const recovering = Boolean(owner && recovery === owner)
  const resolvedAccess = owner && access?.owner === owner ? access : null
  const teamOnly = resolvedAccess?.allowed === false
  const privateAllowed = resolvedAccess?.allowed === true

  useEffect(() => {
    if (!cloud) return
    const subscription = cloud.auth.onAuthStateChange((event, current) => {
      if (event === 'PASSWORD_RECOVERY' && current) {
        setRecovery(current.user.id)
        rememberRecovery(current.user.id)
        setDemo(false)
        setSignInOpen(false)
      }
      if (event === 'SIGNED_OUT') {
        setRecovery('')
        rememberRecovery('')
        setAccess(null)
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
    if (!cloud || !owner || inDemo || recovering) return
    const controller = new AbortController()
    void cloud.rpc('can_use_private_workspace').abortSignal(controller.signal).then(({data,error}) => {
      if (controller.signal.aborted) return
      if (error?.code === 'PGRST202') {
        setAccess({owner, allowed:false, missing:true})
      } else if (error || typeof data !== 'boolean') {
        setLoadError('Could not check workspace access. Try loading again.')
      } else {
        setAccess({owner, allowed:data})
      }
    })
    return () => controller.abort()
  }, [owner, inDemo, attempt, recovering])

  useEffect(() => {
    if (!owner || inDemo || recovering || picker || (!team && (!privateAllowed || invite))) return
    const controller = new AbortController()
    const request = team ? readTeam(team.id, controller.signal) : readCloud(owner, controller.signal)
    request.then(snapshot => {
      if (!controller.signal.aborted) setWorkspace({owner, team:team?.id, snapshot})
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError('The selected workspace could not be loaded.')
    })
    return () => controller.abort()
  }, [owner, inDemo, picker, team, attempt, privateAllowed, invite, recovering])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cloud || sending) return
    const values = new FormData(event.currentTarget)
    const password = String(values.get('password') ?? '')
    setSending(true)
    setNotice('')
    try {
      if (method === 'recovery') {
        const {error} = await cloud.auth.resetPasswordForEmail(email.trim(),{
          redirectTo:new URL(import.meta.env.BASE_URL,window.location.origin).href,
        })
        if (!error || error.code === 'user_not_found' || error.code === 'email_not_confirmed') {
          setNotice('If this email has an account, check your inbox for a reset link. Open it in this browser.')
        } else if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
          setNotice('Too many email requests. Wait before requesting another reset link.')
        } else {
          setNotice('Could not request a reset link. Ask your administrator to check Supabase Auth email delivery.')
        }
        return
      }
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

  async function signOut() {
    const {error} = await cloud!.auth.signOut({scope:'local'})
    if (error) throw error
    setWorkspace(null)
    setLoadError('')
  }

  async function setPassword(password: string) {
    const {error} = await cloud!.auth.updateUser({password})
    if (error) {
      if (error.code === 'reauthentication_needed') throw new Error('Sign in again before setting a password.')
      if (error.code === 'weak_password') throw new Error('Choose a stronger password that meets your workspace password policy.')
      if (error.code === 'same_password') throw new Error('Choose a password you have not used for this account.')
      throw new Error('Could not update your password. Try again or check your Supabase Auth settings.')
    }
  }

  function clearInvite() {
    setInvite('')
    setShowSignup(false)
    const url = new URL(location.href)
    url.searchParams.delete('invite')
    history.replaceState(history.state, '', url)
  }

  function openWorkspace(next: Team | null) {
    if (invite) clearInvite()
    setWorkspace(null)
    setLoadError('')
    setTeam(next)
    setPicker(false)
  }

  function signInForm(close: () => void) {
    return <form onSubmit={signIn}>
      <div className="dialog-heading">
        <h2 id="sign-in-heading">{method === 'recovery' ? 'Reset your password' : 'Sign in to your private workspace'}</h2>
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
        <button className="primary" disabled={sending}>{method === 'password' ? (sending ? 'Signing in…' : 'Sign in with password') :
          sending ? 'Sending…' : method === 'recovery' ? 'Send reset link' : 'Send sign-in link'}</button>
        <button type="button" className="text-button" disabled={sending} onClick={() => {
          setMethod(method === 'link' ? 'password' : 'link')
          setShowPassword(false)
          setNotice('')
        }}>{method === 'recovery' ? 'Back to sign in' : method === 'link' ? 'Use a password' : 'Use a sign-in link'}</button>
        {method === 'password' && <button type="button" className="text-button" disabled={sending} onClick={() => {
          setMethod('recovery')
          setShowPassword(false)
          setNotice('')
        }}>Forgot password?</button>}
      </div>
      {notice && <p role="status" className="dev-muted">{notice}</p>}
    </form>
  }

  if (!cloud) return render()
  if (recovering) return <main className="account-gate">
    <div className="recovery-panel">
      <PasswordSettings recovery setPassword={async password => {
        await setPassword(password)
        rememberRecovery('')
        setRecovery('')
      }} />
      <button className="text-button gate-demo" onClick={() => {
        void signOut().catch(() => setRecoveryError('Could not sign out. Try again.'))
      }}>Cancel and sign out</button>
      {recoveryError && <p role="alert" className="dev-muted">{recoveryError}</p>}
    </div>
  </main>
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
    {showSignup && invite && <InviteSignup invite={invite} close={clearInvite} useSignIn={() => {
      setShowSignup(false)
      setSignInOpen(true)
    }} />}
    {signInOpen && !showSignup && <dialog
      ref={node => {if (node && !node.open) node.showModal()}}
      onCancel={() => setSignInOpen(false)}
      aria-labelledby="sign-in-heading">
      {signInForm(() => setSignInOpen(false))}
    </dialog>}
  </>
  if (owner && (picker || ((teamOnly || invite) && !team))) {
    return <TeamPicker owner={owner} focusInvites={picker === 'invitations' || Boolean(invite)} openTeam={openWorkspace}
      openPrivate={privateAllowed ? () => openWorkspace(null) : undefined}
      accessPending={resolvedAccess?.missing === true} onSignOut={signOut} />
  }
  if (owner && workspace?.owner === owner && workspace.team === team?.id && (team || privateAllowed) && session) return render({
    owner,
    email:session.user.email ?? 'Signed in',
    initial:workspace.snapshot,
    team:team ?? undefined,
    switchWorkspace:focusInvites => setPicker(focusInvites ? 'invitations' : 'teams'),
    save:(data, revision) => team ? saveTeam(team.id, data, revision) : writeCloud(owner, data, revision),
    setPassword,
    signOut,
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
