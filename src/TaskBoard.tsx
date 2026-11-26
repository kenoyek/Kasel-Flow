import { useState, type DragEvent, type ReactNode } from 'react'
import { statuses, taskPriorities, type Status, type Task } from './data'

const taskDragType = 'application/x-kasel-task'

export function TaskBoard({tasks, readOnly, details, onEdit, onMove}: {
  tasks: Task[]
  readOnly: boolean
  details: (task: Task) => ReactNode
  onEdit: (task: Task) => void
  onMove: (id: string, status: Status) => void
}) {
  const [dragged, setDragged] = useState('')
  const [announcement, setAnnouncement] = useState('')

  function move(task: Task, status: Status) {
    if (readOnly || task.status === status) return
    onMove(task.id,status)
    setAnnouncement(task.title + ' moved to ' + status + '.')
  }

  function drop(event: DragEvent, status: Status) {
    event.preventDefault()
    const id = event.dataTransfer.getData(taskDragType)
    const task = tasks.find(item => item.id === id && item.id === dragged)
    if (task) move(task,status)
    setDragged('')
  }

  return <>
    <p className="board-announcement" role="status">{announcement}</p>
    <div className="task-board" aria-label="Task board">{statuses.map(status => {
      const column = tasks.filter(task => task.status === status)
        .sort((first,second) =>
          taskPriorities.indexOf(first.priority ?? 'Normal') - taskPriorities.indexOf(second.priority ?? 'Normal') ||
          (first.due || '9999').localeCompare(second.due || '9999'))
      return <section className={dragged && !readOnly ? 'board-column accepts-task' : 'board-column'} key={status} aria-label={status}
        onDragOver={event => {if (!readOnly && dragged) event.preventDefault()}}
        onDrop={readOnly ? undefined : event => drop(event,status)}>
        <h2>{status} <span>{column.length}</span></h2>
        {column.length ? column.map(task => <article key={task.id} className="panel board-task" draggable={!readOnly}
          onDragStart={event => {
            if (readOnly) return
            event.dataTransfer.setData(taskDragType,task.id)
            event.dataTransfer.effectAllowed = 'move'
            setDragged(task.id)
          }}
          onDragEnd={() => setDragged('')}>
          <button type="button" className="text-button board-task-title" onClick={() => onEdit(task)}>{task.title}</button>
          {details(task)}
          <div className="board-task-meta">
            <span className="status">{task.priority ?? 'Normal'}</span>
            {!readOnly && <select aria-label={'Move ' + task.title} value={task.status} onChange={event => move(task,event.target.value as Status)}>
              {statuses.map(value => <option key={value} value={value}>{value}</option>)}
            </select>}
          </div>
        </article>) : <p className="empty">No tasks</p>}
      </section>
    })}</div>
  </>
}
