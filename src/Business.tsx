import { useState, type FormEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { businessKinds, clientRecords, financial, money, paid, parseAmount, shareable, type BusinessData, type BusinessKind, type BusinessRecord, type Client } from './business-data'
import { isAssetUrl, lagosDate } from './creative-data'
import type { Project } from './data'

type Props = { data: BusinessData; projects: Project[]; update: (patch: (data: BusinessData) => BusinessData) => void }
type View = BusinessKind | 'clients' | 'portal' | 'profit'
type Editor = { kind: BusinessKind; record?: BusinessRecord; client?: string; fromPortal?: boolean }

const tabs: { view: View; title: string }[] = [
  {view:'clients',title:'Clients'}, {view:'portal',title:'Client portal preview'},
  ...Object.entries(businessKinds).map(([view, kind]) => ({view:view as BusinessKind,title:kind.label})),
  {view:'profit',title:'Profitability'},
]

function fields(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  return (name: string) => String(form.get(name) ?? '').trim()
}

function invalid(event: FormEvent<HTMLFormElement>, name: string, reason: string) {
  const input = event.currentTarget.elements.namedItem(name) as HTMLInputElement
  input.setCustomValidity(reason)
  input.reportValidity()
}

function clearError(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.setCustomValidity('')
}

function upsert<T extends {id: string}>(items: T[], item: T) {
  return items.some(existing => existing.id === item.id) ? items.map(existing => existing.id === item.id ? item : existing) : [...items, item]
}

export function Business({data, projects, update}: Props) {
  const [view, setView] = useState<View>('clients')
  const [selected, setSelected] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [clientEdit, setClientEdit] = useState<Client | 'new' | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [payment, setPayment] = useState<BusinessRecord | null>(null)
  const [editorClient, setEditorClient] = useState('')
  const client = data.clients.find(item => item.id === selected)
  const portalClient = client ?? data.clients[0]
  const spec = view in businessKinds ? businessKinds[view as BusinessKind] : null
  const editorSpec = editor ? businessKinds[editor.kind] : null
  const portalProjects = data.clients.find(item => item.id === editorClient)?.projects ?? []
  const scoped = data.records.filter(record => (!selected || record.client === selected) && (!projectFilter || record.project === projectFilter))

  function openRecord(next: Editor) {
    setEditorClient(next.record?.client ?? next.client ?? selected)
    setEditor(next)
  }

  function saveClient(event: FormEvent<HTMLFormElement>) {
    const get = fields(event)
    if (!get('name')) return invalid(event, 'name', 'Enter a client name.')
    const previous = clientEdit === 'new' ? null : clientEdit
    const grants = new FormData(event.currentTarget).getAll('project').map(String)
    const item = {id:previous?.id ?? crypto.randomUUID(), name:get('name'), email:get('email'), contact:get('contact'), projects:grants}
    update(current => ({...current, clients:upsert(current.clients, item)}))
    setSelected(item.id)
    setClientEdit(null)
  }

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    const get = fields(event)
    if (!editor) return
    if (editor.fromPortal && get('project') && !portalProjects.includes(get('project'))) return
    const {kind, record:previous, fromPortal} = editor
    if (!get('title')) return invalid(event, 'title', 'Enter a title.')
    const amount = financial.has(kind) ? parseAmount(get('amount')) : 0
    if (amount === null || (financial.has(kind) && amount <= 0)) return invalid(event, 'amount', 'Enter a positive NGN amount with up to two decimals.')
    if (get('url') && !isAssetUrl(get('url'))) return invalid(event, 'url', 'Enter an HTTPS URL without embedded credentials.')
    const lockedInvoice = previous?.kind === 'invoice' && (previous.stage !== 'Draft' || previous.payments.length > 0)
    const stage = fromPortal ? businessKinds[kind].stages[0] : get('stage')
    const item: BusinessRecord = {
      id:previous?.id ?? crypto.randomUUID(), kind, title:get('title'), notes:get('notes'), stage,
      client:lockedInvoice ? previous.client : editorClient, project:lockedInvoice ? previous.project : get('project'),
      date:get('date'), amount:lockedInvoice ? previous.amount : amount, currency:'NGN', url:get('url'),
      shared:shareable.has(kind) && (fromPortal || get('shared') === 'on'),
      payments:previous?.payments ?? [],
      history:[...(previous?.history ?? []), {at:new Date().toISOString(), action:!previous ? 'Created · ' + stage : previous.stage === stage ? 'Updated' : previous.stage + ' → ' + stage}],
    }
    update(current => ({...current, records:upsert(current.records, item)}))
    setEditor(null)
  }

  function addPayment(event: FormEvent<HTMLFormElement>) {
    const get = fields(event)
    if (!payment) return
    const amount = parseAmount(get('amount'))
    if (amount === null || amount <= 0 || amount > payment.amount - paid(payment)) return invalid(event, 'amount', 'Enter a positive amount up to the outstanding balance.')
    update(current => ({...current, records:current.records.map(record => {
      if (record.id !== payment.id || record.stage !== 'Issued' || amount > record.amount - paid(record)) return record
      return {...record, payments:[...record.payments, {amount, date:get('date'), reference:get('reference')}],
        history:[...record.history, {at:new Date().toISOString(), action:'Payment recorded · ' + money(amount)}]}
    })}))
    setPayment(null)
  }

  function convertLead(record: BusinessRecord) {
    const item = {id:crypto.randomUUID(), name:record.title, email:'', contact:'', projects:[]}
    update(current => ({clients:[...current.clients, item], records:current.records.map(existing => existing.id !== record.id ? existing : {
      ...existing, client:item.id, stage:'Won', history:[...existing.history,{at:new Date().toISOString(), action:'Converted to client'}],
    })}))
    setSelected(item.id)
    setView('clients')
  }

  const records = spec ? scoped.filter(record => record.kind === view) : []
  const cash = scoped.filter(record => record.kind === 'invoice' && record.stage === 'Issued').reduce((sum, record) => sum + paid(record), 0)
  const costs = scoped.filter(record => (record.kind === 'expense' || record.kind === 'payroll') && record.stage === 'Paid').reduce((sum, record) => sum + record.amount, 0)
  const portalItems = portalClient ? clientRecords(data, portalClient) : []
  function decide(record: BusinessRecord, stage: string) {
    update(current => ({...current, records:current.records.map(item => item.id === record.id && item.stage === 'Pending'
      ? {...item, stage, history:[...item.history,{at:new Date().toISOString(),action:'Portal preview · ' + stage}]}
      : item)}))
  }

  function renderRecord(record: BusinessRecord, preview = false) {
    const received = paid(record)
    const balance = record.amount - received
    const label = record.kind === 'invoice' && record.stage === 'Issued' && received ? (balance ? 'Partially paid' : 'Paid') : record.stage
    return <article className="panel dev-card" key={record.id}>
      <div className="dev-card-heading"><h3>{record.title}</h3>
        {!preview && <button className="text-button" onClick={() => openRecord({kind:record.kind, record})} aria-label={'Edit ' + record.title}>Edit</button>}
      </div>
      <div className="dev-meta"><span className="status">{label}</span>
        {record.date && <time dateTime={record.date}>{record.date}</time>}
        {record.project && <span>{projects.find(item => item.id === record.project)?.name}</span>}
        {!preview && record.client && <span>{data.clients.find(item => item.id === record.client)?.name}</span>}
      </div>
      {record.notes && <p className="dev-details">{record.notes}</p>}
      {financial.has(record.kind) && <p className="dev-details">{money(record.amount)}</p>}
      {isAssetUrl(record.url) && <p className="dev-details"><a href={record.url} target="_blank" rel="noreferrer">Open {businessKinds[record.kind].name}</a></p>}
      {record.kind === 'invoice' && record.stage === 'Issued' && <p className="dev-muted">{money(received)} paid · {money(balance)} outstanding</p>}
      {!preview && record.kind === 'invoice' && record.stage === 'Issued' && balance > 0 && <button className="text-button" onClick={() => setPayment(record)}>Record payment</button>}
      {!preview && record.kind === 'lead' && !record.client && <button className="text-button" onClick={() => convertLead(record)}>Convert to client</button>}
      {preview && record.kind === 'approval' && record.stage === 'Pending' && <div className="creative-actions">
        <button className="secondary" onClick={() => decide(record, 'Approved')}>Approve</button>
        <button className="secondary" onClick={() => decide(record, 'Changes requested')}>Request changes</button>
      </div>}
      {!preview && <details className="creative-history"><summary>Activity</summary>
        {record.payments.length > 0 && <ul>{record.payments.map((entry,index) => <li key={index}>{entry.date} · {money(entry.amount)}{entry.reference && ' · ' + entry.reference}</li>)}</ul>}
        <ul>{[...record.history].reverse().map((entry,index) => <li key={index}><time dateTime={entry.at}>{entry.at.slice(0,10)}</time> · {entry.action}</li>)}</ul>
      </details>}
    </article>
  }

  const lockedInvoice = editor?.record?.kind === 'invoice' && editor.record.stage !== 'Draft'
  const stages = editorSpec?.stages.filter(stage => !lockedInvoice || (stage !== 'Draft' &&
    (editor.record?.stage !== 'Void' || stage === 'Void') && (!editor.record?.payments.length || stage === 'Issued')))

  return <section className="development creative" aria-label="Client and business workspace">
    <nav className="dev-views" aria-label="Business views">{tabs.map(tab => (
      <button key={tab.view} aria-pressed={view === tab.view} onClick={() => {setView(tab.view);setProjectFilter('')}}>{tab.title}</button>
    ))}</nav>
    <div className="section-heading"><h2>{tabs.find(tab => tab.view === view)?.title}</h2>
      {data.clients.length > 0 && <label className="dev-status-filter">Client <select value={view === 'portal' ? portalClient?.id ?? '' : selected} onChange={event => setSelected(event.target.value)}>
        {view !== 'portal' && <option value="">All clients</option>}
        {data.clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      {view === 'profit' && <label className="dev-status-filter">Project <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
        <option value="">All projects</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></label>}
      {view === 'clients' && <button className="primary" onClick={() => setClientEdit('new')}><Plus size={16} /> New client</button>}
      {spec && <button className="primary" onClick={() => openRecord({kind:view as BusinessKind})}><Plus size={16} /> New {spec.name}</button>}
    </div>

    {view === 'clients' && <div className="dev-records">
      {(client ? [client] : data.clients).map(item => <article key={item.id} className="panel dev-card">
        <div className="dev-card-heading"><h3>{item.name}</h3><button className="text-button" aria-label={'Edit ' + item.name} onClick={() => setClientEdit(item)}>Edit</button></div>
        {item.contact && <p className="dev-details">{item.contact}</p>}{item.email && <p className="dev-muted">{item.email}</p>}
        <p className="dev-muted">{item.projects.length} shared projects</p>
      </article>)}
      {!data.clients.length && <p className="panel empty">Create a client or convert a lead to get started.</p>}
    </div>}
    {spec && <div className="dev-records">{records.map(record => renderRecord(record))}
      {!records.length && <p className="panel empty">No {spec.label.toLowerCase()} in this view.</p>}
    </div>}
    {view === 'profit' && <article className="panel dev-card">
      <h3>Cash-based profitability</h3><p className="dev-muted">Recorded invoice payments minus paid expenses and payroll in this selection.</p>
      <dl className="creative-metrics"><div><dt>Cash received</dt><dd>{money(cash)}</dd></div>
        <div><dt>Paid costs</dt><dd>{money(costs)}</dd></div><div><dt>Net cash</dt><dd>{money(cash - costs)}</dd></div>
      </dl>
    </article>}
    {view === 'portal' && (portalClient ? <section className="client-preview" aria-label="Client portal">
      <div className="panel dev-card"><h3>{portalClient.name} · Client workspace</h3>
        <p className="dev-muted">Staff preview using this browser’s demo data. Actions here update the local workspace.</p>
        <div className="creative-actions">{(['request','issue','message'] as const).map(kind => <button key={kind} className="secondary" onClick={() => openRecord({kind,client:portalClient.id,fromPortal:true})}>
          {kind === 'message' ? 'Post message' : kind === 'issue' ? 'Report issue' : 'Submit request'}
        </button>)}</div>
      </div>
      <h3>Shared projects</h3>
      <div className="dev-records">{projects.filter(project => portalClient.projects.includes(project.id)).map(project => {
        const milestones = portalItems.filter(record => record.kind === 'milestone' && record.project === project.id)
        return <article className="panel dev-card" key={project.id}><h3>{project.name}</h3>
          <p className="dev-muted">{milestones.filter(record => record.stage === 'Complete').length} of {milestones.length} shared milestones complete</p></article>
      })}
      {!portalClient.projects.length && <p className="panel empty">No projects shared yet.</p>}</div>
      {(['milestone','request','issue','approval','deliverable','invoice','message'] as const).map(kind => {
        const items = portalItems.filter(record => record.kind === kind).sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999'))
        return items.length > 0 && <section className="client-preview-section" key={kind}>
          <h3>{kind === 'milestone' ? 'Milestone calendar' : businessKinds[kind].label}</h3>
          <div className="dev-records">{items.map(record => renderRecord(record, true))}</div>
        </section>
      })}
    </section> : <p className="panel empty">Create a client before opening the portal preview.</p>)}

    {clientEdit && <BusinessDialog title={clientEdit === 'new' ? 'New client' : 'Edit client'} onSubmit={saveClient} onClose={() => setClientEdit(null)}>
      <label>Client name<input name="name" required maxLength={120} defaultValue={clientEdit === 'new' ? '' : clientEdit.name} onInput={clearError} /></label>
      <label>Contact name<input name="contact" maxLength={120} defaultValue={clientEdit === 'new' ? '' : clientEdit.contact} /></label>
      <label>Email<input name="email" type="email" defaultValue={clientEdit === 'new' ? '' : clientEdit.email} /></label>
      {projects.length > 0 && <fieldset className="business-grants"><legend>Projects visible in preview</legend>
        {projects.map(project => <label key={project.id}><input type="checkbox" name="project" value={project.id} defaultChecked={clientEdit !== 'new' && clientEdit.projects.includes(project.id)} />{project.name}</label>)}
      </fieldset>}
    </BusinessDialog>}
    {editor && editorSpec && <BusinessDialog title={(editor.record ? 'Edit ' : 'New ') + editorSpec.name} onSubmit={saveRecord} onClose={() => setEditor(null)}>
      <label>Title<input required name="title" maxLength={120} defaultValue={editor.record?.title} onInput={clearError} /></label>
      {!editor.fromPortal && <label>Client<select name="client" value={editorClient} disabled={lockedInvoice} onChange={event => setEditorClient(event.target.value)} required={editor.kind === 'invoice'}>
        <option value="">None</option>{data.clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <label>Project<select name="project" disabled={lockedInvoice} defaultValue={editor.record?.project ?? ''}>
        <option value="">None</option>{projects.filter(project => !editor.fromPortal || portalProjects.includes(project.id)).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></label>
      {!editor.fromPortal && <>
        <label>Status<select name="stage" defaultValue={editor.record?.stage}>{stages?.map(stage => <option key={stage}>{stage}</option>)}</select></label>
        <label>{editor.kind === 'invoice' ? 'Due date' : 'Date'}<input type="date" name="date" defaultValue={editor.record?.date} /></label>
        {financial.has(editor.kind) && <label>Amount (NGN)<input name="amount" inputMode="decimal" required readOnly={lockedInvoice} defaultValue={editor.record ? (editor.record.amount / 100).toFixed(2) : ''} onInput={clearError} /></label>}
        {(['proposal', 'contract', 'invoice', 'deliverable', 'approval'] as BusinessKind[]).includes(editor.kind) && <label>Document URL<input type="url" name="url" defaultValue={editor.record?.url} onInput={clearError} /></label>}
        {shareable.has(editor.kind) && <label className="business-checkbox"><input type="checkbox" name="shared" defaultChecked={editor.record?.shared} /> Show this record and its notes in the client portal</label>}
      </>}
      <label>{editor.kind === 'message' ? 'Message' : 'Notes'}<textarea name="notes" rows={3} maxLength={10000} required={editor.kind === 'message'} defaultValue={editor.record?.notes} /></label>
    </BusinessDialog>}
    {payment && <BusinessDialog title="Record payment" onSubmit={addPayment} onClose={() => setPayment(null)}>
      <p className="dev-muted">{money(payment.amount - paid(payment))} outstanding</p>
      <label>Amount (NGN)<input name="amount" inputMode="decimal" required onInput={clearError} /></label>
      <label>Payment date<input name="date" type="date" defaultValue={lagosDate()} max={lagosDate()} required /></label>
      <label>Reference<input name="reference" maxLength={120} /></label>
    </BusinessDialog>}
  </section>
}

function BusinessDialog({title,onSubmit,onClose,children}: {
  title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; children: ReactNode
}) {
  return <dialog ref={node => {if (node && !node.open) node.showModal()}} onCancel={onClose} aria-labelledby="business-editor">
    <form onSubmit={onSubmit}>
      <div className="dialog-heading"><h2 id="business-editor">{title}</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
      {children}
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
    </form>
  </dialog>
}
