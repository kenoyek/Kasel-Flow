import { useState, type ReactNode } from 'react'
import { Bell, ClipboardCheck } from 'lucide-react'
import { taskPriorities, type Task } from './data'
import { blockedTask } from './task-dependencies'
import type { TaskMention } from './TaskDiscussion'
import type { ReviewNotice } from './TaskReviews'

type Props = {
  owner: string
  tasks: Map<string,Task>
  today: string
  mentions: TaskMention[]
  reviews: ReviewNotice[]
  renderTask: (task:Task) => ReactNode
  openMention: (mention:TaskMention) => void
  openReview: (review:ReviewNotice) => void
}

export function MyWork({owner,tasks,today,mentions,reviews,renderTask,openMention,openReview}: Props) {
  const [filter,setFilter] = useState('Open')
  const assigned = [...tasks.values()].filter(task => task.assignee === owner)
  const open = assigned.filter(task => task.status !== 'Done')
  const sections = [
    {name:'Open',tasks:open,empty:'No open tasks are assigned to you.'},
    {name:'Overdue',tasks:open.filter(task => task.due && task.due < today),empty:'You have no overdue assigned tasks.'},
    {name:'Blocked',tasks:open.filter(task => blockedTask(task,tasks)),empty:'You have no blocked assigned tasks.'},
    {name:'Done',tasks:assigned.filter(task => task.status === 'Done'),empty:'No completed tasks are assigned to you.'},
  ]
  const current = sections.find(section => section.name === filter) ?? sections[0]
  const visible = [...current.tasks].sort((a,b) =>
    (a.due || '9999').localeCompare(b.due || '9999') ||
    taskPriorities.indexOf(a.priority ?? 'Normal') - taskPriorities.indexOf(b.priority ?? 'Normal') ||
    a.title.localeCompare(b.title))
  const unread = mentions.filter(mention => !mention.read_at)

  return <div className="my-work">
    <section className="panel" aria-label="Assigned tasks">
      <div className="panel-heading"><div><h2>Assigned tasks</h2><p>Tasks assigned to you in this workspace.</p></div></div>
      <div className="dev-views my-work-filters" aria-label="Assigned task filters">
        {sections.map(section => <button type="button" key={section.name} aria-pressed={current.name === section.name}
          onClick={() => setFilter(section.name)}>{section.name} <span>{section.tasks.length}</span></button>)}
      </div>
      {visible.length ? visible.map(renderTask) : <p className="empty">{current.empty}</p>}
    </section>

    <div className="my-work-inbox">
      <section className="panel" aria-label="Deliverables to review">
        <div className="panel-heading"><h2>Deliverables to review</h2><span className="status">{reviews.length}</span></div>
        {reviews.length ? reviews.map(review => <button type="button" className="task-row inbox-row" key={review.id} onClick={() => openReview(review)}>
          <ClipboardCheck className="task-check" /><span className="task-name"><strong>{review.title}</strong><small>{review.task_title}</small></span>
        </button>) : <p className="empty">No pending deliverable reviews.</p>}
      </section>
      <section className="panel" aria-label="Unread mentions">
        <div className="panel-heading"><h2>Unread mentions</h2><span className="status">{unread.length}</span></div>
        {unread.length ? unread.map(mention => <button type="button" className="task-row inbox-row" key={mention.comment_id} onClick={() => openMention(mention)}>
          <Bell className="task-check" /><span className="task-name"><strong>{mention.task_title}</strong><small>{mention.author_label} mentioned you</small></span>
        </button>) : <p className="empty">No unread mentions.</p>}
      </section>
    </div>
  </div>
}
