import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ChecklistItem } from './data'

const maxItems = 30
const maxTitle = 140

export function checklistProgress(items: ChecklistItem[] = []) {
  return items.length ? items.filter(item => item.done).length + '/' + items.length + ' checklist items done' : ''
}

export function TaskChecklist({items,onChange}: {items: ChecklistItem[]; onChange?: (items: ChecklistItem[]) => void}) {
  const [newTitle,setNewTitle] = useState('')
  const progress = checklistProgress(items)

  function addItem() {
    const title = newTitle.trim()
    if (!onChange || !title || items.length >= maxItems) return
    onChange([...items,{id:crypto.randomUUID(),title,done:false}])
    setNewTitle('')
  }

  return <section className="task-checklist" aria-label="Task checklist">
    <h3>Checklist</h3>
    <p className="dev-muted">{progress || 'No checklist items yet.'}</p>
    {items.length > 0 && <ul>{items.map(item => onChange ? <li key={item.id}>
      <input type="checkbox" aria-label={'Completed: ' + item.title} checked={item.done} onChange={event => onChange(items.map(entry => entry.id === item.id ? {...entry,done:event.target.checked} : entry))} />
      <span>{item.title}</span>
      <button type="button" className="icon-button compact" aria-label={'Remove ' + item.title} onClick={() => onChange(items.filter(entry => entry.id !== item.id))}><X size={14} /></button>
    </li> : <li key={item.id}><span>{item.title}</span><span className="status">{item.done ? 'Done' : 'Open'}</span></li>)}</ul>}
    {onChange && items.length < maxItems && <div className="checklist-entry">
      <input aria-label="New checklist item" value={newTitle} maxLength={maxTitle} placeholder="Add a checklist item" onChange={event => setNewTitle(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault();addItem()}
      }} />
      <button type="button" className="secondary" disabled={!newTitle.trim()} onClick={addItem}><Plus size={15} /> Add item</button>
    </div>}
    {onChange && items.length >= maxItems && <p className="dev-muted">This checklist has reached 30 items.</p>}
  </section>
}
