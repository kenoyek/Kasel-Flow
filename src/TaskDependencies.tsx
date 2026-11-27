import { dependsOnTask, taskDependencies } from './task-dependencies'
import type { Task } from './data'

export function TaskDependencies({tasks,project,task,selected,onChange}: {
  tasks: Map<string, Task>; project: string; task: Task | null; selected: string[]; onChange?: (ids:string[]) => void
}) {
  const links = task ? taskDependencies(task,tasks) : []
  if (!onChange) return <section className="task-checklist" aria-label="Task dependencies">
    <h3>Depends on</h3>
    {links.length ? <ul>{links.map(dependency => <li key={dependency.id}><span>{dependency.title}</span><span className="status">{dependency.status}</span></li>)}</ul>
      : <p className="dev-muted">No dependencies.</p>}
  </section>

  const candidates = [...tasks.values()].filter(item => item.project === project && item.id !== task?.id)
  const movingWithLinks = task && task.project !== project &&
    (links.length > 0 || [...tasks.values()].some(other => taskDependencies(other,tasks).some(link => link.id === task.id)))
  return <section className="task-checklist" aria-label="Task dependencies">
    <h3>Depends on</h3>
    {movingWithLinks && <p className="dev-muted">Saving this move will remove dependency links to the previous project.</p>}
    {candidates.length ? <ul className="dependency-options">{candidates.map(item => {
      const circular = task ? dependsOnTask(item,task.id,tasks) : false
      return <li key={item.id}>
        <label><input type="checkbox" checked={selected.includes(item.id)} disabled={circular && !selected.includes(item.id)} onChange={event => {
          onChange(event.target.checked ? [...selected,item.id] : selected.filter(id => id !== item.id))
        }} /> {item.title}</label>
        <span className="status">{circular ? 'Circular link' : item.status}</span>
      </li>
    })}</ul> : <p className="dev-muted">Add another task in this project to link it here.</p>}
  </section>
}
