import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownRight, ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronRight, Circle, ClipboardCheck, Code2, FolderKanban, LayoutDashboard, ListTodo, Megaphone, Menu, Moon, Palette, Plus, Search, Settings2, Sun, X } from 'lucide-react'
import { colors, departments, seed, statuses, type Project, type Status, type Task, type Workspace } from './data'
import { Business } from './Business'
import { emptyBusiness } from './business-data'
import { Creative } from './Creative'
import { Development } from './Development'
import { githubRepository } from './development-data'
import './style.css'

const storageKey = 'kasel-os-workspace-v1'
const links = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Tasks', icon: ListTodo },
  { label: 'Calendar', icon: CalendarDays },
]
const departmentIcons = [Code2, Megaphone, Palette, Settings2]

function loadWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const workspace = JSON.parse(saved) as Workspace
      return {...workspace, development: workspace.development ?? [], creative: workspace.creative ?? [], business: workspace.business ?? emptyBusiness}
    }
  } catch {
    // Seed the demo if storage is unavailable.
  }
  return seed
}

function formatDate(date: string) {
  return date ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) : 'No due date'
}

function App() {
  const [data, setData] = useState(loadWorkspace)
  const [page, setPage] = useState('Overview')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [modal, setModal] = useState<'project' | 'task' | null>(null)
  const [taskProject, setTaskProject] = useState('')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [notifications, setNotifications] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('kasel-theme') === 'dark' }
    catch { return false }
  })
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(data)) }
    catch { setStorageError(true) }
  }, [data])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try { localStorage.setItem('kasel-theme', dark ? 'dark' : 'light') }
    catch { /* Theme still applies for this session. */ }
  }, [dark])

  const department = departments.includes(page) ? page : ''
  const projects = department ? data.projects.filter(project => project.department === department) : data.projects
  const tasks = data.tasks.filter(task => projects.some(project => project.id === task.project))
  const pending = data.tasks.filter(task => task.status !== 'Done')
  const reviews = pending.filter(task => task.status === 'In review')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
  const overdue = pending.filter(task => task.due && task.due < today)
  const upcoming = pending.filter(task => task.due && task.due >= today).sort((first,second) => first.due.localeCompare(second.due))
  const query = search.trim().toLowerCase()
  const filteredProjects = data.projects.filter(project => (project.name + ' ' + project.description).toLowerCase().includes(query))
  const matchingTasks = data.tasks.filter(task =>
    (task.title + ' ' + (data.projects.find(project => project.id === task.project)?.name ?? '')).toLowerCase().includes(query))
  const filteredTasks = (overdueOnly ? overdue : tasks).filter(task =>
    (!projectFilter || task.project === projectFilter) && (!statusFilter || task.status === statusFilter))

  function navigate(next: string, project = '', status = '', onlyOverdue = false) {
    setPage(next)
    setProjectFilter(project)
    setStatusFilter(status)
    setOverdueOnly(onlyOverdue)
    setSearch('')
    setMobileNav(false)
    setNotifications(false)
  }

  function openTask(task: Task | null = null) {
    setTaskProject(task?.project ?? (projectFilter || projects[0]?.id || ''))
    setEditingTask(task)
    setModal('task')
  }

  function openProject(project: Project | null = null) {
    setEditingProject(project)
    setModal('project')
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const repositoryInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="repository"]')
    const value = (name: string) => String(form.get(name) ?? '').trim()
    if (!value('name')) return
    if (modal === 'project') {
      const repository = githubRepository(value('repository'))
      if (repositoryInput && value('repository') && !repository) {
        repositoryInput.setCustomValidity('Enter a GitHub repository URL such as https://github.com/owner/repository.')
        repositoryInput.reportValidity()
        return
      }
      const item: Project = {id:editingProject?.id ?? crypto.randomUUID(),name:value('name'),description:value('description'),department:value('department'),repository,color:editingProject?.color ?? colors[data.projects.length % colors.length]}
      setData(previous => ({...previous,projects:editingProject ? previous.projects.map(project => project.id === item.id ? item : project) : [...previous.projects,item]}))
      navigate(department && department === item.department ? department : 'Projects')
    } else {
      const sprint = data.development.find(record => record.kind === 'sprint' && record.id === value('sprint') && record.project === value('project'))
      const item: Task = {id:editingTask?.id ?? crypto.randomUUID(),title:value('name'),project:value('project'),status:value('status') as Status,due:value('due'),sprint:sprint?.id}
      setData(previous => ({...previous,tasks:editingTask ? previous.tasks.map(task => task.id === item.id ? item : task) : [...previous.tasks,item]}))
      if (!editingTask && page !== 'Development') navigate('Tasks', item.project)
    }
    setModal(null)
  }

  function startDevelopmentTask(projectId: string) {
    openTask()
    setTaskProject(projectId)
  }

  function renderTask(task: Task) {
    const project = data.projects.find(item => item.id === task.project)
    return <button className="task-row" key={task.id} onClick={() => openTask(task)}>
      {task.status === 'Done' ? <CheckCircle2 className="task-check done" /> : <Circle className="task-check" />}
      <span className="task-name"><strong>{task.title}</strong><small>{project?.name}</small></span>
      <span className={'status ' + task.status.toLowerCase().replace(' ', '-')}>{task.status}</span>
      <span className="due">{formatDate(task.due)}</span>
    </button>
  }

  function renderProject(project: Project) {
    const related = data.tasks.filter(task => task.project === project.id)
    const complete = related.filter(task => task.status === 'Done').length
    const progress = related.length ? Math.round(complete / related.length * 100) : 0
    return <article className="project-card" key={project.id}>
      <div className="project-top"><span className={'square ' + project.color}><FolderKanban size={19} /></span><button className="icon-button compact" aria-label={'Edit ' + project.name} onClick={() => openProject(project)}><Settings2 size={17} /></button></div>
      <button className="project-title" onClick={() => navigate('Tasks',project.id)}>{project.name}<ChevronRight size={16} /></button>
      <p>{project.description || project.department}</p>
      <div className="progress-caption"><span>Progress</span><strong>{progress}%</strong></div>
      <div className="progress-track" role="progressbar" aria-label={project.name + ' completion'} aria-valuenow={progress}><div className={project.color} style={{width:progress + '%'}} /></div>
      <div className="project-footer"><span>{complete} of {related.length} tasks</span><span>{project.department}</span></div>
    </article>
  }

  return <div className="app">
    <aside className={mobileNav ? 'sidebar visible' : 'sidebar'}>
      <button className="brand" onClick={() => navigate('Overview')}><span className="brand-mark">K</span><span>Kasel <b>OS</b><small>AGENCY WORKSPACE</small></span></button>
      <div className="workspace-label"><span className="workspace-icon">KD</span><span><strong>Kasel Digital</strong><small>Demo workspace</small></span></div>
      <nav aria-label="Workspace"><p>WORKSPACE</p>{links.map(({label,icon:Icon}) => <button aria-current={page === label ? 'page' : undefined} key={label} onClick={() => navigate(label)}><Icon size={18} />{label}{page === label && <ChevronRight size={15} />}</button>)}
      <p>DEPARTMENTS</p>{departments.map((label,index) => {const Icon = departmentIcons[index]; return <button aria-current={page === label ? 'page' : undefined} key={label} onClick={() => navigate(label)}><Icon size={18} />{label}</button>})}</nav>
      <div className="sidebar-bottom"><span className="avatar">KD</span><span><strong>Kasel Digital</strong><small>Demo administrator</small></span></div>
    </aside>
    <div className="shell">
      <header className="topbar">
        <button className="icon-button menu" onClick={() => setMobileNav(!mobileNav)} aria-expanded={mobileNav} aria-label="Toggle navigation"><Menu size={21} /></button>
        <div className="breadcrumbs">Workspace <ChevronRight size={14} /> <strong>{page}</strong></div>
        <div className="top-actions">
          <label className="search"><Search size={17} /><input type="search" aria-label="Search workspace" placeholder="Search workspace…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <button className="icon-button" aria-label={dark ? 'Use light mode' : 'Use dark mode'} onClick={() => setDark(!dark)}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
          <button className="icon-button bell" aria-label="Notifications" aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell size={20} />{reviews.length > 0 && <i />}</button>
        </div>
        {notifications && <section className="notification-panel"><h3>Notifications</h3>{reviews.length ? reviews.map(task => <button key={task.id} onClick={() => {setNotifications(false);openTask(task)}}><ClipboardCheck size={17} /><span><strong>{task.title}</strong><small>Awaiting review</small></span></button>) : <p>You’re all caught up.</p>}</section>}
      </header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">{department ? 'DEPARTMENT WORKSPACE' : 'KASEL DIGITAL SOLUTIONS'}</div><h1>{page === 'Overview' ? 'Executive overview' : page}</h1><p>{page === 'Overview' ? 'Track projects, team progress, and what needs your attention.' : department ? 'Manage this department’s projects and deliverables.' : {Projects:'Track deliverables and progress across the agency.',Tasks:'Manage assignments, deadlines, and reviews.',Calendar:'See upcoming deliverables and task deadlines.'}[page]}</p></div>
        <button className="primary" onClick={() => page === 'Tasks' || page === 'Calendar' ? (data.projects.length ? openTask() : openProject()) : openProject()}><Plus size={18} />{(page === 'Tasks' || page === 'Calendar') && data.projects.length ? 'New task' : 'New project'}</button></div>
        {storageError && <p role="alert">Browser storage is unavailable. Changes may be lost when you close this page.</p>}
        {query ? <section className="section"><h2>Search results</h2><div className="project-grid">{filteredProjects.map(renderProject)}</div><div className="panel task-list">{matchingTasks.length ? matchingTasks.map(renderTask) : <p className="empty">No matching tasks.</p>}</div></section> : <>
          {page === 'Overview' && <>
            <div className="stats">
              {[
                {label:'Active projects',number:data.projects.filter(project => {const related = data.tasks.filter(task => task.project === project.id);return !related.length || related.some(task => task.status !== 'Done')}).length,icon:FolderKanban,color:'violet',detail:'Across all departments',action:() => navigate('Projects')},
                {label:'Open tasks',number:pending.length,icon:ListTodo,color:'blue',detail:'To do, in progress, or in review',action:() => navigate('Tasks')},
                {label:'Awaiting review',number:reviews.length,icon:ClipboardCheck,color:'gold',detail:'Ready for a decision',action:() => navigate('Tasks','','In review')},
                {label:'Overdue tasks',number:overdue.length,icon:ArrowDownRight,color:'pink',detail:'Past their due date',action:() => navigate('Tasks','','',true)},
              ].map(({label,number,icon:Icon,color,detail,action}) => <button className="stat" key={label} onClick={action}><div className="stat-top"><span className={'square ' + color}><Icon size={19} /></span><ArrowRight size={15} /></div><span className="stat-label">{label}</span><strong>{number}</strong><small>{detail}</small></button>)}
            </div>
            <div className="overview-grid">
              <section className="panel"><div className="panel-heading"><div><h2>Department progress</h2><p>Completed tasks by department</p></div></div><div className="department-list">{departments.map((name,index) => {
                const related = data.tasks.filter(task => data.projects.some(project => project.id === task.project && project.department === name))
                const complete = related.filter(task => task.status === 'Done').length
                const percent = related.length ? Math.round(complete / related.length * 100) : 0
                return <button key={name} onClick={() => navigate(name)}><span><strong>{name}</strong><small>{complete}/{related.length} tasks</small></span><span className="progress-track"><span className={colors[index]} style={{width:percent + '%'}} /></span><b>{percent}%</b></button>
              })}</div></section>
              <section className="panel"><div className="panel-heading"><div><h2>Upcoming deadlines</h2><p>Open tasks ordered by due date</p></div><button className="text-button" onClick={() => navigate('Calendar')}>Calendar <ArrowRight size={15} /></button></div>{upcoming.slice(0,4).map(renderTask)}{!upcoming.length && <p className="empty">No upcoming deadlines.</p>}</section>
            </div>
          </>}
          {page === 'Operations' && <Business data={data.business} projects={data.projects}
            update={patch => setData(previous => ({...previous, business: patch(previous.business)}))} />}
          {(page === 'Social Media' || page === 'Content') && <Creative key={page} content={page === 'Content'}
            records={data.creative} onSave={record => setData(previous => ({
              ...previous,
              creative: previous.creative.some(item => item.id === record.id)
                ? previous.creative.map(item => item.id === record.id ? record : item)
                : [...previous.creative, record],
            }))} />}
          {page === 'Development' && <Development
            projects={projects} tasks={tasks} records={data.development}
            onChange={record => setData(previous => {
              const exists = previous.development.some(item => item.id === record.id)
              const development = exists
                ? previous.development.map(item => item.id === record.id ? record : item)
                : [...previous.development, record]
              return {...previous, development}
            })}
            onEditProject={openProject} onNewTask={startDevelopmentTask} onEditTask={openTask} />}
          {(page === 'Overview' || page === 'Projects' || (department && page !== 'Development')) && <section className="section"><div className="section-heading"><h2>{page === 'Overview' ? 'Projects' : department ? 'Department projects' : 'All projects'}</h2>{page === 'Overview' && <button className="text-button" onClick={() => navigate('Projects')}>View all projects <ArrowRight size={15} /></button>}</div><div className="project-grid">{(page === 'Overview' ? projects.slice(0,3) : projects).map(renderProject)}</div>{!projects.length && <p className="panel empty">No projects yet.</p>}</section>}
          {(page === 'Tasks' || page === 'Calendar' || (department && page !== 'Development')) && <section className="section">
            <div className="filters"><label>Project <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="">All projects</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>Status <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>{department && <button className="text-button" onClick={() => projects.length ? openTask() : openProject()}><Plus size={16} />{projects.length ? 'New task' : 'New project'}</button>}<span>{filteredTasks.length} tasks</span>{overdueOnly && <button className="text-button" onClick={() => setOverdueOnly(false)}>Clear overdue filter <X size={14} /></button>}</div>
            <div className="panel task-list">{(page === 'Calendar' ? [...filteredTasks].sort((first,second) => (first.due || '9999').localeCompare(second.due || '9999')) : filteredTasks).map(renderTask)}{!filteredTasks.length && <p className="empty">No tasks match these filters.</p>}</div>
          </section>}
        </>}
      </main>
    </div>
    {modal && <dialog ref={element => {if (element && !element.open) element.showModal()}} onCancel={() => setModal(null)} aria-labelledby="editor-title">
      <form onSubmit={saveItem}>
        <div className="dialog-heading"><h2 id="editor-title">{(modal === 'task' ? editingTask : editingProject) ? 'Edit' : 'New'} {modal}</h2><button type="button" className="icon-button" aria-label="Close" onClick={() => setModal(null)}><X size={20} /></button></div>
        <label>{modal === 'project' ? 'Project name' : 'Task title'}<input name="name" required maxLength={100} defaultValue={modal === 'project' ? editingProject?.name : editingTask?.title} autoFocus /></label>
        {modal === 'project' ? <><label>Department<select name="department" defaultValue={editingProject?.department ?? (department || departments[0])}>{departments.map(name => <option key={name}>{name}</option>)}</select></label><label>Description<textarea name="description" maxLength={250} defaultValue={editingProject?.description} /></label>{(page === 'Development' || editingProject?.repository || editingProject?.department === 'Development') && <label>GitHub repository URL<input type="url" name="repository" placeholder="https://github.com/owner/repository" defaultValue={editingProject?.repository} onChange={event => event.currentTarget.setCustomValidity('')} /></label>}</> : <><label>Project<select name="project" required value={taskProject} onChange={event => setTaskProject(event.target.value)}>{data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Status<select name="status" defaultValue={editingTask?.status ?? 'To do'}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label><label>Due date<input name="due" type="date" defaultValue={editingTask?.due} /></label>{data.projects.some(project => project.id === taskProject && project.department === 'Development') && <label>Sprint<select name="sprint" key={taskProject} defaultValue={editingTask?.project === taskProject ? editingTask.sprint ?? '' : ''}><option value="">Backlog</option>{data.development.filter(record => record.kind === 'sprint' && record.project === taskProject).map(record => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>}</>}
        <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit">Save {modal}</button></div>
      </form>
    </dialog>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
