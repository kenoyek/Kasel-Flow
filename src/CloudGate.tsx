import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cloud, readCloud, writeCloud, type CloudWorkspace } from './cloud-workspace'
import type { Workspace } from './data'

export type CloudControls = {
  owner: string
  email: string
  initial: CloudWorkspace
  save: (workspace: Workspace, revision: number) => Promise<number>
  signOut: () => Promise<void>
}

export function CloudGate({ render }: {render: (options?: CloudControls, openAccount?: () => void) => ReactNode}) {
  const [session, setSession] = useState<Session | null>()
  const [demo, setDemo] = useState(false)
  const [workspace, setWorkspace] = useState<{owner:string; snapshot:CloudWorkspace} | null>(null)
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
        setWorkspace(null)
        setLoadError('')
      }
      setSession(current)
    })
    return () => subscription.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!owner || demo) return
    const controller = new AbortController()
    readCloud(owner, controller.signal).then(snapshot => {
      if (!controller.signal.aborted) setWorkspace({owner, snapshot})
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError('The private workspace could not be loaded.')
    })
    return () => controller.abort()
  }, [owner, demo, attempt])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cloud || sending) return
    setSending(true)
    setNotice('')
    try {
      const {error} = await cloud.auth.signInWithOtp({email:email.trim(), options:{
        shouldCreateUser:false, emailRedirectTo:new URL(import.meta.env.BASE_URL, window.location.origin).href,
      }})
      setNotice(error ? 'Could not send a sign-in link. Check that your account is provisioned and try again.' : 'Check your email for the sign-in link. Open it in this browser.')
    } catch {
      setNotice('Unable to request a sign-in link. Try again when you’re online.')
    } finally { setSending(false) }
  }

  if (!cloud) return render()
  if (demo) return render(undefined, () => {setDemo(false);setLoadError('');setWorkspace(null)})
  if (owner && workspace?.owner === owner && session) return render({
    owner,
    email:session.user.email ?? 'Signed in',
    initial:workspace.snapshot,
    save:(data, revision) => writeCloud(owner, data, revision),
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
      <p className="dev-muted" role="status">{loadError || 'Loading your private workspace…'}</p>
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
