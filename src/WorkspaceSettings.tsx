import { useEffect, useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, RefreshCw, Smartphone } from 'lucide-react'
import type { Workspace } from './data'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>
}

export function useAppInstallation() {
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [updating, setUpdating] = useState(false)

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
    let hadController = Boolean(workers?.controller)
    let disposed = false
    const onControl = () => {
      setOfflineReady(Boolean(workers.controller))
      if (hadController && workers.controller) window.location.reload()
      hadController = Boolean(workers.controller)
    }
    const onState = () => setWaiting(registration?.waiting ?? null)
    const onUpdate = () => {
      installing?.removeEventListener('statechange', onState)
      installing = registration?.installing ?? null
      installing?.addEventListener('statechange', onState)
      onState()
    }
    if (import.meta.env.PROD && workers && !Capacitor.isNativePlatform()) {
      workers.addEventListener('controllerchange', onControl)
      workers.register(import.meta.env.BASE_URL + 'sw.js').then(value => {
        if (disposed) return
        registration = value
        registration.addEventListener('updatefound', onUpdate)
        setOfflineReady(Boolean(workers.controller))
        onUpdate()
      }).catch(() => setOfflineReady(false))
    }
    return () => {
      disposed = true
      window.removeEventListener('beforeinstallprompt', onInstall)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('online', connectivity)
      window.removeEventListener('offline', connectivity)
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

  function activateUpdate() {
    if (!waiting) return
    setUpdating(true)
    waiting.postMessage('ACTIVATE_UPDATE')
  }

  return {canInstall:Boolean(install), waiting:Boolean(waiting), offlineReady, offline, updating, promptInstall, activateUpdate}
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
      {installation.waiting && <button className="secondary" disabled={installation.updating} onClick={installation.activateUpdate}>
        <RefreshCw size={16} /> {installation.updating ? 'Updating…' : 'Apply available update'}
      </button>}
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
      setStatus('Password saved. You can use it on your next sign-in.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to set your password.')
    } finally {setBusy(false)}
  }

  return <section className="panel dev-card assistant-panel">
    <h2>{recovery ? 'Choose a new password' : 'Set a sign-in password'}</h2>
    <p className="dev-muted">{recovery ? 'Save a new password to continue to your workspace.' : 'Use a password for future sign-ins without requesting a link.'}</p>
    <form onSubmit={save}>
      <label>New password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={8} required /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      {status && <p className="dev-muted" role="status">{status}</p>}
    </form>
  </section>
}
