import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Priority, Project, Task } from './data'

type TemplateTask = {title:string; description:string; checklist:string[]; priority:Priority; day:number}
type Template = {name:string; tasks:TemplateTask[]}

const templates: Template[] = [
  {name:'Software release',tasks:[
    {title:'Confirm release scope',description:'Confirm what is shipping and record any known exclusions.',checklist:['Agree on scope','Confirm release owner'],priority:'High',day:0},
    {title:'Run release checks',description:'Verify the release candidate in staging before deployment.',checklist:['Run smoke tests','Review known issues','Confirm rollback steps'],priority:'High',day:2},
    {title:'Deploy and verify',description:'Deploy the reviewed release and verify production behavior.',checklist:['Deploy release','Run production smoke tests','Monitor errors'],priority:'High',day:4},
    {title:'Publish release notes',description:'Share the release summary and any follow-up actions.',checklist:['Write a summary','Share with stakeholders'],priority:'Normal',day:5},
  ]},
  {name:'Content campaign',tasks:[
    {title:'Define campaign brief',description:'Agree on audience, message, channels, and success measures.',checklist:['Confirm audience','Agree on campaign goal'],priority:'High',day:0},
    {title:'Draft campaign assets',description:'Prepare copy and creative for the selected channels.',checklist:['Draft channel copy','Prepare artwork'],priority:'Normal',day:2},
    {title:'Review and approve creative',description:'Gather stakeholder feedback and record final decisions.',checklist:['Share deliverables','Resolve review feedback'],priority:'High',day:4},
    {title:'Publish and check performance',description:'Publish approved content and capture the initial results.',checklist:['Confirm publication','Record initial performance'],priority:'Normal',day:6},
  ]},
  {name:'Client kickoff',tasks:[
    {title:'Gather client requirements',description:'Record the client’s goals, deliverables, and constraints.',checklist:['Confirm goals','Record constraints'],priority:'High',day:0},
    {title:'Prepare the project plan',description:'Outline scope, milestones, and who owns each deliverable.',checklist:['Draft milestones','Assign responsibilities'],priority:'Normal',day:2},
    {title:'Hold the kickoff',description:'Review the plan with the client and agree on next steps.',checklist:['Share agenda','Record decisions','Confirm next steps'],priority:'High',day:4},
  ]},
]

function offsetDate(start:string, days:number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > '9999-12-25') return ''
  const date = new Date(start + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0,10)
}

export function TaskTemplates({projects,initialProject,onClose,onApply}: {
  projects:Project[]; initialProject:string; onClose:()=>void; onApply:(projectId:string,tasks:Task[])=>void
}) {
  const [project,setProject] = useState(projects.some(item => item.id === initialProject) ? initialProject : projects[0]?.id ?? '')
  const [templateIndex,setTemplateIndex] = useState(0)
  const [excluded,setExcluded] = useState<number[]>([])
  const [start,setStart] = useState('')
  const template = templates[templateIndex]
  const count = template.tasks.length - excluded.length

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!count || !projects.some(item => item.id === project)) return
    const tasks: Task[] = template.tasks.flatMap((task,index) => excluded.includes(index) ? [] : [{
      id:crypto.randomUUID(), project, title:task.title, description:task.description, priority:task.priority,
      due:offsetDate(start,task.day), status:'To do',
      checklist:task.checklist.map(title => ({id:crypto.randomUUID(),title,done:false})),
    }])
    onApply(project,tasks)
  }

  return <dialog ref={node => {if (node && !node.open) node.showModal()}} onCancel={onClose} aria-labelledby="task-templates-heading">
    <form onSubmit={apply}>
      <div className="dialog-heading"><h2 id="task-templates-heading">Add tasks from a template</h2>
        <button className="icon-button" type="button" aria-label="Close templates" onClick={onClose}><X size={20} /></button></div>
      <label>Destination project<select value={project} onChange={event => setProject(event.target.value)} required>
        {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Template<select value={templateIndex} onChange={event => {setTemplateIndex(Number(event.target.value));setExcluded([])}}>
        {templates.map((item,index) => <option key={item.name} value={index}>{item.name}</option>)}
      </select></label>
      <label>Schedule from (optional)<input type="date" value={start} max="9999-12-25" onChange={event => setStart(event.target.value)} /></label>
      <section className="template-preview" aria-label="Template preview">
        <h3>Tasks to add</h3>
        {template.tasks.map((task,index) => <div className="template-task" key={task.title}>
          <label><input type="checkbox" checked={!excluded.includes(index)} onChange={event => {
            setExcluded(event.target.checked ? excluded.filter(item => item !== index) : [...excluded,index])
          }} /> {task.title}</label>
          <small>{task.priority} priority · {task.checklist.length} checklist items{start && ' · Due ' + offsetDate(start,task.day)}</small>
          <ul>{task.checklist.map(item => <li key={item}>{item}</li>)}</ul>
        </div>)}
      </section>
      <div className="dialog-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!count || !project}>Add {count} {count === 1 ? 'task' : 'tasks'}</button></div>
    </form>
  </dialog>
}
