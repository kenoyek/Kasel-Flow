import type { Task } from './data'
import type { TaskAssignee } from './team-workspace'

export const unassigned = 'unassigned'

export function TeamWorkload({tasks, members, today, openTasks}: {
  tasks: Task[]; members: TaskAssignee[]; today: string; openTasks: (assignee: string) => void
}) {
  const rows = [...members.map(member => ({id:member.user_id, name:member.label})), {id:unassigned, name:'Unassigned'}]
  return <section className="panel" aria-label="Team workload">
    <div className="panel-heading"><div><h2>Open work by assignee</h2><p>Includes all tasks that are still open.</p></div></div>
    <div className="workload-list">
      {rows.map(row => {
        const open = tasks.filter(task => (task.assignee ?? unassigned) === row.id && task.status !== 'Done')
        const overdue = open.filter(task => task.due && task.due < today)
        return <button className="task-row workload-row" key={row.id} onClick={() => openTasks(row.id)}>
          <strong>{row.name}</strong>
          <span>{open.length} open</span>
          <span className="due">{overdue.length} overdue</span>
        </button>
      })}
    </div>
  </section>
}
