import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { cloud } from './cloud-workspace'

export function InviteSignup({invite, close, useSignIn}: {
  invite: string
  close: () => void
  useSignIn: () => void
}) {
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [complete,setComplete] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !cloud) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const email = String(fields.get('email') ?? '').trim().toLowerCase()
    const password = String(fields.get('password') ?? '')
    if (password !== fields.get('confirm')) {
      setMessage('Passwords do not match.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const validation = await cloud.rpc('valid_team_signup_invitation',{invitation:invite,recipient:email})
      if (validation.error) {
        setMessage(validation.error.code === 'PGRST202'
          ? 'Invitation account setup is unavailable. Ask your team owner to finish the Supabase setup.'
          : 'Could not check the invitation. Try again.')
        return
      }
      if (validation.data !== true) {
        setMessage('This invitation is unavailable for that email. Use the invited email or ask the team owner for a fresh link.')
        return
      }
      const {data,error} = await cloud.auth.signUp({email,password,options:{
        data:{kasel_invite:invite},
        emailRedirectTo:new URL(import.meta.env.BASE_URL,window.location.origin).href,
      }})
      if (error) {
        if (error.status === 429) setMessage('Too many email requests. Wait before trying again, or sign in if you already have an account.')
        else if (error.code === 'weak_password') setMessage('Choose a stronger password and try again.')
        else if (error.code === 'user_already_exists') setMessage('This email already has an account. Use Sign in instead.')
        else setMessage('Could not set up the account. Try again or ask the team owner to check Supabase Auth.')
        return
      }
      form.reset()
      setComplete(true)
      if (data.session) return
      setMessage('If this is a new account, check your email and open the confirmation link in this browser. Already registered? Use Sign in instead.')
    } catch {
      setMessage('Could not reach Supabase. Check your connection and try again.')
    } finally {setBusy(false)}
  }

  return <dialog ref={node => {if (node && !node.open) node.showModal()}} onCancel={close} aria-labelledby="invite-signup-title">
    <form onSubmit={submit}>
      <div className="dialog-heading"><h2 id="invite-signup-title">Set up your team account</h2>
        <button className="icon-button" type="button" aria-label="Close account setup" onClick={close}><X size={20} /></button>
      </div>
      {!complete && <>
        <p className="dev-muted">Use the email address your team invited.</p>
        <label>Email<input type="email" name="email" autoComplete="username" required autoFocus /></label>
        <label>Choose a password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
        <label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={8} required /></label>
        <div className="dialog-actions"><button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button></div>
      </>}
      {message && <p className="dev-muted" role="status">{message}</p>}
      <button className="text-button gate-demo" type="button" onClick={useSignIn}>Already have an account? Sign in</button>
    </form>
  </dialog>
}
