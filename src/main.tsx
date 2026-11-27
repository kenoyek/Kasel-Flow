import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownRight, ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronRight, Circle, ClipboardCheck, Code2, FolderKanban, Columns3, GanttChartSquare, History, LayoutDashboard, ListTodo, ListChecks, MessagesSquare, Megaphone, Menu, Moon, Palette, Plus, Search, Settings2, Sparkles, Sun, Users, X } from 'lucide-react'
import { colors, departments, seed, statuses, taskPriorities, type Priority, type ChecklistItem, type Project, type Status, type Task, type Workspace } from './data'
import { PasswordSettings, WorkspaceSettings, useAppInstallation } from './WorkspaceSettings'
import { CloudGate, type CloudControls } from './CloudGate'
import { Assistant } from './Assistant'
import { defaultAutomation, reportWorkspace } from './assistant-data'
import { Business } from './Business'
import { emptyBusiness } from './business-data'
import { Creative } from './Creative'
import { Development } from './Development'
import { MyWork } from './MyWork'
import { TaskReviews, useReviewInbox, type ReviewNotice } from './TaskReviews'
import { TeamChat } from './TeamChat'
import { TaskDiscussion, taskNoticeText, useTaskMentions, type TaskMention } from './TaskDiscussion'
import { TaskDependencies } from './TaskDependencies'
import { blockedTask, dependsOnTask, taskDependencies } from './task-dependencies'
import { TaskChecklist, checklistProgress } from './TaskChecklist'
import { TaskTemplates } from './TaskTemplates'
import { TaskTimeline, taskDateLabel } from './TaskTimeline'
import { TaskBoard } from './TaskBoard'
import { TeamActivity } from './TeamActivity'
import { useTeamUpdates } from './useTeamUpdates'
import { TeamWorkload, unassigned } from './TeamWorkload'
import { listPendingInvites, listTaskAssignees, type TaskAssignee } from './team-workspace'
import { githubRepository } from './development-data'
import './style.css'

const storageKey = 'kasel-os-workspace-v1'
const links = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'My Work', icon: ListChecks },
  { label: 'Chat', icon: MessagesSquare },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Tasks', icon: ListTodo },
  { label: 'Board', icon: Columns3 },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Timeline', icon: GanttChartSquare },
  { label: 'Workload', icon: Users },
  { label: 'Activity', icon: History },
  { label: 'Assistant', icon: Sparkles },
  { label: 'Settings', icon: Settings2 },
]
const departmentIcons = [Code2, Megaphone, Palette, Settings2]

function loadWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const workspace = JSON.parse(saved) as Workspace
      return {...workspace, development: workspace.development ?? [], creative: workspace.creative ?? [], business: workspace.business ?? emptyBusiness, automation: workspace.automation ?? defaultAutomation}
    }
  } catch {
    // Seed the demo if storage is unavailable.
  }
  return seed
}

function formatDate(date: string) {
  return date ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) : 'No due date'
}

function App({account, openAccount}: {account?: CloudControls; openAccount?: () => void}) {
  const installation = useAppInstallation()
  const [data, setData] = useState(() => account?.initial.data ?? loadWorkspace())
  const [saved, setSaved] = useState(data)
  const [revision, setRevision] = useState(account?.initial.revision ?? 0)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [pendingInvites, setPendingInvites] = useState(0)
  const [cloudMessage, setCloudMessage] = useState('')
  const team = account?.team
  const readOnly = team?.role === 'viewer'
  const restrictedProject = team?.kind === 'restricted_project'
  const dirty = Boolean(account && saved !== data)
  const [page, setPage] = useState('Overview')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [dependsOn, setDependsOn] = useState<string[]>([])
  const [dependencyError,setDependencyError] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [openOnly, setOpenOnly] = useState(false)
  const [roster, setRoster] = useState<TaskAssignee[] | null>(null)
  const [rosterError, setRosterError] = useState(false)
  const [rosterAttempt, setRosterAttempt] = useState(0)
  const teamId = team?.id
  const {items:reviewNotices,remove:removeReviewNotice} = useReviewInbox(teamId, account?.owner)
  const [highlightReview,setHighlightReview] = useState<string>()
  const {mentions,markRead} = useTaskMentions(teamId)
  const [highlightComment,setHighlightComment] = useState<string>()
  const {latest, connection, refreshing, refreshError, refresh} = useTeamUpdates(teamId)
  const newer = latest && latest.revision > revision ? latest : null
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [modal, setModal] = useState<'project' | 'task' | null>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
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

  const inviteOwner = team ? undefined : account?.owner
  useEffect(() => {
    if (!inviteOwner) return
    let request: AbortController | undefined
    function checkInvites() {
      request?.abort()
      const next = new AbortController()
      request = next
      listPendingInvites(next.signal).then(items => {
        if (!next.signal.aborted) setPendingInvites(items.length)
      }).catch(() => {
        if (!next.signal.aborted) setPendingInvites(0)
      })
    }
    checkInvites()
    window.addEventListener('focus', checkInvites)
    return () => {
      request?.abort()
      window.removeEventListener('focus', checkInvites)
    }
  }, [inviteOwner])

  useEffect(() => {
    if (!teamId) return
    const controller = new AbortController()
    setRosterError(false)
    listTaskAssignees(teamId, controller.signal).then(members => {
      if (!controller.signal.aborted) setRoster(members)
    }).catch(() => {
      if (!controller.signal.aborted) setRosterError(true)
    })
    return () => controller.abort()
  }, [teamId, rosterAttempt])

  useEffect(() => {
    if (account) return
    try { localStorage.setItem(storageKey, JSON.stringify(data)) }
    catch { setStorageError(true) }
  }, [account, data])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = true}
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!newer || dirty || modal || templatesOpen || cloudBusy) return
    setData(newer.data)
    setSaved(newer.data)
    setRevision(newer.revision)
    setCloudMessage('A newer team version was loaded.')
    setRosterAttempt(value => value + 1)
  }, [newer, dirty, modal, templatesOpen, cloudBusy])

  function loadNewerVersion() {
    if (!newer || cloudBusy || (dirty && !window.confirm('Load the newer team version and discard your unsaved edits?'))) return
    setData(newer.data)
    setSaved(newer.data)
    setRevision(newer.revision)
    setCloudMessage('A newer team version was loaded.')
    setRosterAttempt(value => value + 1)
  }

  async function saveCloud() {
    if (!account || !dirty || cloudBusy || newer) return
    setCloudBusy(true)
    setCloudMessage('')
    try {
      setRevision(await account.save(data, revision))
      setSaved(data)
      setCloudMessage('Cloud workspace saved.')
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : 'Unable to save workspace.')
    } finally {setCloudBusy(false)}
  }

  function switchWorkspace(focusInvites = false) {
    if (!account || cloudBusy || (dirty && !window.confirm('Switch workspaces and discard unsaved edits?'))) return
    account.switchWorkspace(focusInvites)
  }

  async function signOut() {
    if (!account || cloudBusy || (dirty && !window.confirm('Sign out and discard unsaved workspace edits?'))) return
    setCloudBusy(true)
    setCloudMessage('')
    try { await account.signOut() }
    catch { setCloudMessage('Could not sign out. Try again.');setCloudBusy(false) }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try { localStorage.setItem('kasel-theme', dark ? 'dark' : 'light') }
    catch { /* Theme still applies for this session. */ }
  }, [dark])

  const tasksById = new Map(data.tasks.map(task => [task.id,task]))
  const taskPage = ['Tasks','Calendar','Board','Timeline'].includes(page)
  const department = departments.includes(page) ? page : ''
  const projects = department ? data.projects.filter(project => project.department === department) : data.projects
  const tasks = data.tasks.filter(task => projects.some(project => project.id === task.project))
  const pending = data.tasks.filter(task => task.status !== 'Done')
  const reviews = pending.filter(task => task.status === 'In review')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
  const overdue = pending.filter(task => task.due && task.due < today)
  const reviewExtras = data.automation.reminders ? reportWorkspace(data, 'reviews', today).lines.length - reviews.length : 0
  const upcoming = pending.filter(task => task.due && task.due >= today).sort((first,second) => first.due.localeCompare(second.due))
  const query = search.trim().toLowerCase()
  const filteredProjects = data.projects.filter(project => (project.name + ' ' + project.description).toLowerCase().includes(query))
  const matchingTasks = data.tasks.filter(task =>
    [task.title, data.projects.find(project => project.id === task.project)?.name, task.description,
      ...(task.checklist ?? []).map(item => item.title)].join(' ').toLowerCase().includes(query))
  const filteredTasks = (overdueOnly ? overdue : tasks).filter(task =>
    (!projectFilter || task.project === projectFilter) && (!statusFilter || task.status === statusFilter) &&
    (!priorityFilter || (task.priority ?? 'Normal') === priorityFilter) && (!assigneeFilter || (task.assignee ?? unassigned) === assigneeFilter) && (!openOnly || task.status !== 'Done') && (!blockedOnly || blockedTask(task,tasksById)))

  function navigate(next: string, project = '', status = '', onlyOverdue = false) {
    setPage(next)
    setProjectFilter(project)
    setStatusFilter(status)
    setAssigneeFilter('')
    setPriorityFilter('')
    setBlockedOnly(false)
    setOpenOnly(false)
    setOverdueOnly(onlyOverdue)
    setSearch('')
    setMobileNav(false)
    setNotifications(false)
  }

  function openTask(task: Task | null = null, comment?: string, review?: string) {
    if (readOnly && !task) return
    setHighlightReview(review)
    setHighlightComment(comment)
    setDependsOn(task?.dependsOn ?? [])
    setDependencyError('')
    setChecklist(task?.checklist ?? [])
    setTaskProject(task?.project ?? (projectFilter || projects[0]?.id || ''))
    setEditingTask(task)
    setModal('task')
  }

  function openMention(mention: TaskMention) {
    setNotifications(false)
    const task = data.tasks.find(item => item.id === mention.task_id)
    if (!task) {
      setCloudMessage('This task is unavailable in the open workspace. Check for updates and try again.')
      refresh()
      return
    }
    openTask(task,mention.comment_id)
    void markRead(mention)
  }

  function openReviewNotice(notice: ReviewNotice) {
    setNotifications(false)
    const task = data.tasks.find(item => item.id === notice.task_id)
    if (!task) {
      setCloudMessage('This task is unavailable in the open workspace. Check for updates and try again.')
      refresh()
      return
    }
    openTask(task,undefined,notice.id)
  }

  function taskCollaboration(task: Task) {
    if (!teamId || !account) return null
    if (!saved.tasks.some(item => item.id === task.id)) return <p className="empty">Save this task to the cloud to start a discussion or request a review.</p>
    return <>
      <TaskDiscussion key={task.id + ':' + (highlightComment ?? '')} teamId={teamId} taskId={task.id}
        owner={account.owner} members={roster ?? []} readOnly={readOnly} highlight={highlightComment} />
      <TaskReviews key={task.id + ':' + (highlightReview ?? '')} teamId={teamId} taskId={task.id}
        userId={account.owner} members={roster ?? []} readOnly={readOnly} highlight={highlightReview} onDecision={removeReviewNotice} />
    </>
  }

  function openProject(project: Project | null = null) {
    if (readOnly || (restrictedProject && !project)) return
    setEditingProject(project)
    setModal('project')
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly) return
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
      const start = value('start')
      const due = value('due')
      const dueInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="due"]')
      if (dueInput && start && due && start > due) {
        dueInput.setCustomValidity('The due date must be on or after the start date.')
        dueInput.reportValidity()
        return
      }
      const sprint = data.development.find(record => record.kind === 'sprint' && record.id === value('sprint') && record.project === value('project'))
      const item: Task = {...editingTask,id:editingTask?.id ?? crypto.randomUUID(),title:value('name'),project:value('project'),status:value('status') as Status,priority:value('priority') as Priority,description:value('description') || undefined,checklist:checklist.length ? checklist : undefined,due,start:start || undefined,sprint:sprint?.id,assignee:roster ? value('assignee') || undefined : editingTask?.assignee}
      const dependencies = taskDependencies({...item,dependsOn},tasksById)
      if (dependencies.some(dependency => dependsOnTask(dependency,item.id,tasksById))) {
        setDependencyError('Remove the circular dependency before saving.')
        return
      }
      item.dependsOn = dependencies.length ? dependencies.map(dependency => dependency.id) : undefined
      setData(previous => ({...previous,tasks:editingTask ? previous.tasks.map(task => {
        if (task.id === item.id) return item
        if (task.project === item.project || !task.dependsOn?.includes(item.id)) return task
        const remaining = task.dependsOn.filter(id => id !== item.id)
        return {...task,dependsOn:remaining.length ? remaining : undefined}
      }) : [...previous.tasks,item]}))
      if (!editingTask && page !== 'Development' && page !== 'Board' && page !== 'Timeline') navigate('Tasks', item.project)
    }
    setModal(null)
  }

  function startDevelopmentTask(projectId: string) {
    openTask()
    setTaskProject(projectId)
  }

  function taskContext(task: Task) {
    const project = data.projects.find(item => item.id === task.project)?.name
    const assignee = roster?.find(member => member.user_id === task.assignee)?.label
    return [project,assignee].filter(Boolean).join(' · ')
  }

  function renderTask(task: Task) {
    return <button className="task-row" key={task.id} onClick={() => openTask(task)}>
      {task.status === 'Done' ? <CheckCircle2 className="task-check done" /> : <Circle className="task-check" />}
      <span className="task-name"><strong>{task.title}</strong><small>{taskContext(task)}{task.priority && task.priority !== 'Normal' && ' · ' + task.priority}{blockedTask(task,tasksById) && ' · Blocked'}</small></span>
      <span className={'status ' + task.status.toLowerCase().replace(' ', '-')}>{task.status}</span>
      <span className="due">{formatDate(task.due)}</span>
    </button>
  }

  function renderProject(project: Project) {
    const related = data.tasks.filter(task => task.project === project.id)
    const complete = related.filter(task => task.status === 'Done').length
    const progress = related.length ? Math.round(complete / related.length * 100) : 0
    return <article className="project-card" key={project.id}>
      <div className="project-top"><span className={'square ' + project.color}><FolderKanban size={19} /></span>{!readOnly && <button className="icon-button compact" aria-label={'Edit ' + project.name} onClick={() => openProject(project)}><Settings2 size={17} /></button>}</div>
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
      <div className="workspace-label"><span className="workspace-icon">KD</span><span><strong>{team?.name ?? 'Kasel Digital'}</strong><small>{team ? restrictedProject ? 'Restricted project' : 'Team workspace' : account ? 'Private cloud workspace' : 'Demo workspace'}</small></span></div>
      <nav aria-label="Workspace"><p>WORKSPACE</p>{links.filter(link => team ? link.label !== 'Assistant' : !['My Work','Chat','Workload','Activity'].includes(link.label)).map(({label,icon:Icon}) => <button aria-current={page === label ? 'page' : undefined} key={label} onClick={() => navigate(label)}><Icon size={18} />{label}{page === label && <ChevronRight size={15} />}</button>)}
      <p>DEPARTMENTS</p>{departments.map((label,index) => {const Icon = departmentIcons[index]; return <button aria-current={page === label ? 'page' : undefined} key={label} onClick={() => navigate(label)}><Icon size={18} />{label}</button>})}</nav>
      <div className="sidebar-bottom"><span className="avatar">KD</span><span><strong>Kasel Digital</strong><small>{account?.email ?? 'Demo administrator'}</small></span></div>
    </aside>
    <div className="shell">
      <header className="topbar">
        <button className="icon-button menu" onClick={() => setMobileNav(!mobileNav)} aria-expanded={mobileNav} aria-label="Toggle navigation"><Menu size={21} /></button>
        <div className="breadcrumbs">Workspace <ChevronRight size={14} /> <strong>{page}</strong></div>
        <div className="top-actions">
          <label className="search"><Search size={17} /><input type="search" aria-label="Search workspace" placeholder="Search workspace…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <button className="icon-button" aria-label={dark ? 'Use light mode' : 'Use dark mode'} onClick={() => setDark(!dark)}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
          <button className="icon-button bell" aria-label="Notifications" aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell size={20} />{(reviews.length > 0 || reviewExtras > 0 || reviewNotices.length > 0 || mentions.some(item => !item.read_at)) && <i />}</button>
          {!account && <button className="secondary top-sign-in" onClick={openAccount ?? (() => navigate('Settings'))}>Sign in</button>}
        </div>
        {notifications && <section className="notification-panel"><h3>Notifications</h3>{reviews.length ? reviews.map(task => <button key={task.id} onClick={() => {setNotifications(false);openTask(task)}}><ClipboardCheck size={17} /><span><strong>{task.title}</strong><small>Awaiting review</small></span></button>) : null}{reviewExtras > 0 && <button onClick={() => navigate('Assistant')}><ClipboardCheck size={17} /><span><strong>{reviewExtras} additional items awaiting review</strong><small>Creative and client approvals</small></span></button>}{mentions.map(mention => <button key={mention.comment_id} type="button" onClick={() => openMention(mention)}>
          <Bell size={17} /><span><strong>{mention.task_title}</strong><small>{taskNoticeText(mention)}{!mention.read_at && ' · New'}</small></span>
        </button>)}{reviewNotices.map(notice => <button key={notice.id} type="button" onClick={() => openReviewNotice(notice)}>
          <ClipboardCheck size={17} /><span><strong>{notice.title}</strong><small>Deliverable review · {notice.task_title}</small></span>
        </button>)}{!reviews.length && !reviewExtras && !mentions.length && !reviewNotices.length && <p>You’re all caught up.</p>}</section>}
      </header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">{department ? 'DEPARTMENT WORKSPACE' : 'KASEL DIGITAL SOLUTIONS'}</div><h1>{page === 'Overview' ? 'Executive overview' : page}</h1><p>{page === 'Overview' ? 'Track projects, team progress, and what needs your attention.' : department ? 'Manage this department’s projects and deliverables.' : {Projects:'Track deliverables and progress across the agency.',Tasks:'Manage assignments, deadlines, and reviews.',Board:'Organize tasks by status and priority.',Calendar:'See upcoming deliverables and task deadlines.',Timeline:'Plan work by start date and deadline.','My Work':'Find your assignments, review requests, and discussion alerts.',Chat:'Talk with members of this workspace.',Assistant:'Run reports, draft work, and manage review reminders.',Settings:'Install the app and export your workspace records.',Workload:'See open work and overdue tasks for each team member.',Activity:'See who changed shared records and when.'}[page]}</p></div>
        {!readOnly && page !== 'Assistant' && page !== 'Settings' && page !== 'Workload' && page !== 'Activity' && page !== 'My Work' && page !== 'Chat' && (!restrictedProject || taskPage) && <button className="primary" onClick={() => taskPage ? (data.projects.length ? openTask() : openProject()) : openProject()}><Plus size={18} />{taskPage && data.projects.length ? 'New task' : 'New project'}</button>}</div>
        {!readOnly && (page === 'Projects' || page === 'Tasks' || page === 'Board') && projects.length > 0 &&
          <button className="secondary template-launch" onClick={() => setTemplatesOpen(true)}><Plus size={16} /> Use a task template</button>}
        {account && <section className="panel cloud-bar" aria-label="Cloud workspace controls">
          <span role="status">{cloudMessage || (dirty ? 'Unsaved cloud edits' : team ? team.name + ' · ' + team.role : 'Private cloud workspace')}{dirty && cloudMessage === 'Cloud workspace saved.' ? ' · New edits pending' : ''}</span>
          {!readOnly && <button className="secondary" disabled={!dirty || cloudBusy || Boolean(newer)} onClick={() => void saveCloud()}>Save to cloud</button>}
          {team && page !== 'Chat' && <button className="secondary" disabled={cloudBusy} onClick={() => navigate('Chat')}><MessagesSquare size={16} /> Open team chat</button>}
          <button className="text-button" disabled={cloudBusy} onClick={() => switchWorkspace()}>Switch workspace</button>
          <button className="text-button" disabled={cloudBusy} onClick={() => void signOut()}>Sign out</button>
        </section>}
        {inviteOwner && pendingInvites > 0 && <section className="panel cloud-bar" aria-label="Pending team invitations">
          <span>{pendingInvites === 1 ? 'You have a pending team invitation.' : 'You have ' + pendingInvites + ' pending team invitations.'}</span>
          <button className="secondary" disabled={cloudBusy} onClick={() => switchWorkspace(true)}>Review invitations</button>
        </section>}
        {team && <section className="panel cloud-bar" aria-label="Team synchronization">
          <span role="status">{refreshError ? 'Could not check the team workspace. Your open copy is still available.' :
            newer ? 'A newer team version is available. Export unsaved edits in Settings before replacing your copy.' :
            connection === 'live' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting live updates…' : 'Live updates unavailable. You can check manually.'}</span>
          <button className="text-button" disabled={refreshing} onClick={refresh}>{refreshing ? 'Checking…' : 'Check for updates'}</button>
          {newer && <button className="secondary" disabled={cloudBusy} onClick={loadNewerVersion}>Load newer version</button>}
        </section>}
        {installation.waiting && page !== 'Settings' && <button className="text-button" onClick={() => navigate('Settings')}>An app update is available</button>}
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
          {page === 'Chat' && teamId && <TeamChat teamId={teamId} readOnly={readOnly} />}
          {page === 'My Work' && team && account && <MyWork owner={account.owner} tasks={tasksById} today={today}
            mentions={mentions} reviews={reviewNotices} renderTask={renderTask} openMention={openMention} openReview={openReviewNotice} />}
          {page === 'Activity' && teamId && <TeamActivity teamId={teamId} revision={revision} />}
          {page === 'Workload' && (roster ? <TeamWorkload tasks={data.tasks} members={roster} today={today} openTasks={id => {
            navigate('Tasks')
            setAssigneeFilter(id)
            setOpenOnly(true)
          }} /> : <section className="panel empty" role="status">
            {rosterError ? <>Team assignees are unavailable. <button className="text-button" onClick={() => setRosterAttempt(value => value + 1)}>Retry roster</button></> : 'Loading team assignees…'}
          </section>)}
          {page === 'Settings' && <>
            {!account && !openAccount && <section className="panel cloud-bar" aria-label="Sign-in availability">
              <span>Sign-in is unavailable in this demo build. Ask your workspace administrator to enable cloud sign-in.</span>
            </section>}
            <WorkspaceSettings data={data} installation={installation} privateWorkspace={Boolean(account)} />
            {account && <div className="section"><PasswordSettings setPassword={account.setPassword} /></div>}
          </>}
          {page === 'Assistant' && <Assistant data={data} today={today} update={setData} allowModel={!account} />}
          {!team && page === 'Operations' && <Business data={data.business} projects={data.projects}
            update={patch => setData(previous => ({...previous, business: patch(previous.business)}))} />}
          {!team && (page === 'Social Media' || page === 'Content') && <Creative key={page} content={page === 'Content'}
            records={data.creative} onSave={record => setData(previous => ({
              ...previous,
              creative: previous.creative.some(item => item.id === record.id)
                ? previous.creative.map(item => item.id === record.id ? record : item)
                : [...previous.creative, record],
            }))} />}
          {!team && page === 'Development' && <Development
            projects={projects} tasks={tasks} records={data.development}
            onChange={record => setData(previous => {
              const exists = previous.development.some(item => item.id === record.id)
              const development = exists
                ? previous.development.map(item => item.id === record.id ? record : item)
                : [...previous.development, record]
              return {...previous, development}
            })}
            onEditProject={openProject} onNewTask={startDevelopmentTask} onEditTask={openTask} />}
          {(page === 'Overview' || page === 'Projects' || (department && (team || page !== 'Development'))) && <section className="section"><div className="section-heading"><h2>{page === 'Overview' ? 'Projects' : department ? 'Department projects' : 'All projects'}</h2>{page === 'Overview' && <button className="text-button" onClick={() => navigate('Projects')}>View all projects <ArrowRight size={15} /></button>}</div><div className="project-grid">{(page === 'Overview' ? projects.slice(0,3) : projects).map(renderProject)}</div>{!projects.length && <p className="panel empty">No projects yet.</p>}</section>}
          {(taskPage || (department && (team || page !== 'Development'))) && <section className="section">
            <div className="filters"><label>Project <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="">All projects</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>{page !== 'Board' && <label>Status <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>}
            <label>Priority <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
              <option value="">All priorities</option>{taskPriorities.map(priority => <option key={priority}>{priority}</option>)}
            </select></label>{department && !readOnly && (!restrictedProject || projects.length > 0) && <button className="text-button" onClick={() => projects.length ? openTask() : openProject()}><Plus size={16} />{projects.length ? 'New task' : 'New project'}</button>}{roster && <label>Assignee <select value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)}>
              <option value="">All assignees</option><option value={unassigned}>Unassigned</option>
              {roster.map(member => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}
            </select></label>}
            <label className="blocked-filter"><input type="checkbox" checked={blockedOnly} onChange={event => setBlockedOnly(event.target.checked)} /> Blocked only</label>
            {openOnly && <button className="text-button" onClick={() => setOpenOnly(false)}>Show completed tasks</button>}
            <span>{filteredTasks.length} tasks</span>{overdueOnly && <button className="text-button" onClick={() => setOverdueOnly(false)}>Clear overdue filter <X size={14} /></button>}</div>
            {page === 'Timeline' ? <TaskTimeline tasks={filteredTasks} today={today} onOpen={openTask} /> : page === 'Board' ? <TaskBoard tasks={filteredTasks} readOnly={readOnly} onEdit={openTask} details={task => <>
              <p className="dev-muted">{taskContext(task)}</p><p className="dev-muted">{formatDate(task.due)}</p>
              {!!task.checklist?.length && <p className="dev-muted">{checklistProgress(task.checklist)}</p>}
              {blockedTask(task,tasksById) && <p className="dev-muted"><span className="status in-review">Blocked</span></p>}
            </>} onMove={(id,status) => {
              if (!readOnly) setData(previous => ({...previous,tasks:previous.tasks.map(task => task.id === id ? {...task,status} : task)}))
            }} /> : <div className="panel task-list">{(page === 'Calendar' ? [...filteredTasks].sort((first,second) => (first.due || '9999').localeCompare(second.due || '9999')) : filteredTasks).map(renderTask)}{!filteredTasks.length && <p className="empty">No tasks match these filters.</p>}</div>}
          </section>}
        </>}
      </main>
    </div>
    {templatesOpen && !readOnly && <TaskTemplates projects={projects} initialProject={projectFilter}
      onClose={() => setTemplatesOpen(false)} onApply={(projectId, additions) => {
        setData(previous => ({...previous,tasks:[...previous.tasks,...additions]}))
        setTemplatesOpen(false)
        navigate('Tasks',projectId)
      }} />}
    {readOnly && modal === 'task' && editingTask && <dialog ref={element => {if (element && !element.open) element.showModal()}} onCancel={() => setModal(null)} aria-labelledby="task-details-title">
      <div className="dialog-heading"><h2 id="task-details-title">{editingTask.title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => setModal(null)}><X size={20} /></button></div>
      <p className="dev-muted">{[taskContext(editingTask),editingTask.status,editingTask.priority ?? 'Normal',taskDateLabel(editingTask)].filter(Boolean).join(' · ')}</p>
      {editingTask.description && <p className="task-description">{editingTask.description}</p>}
      <TaskDependencies tasks={tasksById} project={editingTask.project} task={editingTask} selected={[]} />
      <TaskChecklist items={editingTask.checklist ?? []} />
      {taskCollaboration(editingTask)}
    </dialog>}
    {modal && !readOnly && <dialog ref={element => {if (element && !element.open) element.showModal()}} onCancel={() => setModal(null)} aria-labelledby="editor-title">
      <form onSubmit={saveItem}>
        <div className="dialog-heading"><h2 id="editor-title">{(modal === 'task' ? editingTask : editingProject) ? 'Edit' : 'New'} {modal}</h2><button type="button" className="icon-button" aria-label="Close" onClick={() => setModal(null)}><X size={20} /></button></div>
        <label>{modal === 'project' ? 'Project name' : 'Task title'}<input name="name" required maxLength={100} defaultValue={modal === 'project' ? editingProject?.name : editingTask?.title} autoFocus /></label>
        {modal === 'project' ? <><label>Department<select name="department" defaultValue={editingProject?.department ?? (department || departments[0])}>{departments.map(name => <option key={name}>{name}</option>)}</select></label><label>Description<textarea name="description" maxLength={250} defaultValue={editingProject?.description} /></label>{(page === 'Development' || editingProject?.repository || editingProject?.department === 'Development') && <label>GitHub repository URL<input type="url" name="repository" placeholder="https://github.com/owner/repository" defaultValue={editingProject?.repository} onChange={event => event.currentTarget.setCustomValidity('')} /></label>}</> : <><label>Project<select name="project" required value={taskProject} onChange={event => {
          const id = event.target.value
          setTaskProject(id)
          setDependencyError('')
        }}>{data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Status<select name="status" defaultValue={editingTask?.status ?? 'To do'}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label><label>Priority<select name="priority" defaultValue={editingTask?.priority ?? 'Normal'}>{taskPriorities.map(priority => <option key={priority}>{priority}</option>)}</select></label><label>Start date<input name="start" type="date" defaultValue={editingTask?.start} onInput={event => {
          const due = event.currentTarget.form?.querySelector<HTMLInputElement>('input[name="due"]')
          due?.setCustomValidity('')
        }} /></label><label>Due date<input name="due" type="date" defaultValue={editingTask?.due} onInput={event => event.currentTarget.setCustomValidity('')} /></label>{roster && <label>Assignee<select name="assignee" defaultValue={editingTask?.assignee ?? ''}>
          <option value="">Unassigned</option>{roster.map(member => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}
        </select></label>}{!team && data.projects.some(project => project.id === taskProject && project.department === 'Development') && <label>Sprint<select name="sprint" key={taskProject} defaultValue={editingTask?.project === taskProject ? editingTask.sprint ?? '' : ''}><option value="">Backlog</option>{data.development.filter(record => record.kind === 'sprint' && record.project === taskProject).map(record => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>}</>}
        {modal === 'task' && <>
          <label>Task description<textarea name="description" rows={4} maxLength={4000} defaultValue={editingTask?.description} /></label>
          <TaskDependencies tasks={tasksById} project={taskProject} task={editingTask} selected={dependsOn} onChange={ids => {
            setDependsOn(ids)
            setDependencyError('')
          }} />
          {dependencyError && <p role="alert" className="dev-muted">{dependencyError}</p>}
          <TaskChecklist items={checklist} onChange={setChecklist} />
        </>}
        <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit">Save {modal}</button></div>
      </form>
      {modal === 'task' && editingTask && taskCollaboration(editingTask)}
    </dialog>}
  </div>
}

createRoot(document.getElementById('root')!).render(<CloudGate render={(account, openAccount) => <App key={account?.team?.id ?? account?.owner ?? 'demo'} account={account} openAccount={openAccount} />} />)
