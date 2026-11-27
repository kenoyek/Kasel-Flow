import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ClipboardList, FileText, Sparkles } from 'lucide-react'
import { draftTasks, reports, reportWorkspace, type Report, type ReportResult } from './assistant-data'
import type { Task, Workspace } from './data'

type Props = { data: Workspace; today: string; update: Dispatch<SetStateAction<Workspace>>; allowModel: boolean }

export function Assistant({data, today, update, allowModel}: Props) {
  const [report, setReport] = useState<Report>('reviews')
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? '')
  const [bugProject, setBugProject] = useState('')
  const [month, setMonth] = useState(today.slice(0,7))
  const [result, setResult] = useState<ReportResult | null>(null)
  const [brief, setBrief] = useState('')
  const [drafts, setDrafts] = useState<string[]>([])
  const [destination, setDestination] = useState(data.projects[0]?.id ?? '')
  const [taskMessage, setTaskMessage] = useState('')
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [draft, setDraft] = useState('')
  const [modelError, setModelError] = useState('')
  const [running, setRunning] = useState(false)
  const localModel = allowModel && import.meta.env.DEV && ['localhost','127.0.0.1','[::1]'].includes(location.hostname)

  function runReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const snapshot = reportWorkspace(data, report, today, report === 'bugs' ? bugProject : projectId, month)
    setResult(snapshot)
    update(previous => ({...previous, automation:{
      ...previous.automation, runs:[{report, result:snapshot, at:new Date().toISOString()}, ...previous.automation.runs].slice(0,10),
    }}))
  }

  function createTasks() {
    const project = data.projects.find(item => item.id === destination)
    if (!project) return
    const titles = [...new Set(drafts.map(title => title.trim()).filter(Boolean))]
    if (!titles.length) return
    const items: Task[] = titles.map(title => ({id:crypto.randomUUID(), title, project:project.id, status:'To do', due:''}))
    update(previous => ({...previous, tasks:[...previous.tasks,...items]}))
    setDrafts([])
    setBrief('')
    setTaskMessage(`Created ${items.length} ${items.length === 1 ? 'task' : 'tasks'} in ${project.name}.`)
  }

  async function modelDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running || !prompt.trim()) return
    setRunning(true)
    setDraft('')
    setModelError('')
    try {
      const response = await fetch('/api/local-assistant', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt, context}), signal:AbortSignal.timeout(25_000),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Drafting failed.')
      setDraft(payload.text)
    } catch (error) {
      setModelError(error instanceof TypeError || error instanceof SyntaxError ? 'The local assistant service is unavailable.' : error instanceof Error ? error.message : 'Drafting failed.')
    } finally {
      setRunning(false)
    }
  }

  return <div className="assistant-grid" data-defer-app-update={Boolean(brief || drafts.length)}>
    <section className="panel dev-card assistant-panel">
      <h2><FileText size={17} /> Workspace reports</h2>
      <form onSubmit={runReport}>
        <label>Report<select value={report} onChange={event => setReport(event.target.value as Report)}>{Object.entries(reports).map(([key,name]) => <option value={key} key={key}>{name}</option>)}</select></label>
        {report === 'project' && <label>Project<select required value={projectId} onChange={event => setProjectId(event.target.value)}>
          <option value="">Select a project</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>}
        {report === 'bugs' && <label>Product<select value={bugProject} onChange={event => setBugProject(event.target.value)}>
          <option value="">All products</option>{data.projects.filter(project => project.department === 'Development').map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>}
        {report === 'social' && <label>Publication month<input required type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>}
        <button className="primary">Run report</button>
      </form>
      {result && <div className="assistant-output" aria-live="polite"><h3>{result.title}</h3><p>{result.summary}</p>
        {result.lines.length > 0 && <ul>{result.lines.map((line,index) => <li key={index}>{line}</li>)}</ul>}
        {localModel && report !== 'invoices' && result.title !== reports.invoices && <button className="text-button" onClick={() => setContext([result.title,result.summary,...result.lines].join('\n').slice(0,6000))}>Add report to model draft context</button>}
      </div>}
      {data.automation.runs.length > 0 && <details className="creative-history"><summary>Recent report runs</summary>
        <ol>{data.automation.runs.map((run,index) => <li key={index}>
          <button className="text-button" onClick={() => setResult(run.result)}>{run.result.title}</button> · <time dateTime={run.at}>{run.at.slice(0,10)}</time>
        </li>)}</ol>
      </details>}
    </section>
    <section className="panel dev-card assistant-panel">
      <h2><ClipboardList size={17} /> Draft tasks</h2>
      <form onSubmit={event => {event.preventDefault();setDrafts(draftTasks(brief));setTaskMessage('')}}>
        <label>Brief items, one per line<textarea value={brief} onChange={event => setBrief(event.target.value)} maxLength={4000} rows={4} required /></label>
        <button className="primary">Preview tasks</button>
      </form>
      {drafts.length > 0 && <div className="assistant-output">
        {drafts.map((title,index) => <label key={index}>Task {index + 1}<input value={title} maxLength={100} onChange={event => setDrafts(previous => previous.map((value,i) => i === index ? event.target.value : value))} /></label>)}
        <label>Destination project<select value={destination} onChange={event => setDestination(event.target.value)}>
          <option value="">Select a project</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        <button className="primary" type="button" disabled={!destination || !drafts.some(title => title.trim())} onClick={createTasks}>Confirm and create tasks</button>
      </div>}
      {taskMessage && <p className="assistant-output" role="status">{taskMessage}</p>}
    </section>
    <section className="panel dev-card assistant-panel">
      <h2>Review reminders</h2>
      <label className="business-checkbox"><input type="checkbox" checked={data.automation.reminders} onChange={event => {
        const reminders = event.target.checked
        update(previous => ({...previous, automation:{...previous.automation, reminders}}))
      }} /> Show creative and client review reminders in Notifications</label>
    </section>
    <section className="panel dev-card assistant-panel">
      <h2><Sparkles size={17} /> OpenRouter drafts</h2>
      {localModel ? <form onSubmit={modelDraft}>
        <p className="dev-muted">Submitting sends the request and the context below to OpenRouter. Use sample data.</p>
        <label>Draft request<textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} maxLength={2000} required /></label>
        <label>Context to send (optional)<textarea value={context} onChange={event => setContext(event.target.value)} rows={3} maxLength={6000} /></label>
        <button className="primary" disabled={running}>{running ? 'Drafting…' : 'Send to OpenRouter'}</button>
      </form> : <p className="dev-muted">Model drafting is available on the local development server with OpenRouter configured.</p>}
      {modelError && <p className="assistant-output" role="alert">{modelError}</p>}
      {draft && <p className="assistant-output dev-details" aria-live="polite">{draft}</p>}
    </section>
  </div>
}
