import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, Smartphone } from 'lucide-react'
import type { Workspace } from './data'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>
}

export function useAppInstallation(blockReload: boolean) {
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [updatePending, setUpdatePending] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const applyRelease = useRef<() => void>(() => {})
  const blocked = useRef(blockReload)
  useEffect(() => {
    blocked.current = blockReload
    applyRelease.current()
  }, [blockReload])

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstall(event as InstallEvent)
    }
    const onInstalled = () => setInstall(null)
    const connectivity = () => setOffline(!navigator.onLine)
    window.addEventListener('beforeinstallprompt', onInstall)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('online', connectivity)
    window.addEventListener('offline', connectivity)

    const workers = navigator.serviceWorker
    let registration: ServiceWorkerRegistration | undefined
    let installing: ServiceWorker | null = null
    let controller = workers?.controller
    let reloadPending = false
    let activating: ServiceWorker | null = null
    let disposed = false
    const apply = () => {
      if (disposed || blocked.current || !navigator.onLine || document.hidden || document.querySelector('dialog[open], [data-defer-app-update="true"]')) return
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable]')) return
      if (reloadPending) {
        window.location.reload()
      } else if (registration?.waiting && registration.waiting !== activating) {
        activating = registration.waiting
        activating.postMessage('ACTIVATE_UPDATE')
      }
    }
    applyRelease.current = apply
    const onControl = () => {
      const next = workers.controller
      setOfflineReady(Boolean(next))
      if (controller && next && controller !== next) reloadPending = true
      controller = next
      setUpdatePending(reloadPending || Boolean(registration?.waiting))
      apply()
    }
    const onState = () => {
      setUpdatePending(reloadPending || Boolean(registration?.waiting))
      apply()
    }
    const onBlur = () => window.setTimeout(apply, 0)
    const check = () => {
      if (navigator.onLine && !document.hidden) void registration?.update().catch(() => {})
      apply()
    }
    const onUpdate = () => {
      installing?.removeEventListener('statechange', onState)
      installing = registration?.installing ?? null
      installing?.addEventListener('statechange', onState)
      onState()
    }
    let timer: number | undefined
    if (import.meta.env.PROD && workers && !Capacitor.isNativePlatform()) {
      workers.addEventListener('controllerchange', onControl)
      window.addEventListener('focus', check)
      window.addEventListener('online', check)
      document.addEventListener('visibilitychange', check)
      document.addEventListener('focusout', onBlur)
      timer = window.setInterval(check, 60_000)
      workers.register(import.meta.env.BASE_URL + 'sw.js', {updateViaCache:'none'}).then(value => {
        if (disposed) return
        registration = value
        registration.addEventListener('updatefound', onUpdate)
        setOfflineReady(Boolean(workers.controller))
        onUpdate()
        check()
      }).catch(() => setOfflineReady(false))
    }
    return () => {
      disposed = true
      window.removeEventListener('beforeinstallprompt', onInstall)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('online', connectivity)
      window.removeEventListener('offline', connectivity)
      applyRelease.current = () => {}
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', check)
      document.removeEventListener('focusout', onBlur)
      workers?.removeEventListener('controllerchange', onControl)
      registration?.removeEventListener('updatefound', onUpdate)
      installing?.removeEventListener('statechange', onState)
    }
  }, [])

  async function promptInstall() {
    if (!install) return
    setInstall(null)
    await install.prompt()
    await install.userChoice
  }

  return {canInstall:Boolean(install), updatePending, offlineReady, offline, promptInstall}
}

export function WorkspaceSettings({data, installation, privateWorkspace}: {data: Workspace; privateWorkspace: boolean; installation: ReturnType<typeof useAppInstallation>}) {
  function exportWorkspace() {
    const exportedAt = new Date().toISOString()
    const file = new Blob([JSON.stringify({format:'kasel-os-workspace',version:1,exportedAt,workspace:data}, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'kasel-workspace-' + exportedAt.slice(0,10) + '.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="assistant-grid">
    <section className="panel dev-card assistant-panel">
      <h2><Smartphone size={17} /> App installation</h2>
      <p className="dev-muted">{installation.offline ? 'You’re offline.' : installation.offlineReady ? 'Offline startup is ready on this device.' : 'Offline startup becomes available after the production web app finishes caching.'}</p>
      {installation.canInstall ? <button className="primary" onClick={() => void installation.promptInstall()}>Install Kasel OS</button> :
        <p className="dev-muted">To install the web app, use your browser’s install or Add to Home Screen option when available.</p>}
      {installation.updatePending && <p className="dev-muted" role="status">An app update will apply automatically when you finish editing.</p>}
    </section>
    <section className="panel dev-card assistant-panel">
      <h2><Download size={17} /> Workspace export</h2>
      <p className="dev-muted">{privateWorkspace ? 'Download the open workspace, including unsaved changes, as a versioned JSON file.' : 'Download the records saved in this browser as a versioned JSON file.'} The file can include client and financial information.</p>
      <button className="primary" onClick={exportWorkspace}>Export workspace JSON</button>
    </section>
  </div>
}


export function PasswordSettings({setPassword,recovery = false}: {setPassword: (password: string) => Promise<void>; recovery?: boolean}) {
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(false)
  const [status, setStatus] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const password = String(values.get('password') ?? '')
    if (password !== values.get('confirm')) {
      setStatus('Passwords do not match.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      await setPassword(password)
      form.reset()
      setDraft(false)
      setStatus('Password saved. You can use it on your next sign-in.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to set your password.')
    } finally {setBusy(false)}
  }

  return <section className="panel dev-card assistant-panel">
    <h2>{recovery ? 'Choose a new password' : 'Set a sign-in password'}</h2>
    <p className="dev-muted">{recovery ? 'Save a new password to continue to your workspace.' : 'Use a password for future sign-ins without requesting a link.'}</p>
    <form onSubmit={save} data-defer-app-update={busy || draft} onInput={event => {
      const values = new FormData(event.currentTarget)
      setDraft(Boolean(values.get('password') || values.get('confirm')))
    }}>
      <label>New password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={8} required /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      {status && <p className="dev-muted" role="status">{status}</p>}
    </form>
  </section>
}

export function DisplayNameSettings({current,saveName}: {current:string;saveName:(value:string)=>Promise<void>}) {
  const [value,setValue] = useState(current)
  const [busy,setBusy] = useState(false)
  const [status,setStatus] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus('')
    try {
      await saveName(value.trim())
      setValue(value.trim())
      setStatus(value.trim() ? 'Display name saved.' : 'Display name cleared. Chat will show your email.')
    } catch {
      setStatus('Could not save your display name. Try again.')
    } finally {setBusy(false)}
  }

  return <section className="panel dev-card assistant-panel">
    <h2>Display name</h2>
    <p className="dev-muted">Show your name alongside your email in team chat.</p>
    <form onSubmit={submit} data-defer-app-update={busy || value.trim() !== current}>
      <label>Display name<input name="displayName" autoComplete="name" maxLength={80} value={value} disabled={busy} onChange={event => setValue(event.target.value)} /></label>
      <button className="primary" disabled={busy || value.trim() === current}>{busy ? 'Saving…' : 'Save display name'}</button>
      {status && <p className="dev-muted" role="status">{status}</p>}
    </form>
  </section>
}
