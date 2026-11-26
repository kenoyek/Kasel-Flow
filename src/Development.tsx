import { useState, type FormEvent } from 'react'
import { ArrowUpRight, GitBranch, Plus, Settings2, X } from 'lucide-react'
import type { Project, Task } from './data'
import { githubRepository, moduleKeys, modules, type DevelopmentRecord, type RecordKind } from './development-data'

type Props = {
  projects: Project[]
  tasks: Task[]
  records: DevelopmentRecord[]
  onChange: (record: DevelopmentRecord) => void
  onEditProject: (project: Project) => void
  onNewTask: (projectId: string) => void
  onEditTask: (task: Task) => void
}

export function Development({ projects, tasks, records, onChange, onEditProject, onNewTask, onEditTask }: Props) {
  const [selected, setSelected] = useState('')
  const [view, setView] = useState<RecordKind | 'tasks'>('roadmap')
  const [filter, setFilter] = useState('')
  const [editor, setEditor] = useState<DevelopmentRecord | 'new' | null>(null)
  const project = projects.find(item => item.id === selected) ?? projects[0]
  if (!project) return <p className="panel empty">Create a development project to start planning.</p>

  const projectTasks = tasks.filter(task => task.project === project.id)
  const projectRecords = records.filter(record => record.project === project.id)
  const entries = projectRecords.filter(record => record.kind === view && (!filter || record.status === filter))
  const repository = githubRepository(project.repository ?? '')
  const activeModule = view === 'tasks' ? null : modules[view]

  function submit(event: FormEvent<HTMLFormElement>, kind: RecordKind, projectId: string) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const get = (name: string) => String(fields.get(name) ?? '').trim()
    const title = form.elements.namedItem('title') as HTMLInputElement
    const end = form.elements.namedItem('date') as HTMLInputElement | null
    if (!get('title')) {
      title.setCustomValidity('Enter a title.')
      title.reportValidity()
      return
    }
    if (kind === 'sprint' && get('start') > get('date') && end) {
      end.setCustomValidity('End date must be on or after start date.')
      end.reportValidity()
      return
    }
    onChange({
      id: editor && editor !== 'new' ? editor.id : crypto.randomUUID(),
      project: projectId,
      kind,
      title: get('title'),
      status: get('status'),
      details: get('details'),
      date: get('date'),
      start: get('start'),
      priority: get('priority'),
      taskId: get('task'),
      minutes: Number(get('minutes')),
    })
    setFilter('')
    setEditor(null)
  }

  function taskList(items: Task[]) {
    return items.length ? <ul className="dev-task-list">{items.map(task => <li key={task.id}>
      <button className="text-button" onClick={() => onEditTask(task)}>{task.title}</button>
      <span>{task.status}</span>
    </li>)}</ul> : <p className="dev-muted">No tasks yet.</p>
  }

  return <section className="development" aria-label="Development workspace">
    <div className="dev-toolbar panel">
      <label>Product <select value={project.id} onChange={event => {setSelected(event.target.value); setFilter('')}}>
        {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <button className="text-button" onClick={() => onEditProject(project)}><Settings2 size={16} /> Product settings</button>
      {repository && <div className="dev-repo"><GitBranch size={16} />
        <a href={repository} target="_blank" rel="noreferrer">Repository <ArrowUpRight size={13} /></a>
        <a href={repository + '/pulls'} target="_blank" rel="noreferrer">Pull requests <ArrowUpRight size={13} /></a>
        <a href={repository + '/activity'} target="_blank" rel="noreferrer">Activity <ArrowUpRight size={13} /></a>
      </div>}
    </div>

    <nav className="dev-views" aria-label="Development views">
      <button aria-pressed={view === 'tasks'} onClick={() => {setView('tasks'); setFilter('')}}>Tasks</button>
      {moduleKeys.map(kind => <button key={kind} aria-pressed={view === kind} onClick={() => {setView(kind); setFilter('')}}>{modules[kind].label}</button>)}
    </nav>

    <div className="section-heading">
      <h2>{activeModule?.label ?? 'Product tasks'}</h2>
      {activeModule && activeModule.states.length > 0 && <label className="dev-status-filter">
        Status <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">All statuses</option>
          {activeModule.states.map(status => <option key={status}>{status}</option>)}
        </select>
      </label>}
      {activeModule ? <button className="primary" onClick={() => setEditor('new')}><Plus size={16} /> New {activeModule.singular}</button> :
        <button className="primary" onClick={() => onNewTask(project.id)}><Plus size={16} /> New task</button>}
    </div>

    {view === 'tasks' && <div className="dev-records">
      <article className="panel dev-card"><h3>Backlog</h3>{taskList(projectTasks.filter(task => !task.sprint))}</article>
      {projectRecords.filter(record => record.kind === 'sprint').map(sprint =>
        <article className="panel dev-card" key={sprint.id}><h3>{sprint.title}</h3>{taskList(projectTasks.filter(task => task.sprint === sprint.id))}</article>)}
    </div>}

    {view === 'time' && projectRecords.some(record => record.kind === 'time') && <p className="dev-muted dev-total">
      {projectRecords.filter(record => record.kind === 'time').reduce((total, record) => total + record.minutes, 0)} minutes logged
    </p>}

    {activeModule && (entries.length ? <div className="dev-records">{entries.map(record => {
      const linkedTask = projectTasks.find(task => task.id === record.taskId)
      const sprintTasks = record.kind === 'sprint' ? projectTasks.filter(task => task.sprint === record.id) : []
      return <article className="panel dev-card" key={record.id}>
        <div className="dev-card-heading">
          <h3>{record.title}</h3>
          <button className="text-button" aria-label={'Edit ' + record.title} onClick={() => setEditor(record)}>Edit</button>
        </div>
        <div className="dev-meta">
          {record.status && <span className="status">{record.status}</span>}
          {record.priority && <span className="status">{record.priority}</span>}
          {record.date && <span>{record.start && record.start + ' to '}{record.date}</span>}
          {record.minutes > 0 && <span>{record.minutes} min</span>}
        </div>
        {record.details && <p className="dev-details">{record.details}</p>}
        {linkedTask && <button className="text-button" onClick={() => onEditTask(linkedTask)}>Task · {linkedTask.title}</button>}
        {record.kind === 'sprint' && <>
          <p className="dev-muted">{sprintTasks.filter(task => task.status === 'Done').length} of {sprintTasks.length} tasks done</p>
          {taskList(sprintTasks)}
        </>}
      </article>
    })}</div> : <p className="panel empty">No {activeModule.label.toLowerCase()} found for {project.name}.</p>)}

    {editor && activeModule && view !== 'tasks' && <RecordEditor
      record={editor === 'new' ? undefined : editor} kind={view} tasks={projectTasks}
      onCancel={() => setEditor(null)} onSubmit={event => submit(event, view, project.id)} />}
  </section>
}

type EditorProps = {
  record?: DevelopmentRecord
  kind: RecordKind
  tasks: Task[]
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function RecordEditor({ record, kind, tasks, onCancel, onSubmit }: EditorProps) {
  const spec = modules[kind]
  function clearDateError(form: HTMLFormElement | null) {
    const end = form?.elements.namedItem('date') as HTMLInputElement | null
    end?.setCustomValidity('')
  }

  return <dialog ref={element => {if (element && !element.open) element.showModal()}} onCancel={onCancel} aria-labelledby="record-title">
    <form onSubmit={onSubmit}>
      <div className="dialog-heading"><h2 id="record-title">{record ? 'Edit' : 'New'} {spec.singular}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}><X size={20} /></button>
      </div>
      <label>{kind === 'release' ? 'Version' : 'Title'}<input name="title" required maxLength={100} defaultValue={record?.title} autoFocus onInput={event => event.currentTarget.setCustomValidity('')} /></label>
      {spec.states.length > 0 && <label>Status<select name="status" defaultValue={record?.status}>{spec.states.map(state => <option key={state}>{state}</option>)}</select></label>}
      {(kind === 'bug' || kind === 'incident') && <label>Severity<select name="priority" defaultValue={record?.priority ?? 'Medium'}>{['Low', 'Medium', 'High', 'Critical'].map(priority => <option key={priority}>{priority}</option>)}</select></label>}
      {kind === 'sprint' && <label>Start date<input type="date" name="start" required defaultValue={record?.start} onInput={event => clearDateError(event.currentTarget.form)} /></label>}
      {'date' in spec && <label>{spec.date}<input type="date" name="date" required={kind === 'sprint' || kind === 'time'} defaultValue={record?.date} onInput={event => clearDateError(event.currentTarget.form)} /></label>}
      {kind === 'time' && <label>Minutes<input type="number" name="minutes" required min={1} max={1440} defaultValue={record?.minutes} /></label>}
      {['bug', 'request', 'qa', 'incident', 'time'].includes(kind) && <label>Linked task<select name="task" defaultValue={record?.taskId}><option value="">None</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>}
      <label>{spec.details}<textarea name="details" rows={4} maxLength={12000} defaultValue={record?.details} /></label>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" type="submit">Save {spec.singular}</button></div>
    </form>
  </dialog>
}
