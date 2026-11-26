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
  switchWorkspace: () => void
  signOut: () => Promise<void>
}

function signInError(error: AuthError) {
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
  return 'Supabase could not send a sign-in link. Ask your administrator to check the Supabase Auth logs for this attempt.'
}

export function CloudGate({ render }: {render: (options?: CloudControls, openAccount?: () => void) => ReactNode}) {
  const [session, setSession] = useState<Session | null>()
  const [picker, setPicker] = useState(false)
  const [team, setTeam] = useState<Team | null>(null)
  const [demo, setDemo] = useState(false)
  const [workspace, setWorkspace] = useState<{owner:string; team?: string; snapshot:CloudWorkspace} | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
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
        setWorkspace(null)
        setLoadError('')
      }
      setSession(current)
    })
    return () => subscription.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!owner || demo || picker) return
    const controller = new AbortController()
    const request = team ? readTeam(team.id, controller.signal) : readCloud(owner, controller.signal)
    request.then(snapshot => {
      if (!controller.signal.aborted) setWorkspace({owner, team:team?.id, snapshot})
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError('The selected workspace could not be loaded.')
    })
    return () => controller.abort()
  }, [owner, demo, picker, team, attempt])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cloud || sending) return
    setSending(true)
    setNotice('')
    try {
      const {error} = await cloud.auth.signInWithOtp({email:email.trim(), options:{
        shouldCreateUser:false, emailRedirectTo:new URL(import.meta.env.BASE_URL, window.location.origin).href,
      }})
      setNotice(error ? signInError(error) : 'Check your email for the sign-in link. Open it in this browser.')
    } catch {
      setNotice('Unable to request a sign-in link. Try again when you’re online.')
    } finally { setSending(false) }
  }

  function openWorkspace(next: Team | null) {
    setWorkspace(null)
    setLoadError('')
    setTeam(next)
    setPicker(false)
  }

  if (!cloud) return render()
  if (demo) return render(undefined, () => {setDemo(false);setLoadError('');setWorkspace(null)})
  if (owner && picker) return <TeamPicker owner={owner} openPrivate={() => openWorkspace(null)} openTeam={openWorkspace} />
  if (owner && workspace?.owner === owner && workspace.team === team?.id && session) return render({
    owner,
    email:session.user.email ?? 'Signed in',
    initial:workspace.snapshot,
    team:team ?? undefined,
    switchWorkspace:() => setPicker(true),
    save:(data, revision) => team ? saveTeam(team.id, data, revision) : writeCloud(owner, data, revision),
    async signOut() {
      const {error} = await cloud!.auth.signOut({scope:'local'})
      if (error) throw error
      setWorkspace(null)
      setLoadError('')
    },
  })

  return <main className="account-gate"><section className="panel dev-card assistant-panel">
    <h1>Kasel OS</h1>
    {session === undefined || owner ? <>
      <p className="dev-muted" role="status">{loadError || 'Loading workspace…'}</p>
      {owner && <button className="text-button gate-demo" onClick={() => setPicker(true)}>Choose workspace</button>}
      {loadError && <button className="primary" onClick={() => {setLoadError('');setAttempt(current => current + 1)}}>Retry load</button>}
    </> : <form onSubmit={signIn}>
      <h2>Sign in to your private workspace</h2>
      <label>Email<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <button className="primary" disabled={sending}>{sending ? 'Sending…' : 'Send sign-in link'}</button>
      {notice && <p role="status" className="dev-muted">{notice}</p>}
    </form>}
    <button className="text-button gate-demo" onClick={() => setDemo(true)}>Open browser demo</button>
    {owner && <button className="text-button gate-demo" onClick={() => void cloud?.auth.signOut({scope:'local'})}>Sign out</button>}
  </section></main>
}
