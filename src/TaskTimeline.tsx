import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Task } from './data'

const monthFormat = new Intl.DateTimeFormat('en-NG',{month:'long',year:'numeric',timeZone:'UTC'})
const dayFormat = new Intl.DateTimeFormat('en-NG',{month:'short',day:'numeric',timeZone:'UTC'})

function monthDate(month: string, offset = 0) {
  const date = new Date(month + '-01T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date
}

const toDate = (date: Date) => date.toISOString().slice(0,10)
const formatDay = (date: string) => dayFormat.format(new Date(date + 'T00:00:00Z'))

export function taskDateLabel(task: Task) {
  if (task.start && task.due && task.start !== task.due) return formatDay(task.start) + ' – ' + formatDay(task.due)
  if (task.due) return 'Due ' + formatDay(task.due)
  if (task.start) return 'Starts ' + formatDay(task.start)
  return 'Unscheduled'
}

export function TaskTimeline({tasks,today,onOpen}: {tasks:Task[];today:string;onOpen:(task:Task)=>void}) {
  const [month,setMonth] = useState(today.slice(0,7))
  const first = month + '-01'
  const last = toDate(new Date(monthDate(month,1).getTime() - 86400000))
  const days = Number(last.slice(-2))
  const scheduled = tasks.flatMap(task => {
    const start = task.start || task.due
    const end = task.due || task.start
    if (!start || !end || start > last || end < first) return []
    return [{task, start: start < first ? 1 : Number(start.slice(-2)), end: end > last ? days : Number(end.slice(-2))}]
  }).sort((a,b) => a.start - b.start || a.end - b.end || a.task.title.localeCompare(b.task.title))
  const unscheduled = tasks.filter(task => !task.start && !task.due)

  function shift(offset: number) {
    setMonth(toDate(monthDate(month,offset)).slice(0,7))
  }

  return <section className="panel" aria-label="Project timeline">
    <div className="panel-heading timeline-heading">
      <div><h2>{monthFormat.format(monthDate(month))}</h2><p>{scheduled.length} scheduled {scheduled.length === 1 ? 'task' : 'tasks'}</p></div>
      <div className="creative-actions timeline-controls">
        <button className="icon-button compact" type="button" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <button className="secondary" type="button" onClick={() => setMonth(today.slice(0,7))}>This month</button>
        <button className="icon-button compact" type="button" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={16} /></button>
      </div>
    </div>
    {scheduled.length ? <div className="timeline-scroll" tabIndex={0} aria-label="Scheduled tasks by day">
      <div className="timeline-table">
        <div className="timeline-row timeline-axis" aria-hidden="true">
          <span>Task</span>
          <div className="timeline-days" style={{gridTemplateColumns:`repeat(${days}, 1fr)`}}>
            {[1,8,15,22,29].filter(day => day <= days).map(day => <span key={day} style={{gridColumn:day}}>{day}</span>)}
          </div>
        </div>
        {scheduled.map(({task,start,end}) => <div className="timeline-row" key={task.id}>
          <div className="timeline-task">
            <button type="button" className="text-button" onClick={() => onOpen(task)}>{task.title}</button>
            <small>{taskDateLabel(task)} · {task.status}</small>
          </div>
          <div className="timeline-days" style={{gridTemplateColumns:`repeat(${days}, 1fr)`}} aria-hidden="true">
            <span className={task.status === 'Done' ? 'timeline-bar complete' : 'timeline-bar'} style={{gridColumn:`${start} / ${end + 1}`}} />
          </div>
        </div>)}
      </div>
    </div> : <p className="empty">No scheduled tasks in this month.</p>}
    {unscheduled.length > 0 && <details className="timeline-unscheduled">
      <summary>Unscheduled tasks ({unscheduled.length})</summary>
      <ul>{unscheduled.map(task => <li key={task.id}><button type="button" className="text-button" onClick={() => onOpen(task)}>{task.title}</button></li>)}</ul>
    </details>}
  </section>
}
