import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { creativeLabels, isAssetUrl, lagosDate, reviewActions, type CreativeKind, type CreativeRecord } from './creative-data'

type View = CreativeKind | 'calendar' | 'report'
type Props = { content: boolean; records: CreativeRecord[]; onSave: (record: CreativeRecord) => void }

const views: Record<View, string> = {
  brand: 'Brands', campaign: 'Campaigns', post: 'Posts', brief: 'Creative briefs',
  asset: 'Assets', calendar: 'Content calendar', report: 'Performance',
}

export function Creative({ content, records, onSave }: Props) {
  const [view, setView] = useState<View>(content ? 'brief' : 'calendar')
  const [selected, setSelected] = useState('')
  const [month, setMonth] = useState(() => lagosDate().slice(0, 7))
  const [editor, setEditor] = useState<{ kind: CreativeKind; record?: CreativeRecord } | null>(null)
  const [review, setReview] = useState<{ record: CreativeRecord; action: ReturnType<typeof reviewActions>[number] } | null>(null)
  const [measurement, setMeasurement] = useState<CreativeRecord | null>(null)
  const brands = records.filter(record => record.kind === 'brand')
  const brand = brands.find(record => record.id === selected) ?? brands[0]
  const related = brands.length ? records.filter(record => record.brand === brand?.id) : []
  const items = view === 'brand' ? brands : related.filter(record => record.kind === (view === 'calendar' ? 'post' : view))
  const monthlyPosts = related.filter(record => record.kind === 'post' && record.scheduledAt.startsWith(month + '-'))
    .sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt))
  const published = related.filter(record => record.kind === 'post' && record.stage === 'Published' && record.publishedOn?.startsWith(month + '-'))
  const measured = published.filter(record => record.metrics)
  const report = measured.reduce((totals, record) => ({
    reach: totals.reach + (record.metrics?.reach ?? 0),
    impressions: totals.impressions + (record.metrics?.impressions ?? 0),
    engagements: totals.engagements + (record.metrics?.engagements ?? 0),
  }), { reach: 0, impressions: 0, engagements: 0 })

  function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = new FormData(event.currentTarget)
    const get = (name: string) => String(form.get(name) ?? '').trim()
    if (!get('title')) {
      const title = event.currentTarget.elements.namedItem('title') as HTMLInputElement
      title.setCustomValidity('Enter a title.')
      title.reportValidity()
      return
    }
    const input = event.currentTarget.elements.namedItem('url') as HTMLInputElement | null
    if (input && get('url') && !isAssetUrl(get('url'))) {
      input.setCustomValidity('Enter an HTTPS URL without embedded credentials.')
      input.reportValidity()
      return
    }
    const previous = editor.record
    const versions = previous?.versions ?? []
    const newVersion = input && get('url') ? { url: get('url'), addedAt: new Date().toISOString() } : null
    const record: CreativeRecord = {
      id: previous?.id ?? crypto.randomUUID(), kind: editor.kind,
      brand: previous?.brand ?? (editor.kind === 'brand' ? '' : brand?.id ?? ''),
      title: get('title'), details: get('details'), owner: get('owner'), channel: get('channel'),
      campaign: get('campaign'), asset: get('asset'), scheduledAt: get('scheduledAt'),
      stage: previous?.stage ?? 'Draft', history: previous?.history ?? [],
      versions: newVersion ? [...versions, newVersion] : versions, metrics: previous?.metrics,
    }
    if (previous && (record.kind === 'brief' || record.kind === 'post') && record.stage !== 'Draft') {
      const revised = (['title', 'details', 'owner', 'channel', 'campaign', 'asset', 'scheduledAt'] as const)
        .some(key => record[key] !== previous[key])
      if (revised) {
        record.stage = 'Draft'
        record.history = [...record.history, { stage: 'Draft', note: 'Content revised. Review must start again.', at: new Date().toISOString() }]
      }
    }
    onSave(record)
    if (record.kind === 'brand') setSelected(record.id)
    setEditor(null)
  }

  function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!review) return
    const values = new FormData(event.currentTarget)
    const note = String(values.get('note') ?? '').trim()
    if (review.action.note && !note) {
      const input = event.currentTarget.elements.namedItem('note') as HTMLTextAreaElement
      input.setCustomValidity('Enter revision feedback.')
      input.reportValidity()
      return
    }
    const { record, action } = review
    const publishedOn = action.stage === 'Published' ? String(values.get('publishedOn')) : record.publishedOn
    onSave({ ...record, publishedOn, stage: action.stage, history: [...record.history, { stage: action.stage, note, at: new Date().toISOString() }] })
    setReview(null)
  }

  function saveMetrics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!measurement) return
    const values = new FormData(event.currentTarget)
    const metrics = {
      reach: Number(values.get('reach')), impressions: Number(values.get('impressions')), engagements: Number(values.get('engagements')),
    }
    if (Object.values(metrics).some(value => !Number.isSafeInteger(value) || value < 0)) return
    onSave({ ...measurement, metrics })
    setMeasurement(null)
  }

  function card(record: CreativeRecord) {
    const [assetId, versionIndex] = record.asset.split(':')
    const asset = related.find(item => item.id === assetId)
    const attachment = asset?.versions[Number(versionIndex)]
    const campaign = related.find(item => item.id === record.campaign)
    const approval = record.kind === 'post' || record.kind === 'brief'
    return <article className="panel dev-card" key={record.id}>
      <div className="dev-card-heading"><h3>{record.title}</h3>
        {record.stage !== 'Published' && <button className="text-button" onClick={() => setEditor({kind: record.kind, record})} aria-label={'Edit ' + record.title}>Edit</button>}
      </div>
      <div className="dev-meta">
        {approval && <span className="status">{record.stage}</span>}{record.channel && <span>{record.channel}</span>}
        {record.scheduledAt && <time dateTime={record.scheduledAt + '+01:00'}>{record.scheduledAt.replace('T', ' ')} WAT</time>}
        {record.publishedOn && <span>Published {record.publishedOn}</span>}
      </div>
      {record.details && <p className="dev-details">{record.details}</p>}
      {record.owner && <p className="dev-muted">Assigned to {record.owner}</p>}
      {campaign && <p className="dev-muted">Campaign · {campaign.title}</p>}
      {asset && attachment && isAssetUrl(attachment.url) && <p className="dev-muted">Asset · <a href={attachment.url} target="_blank" rel="noreferrer">{asset.title} · Version {Number(versionIndex) + 1}</a></p>}
      {record.versions.length > 0 && <ol className="creative-versions">{record.versions.map((version, index) => <li key={index}>
        {isAssetUrl(version.url) && <a href={version.url} target="_blank" rel="noreferrer">Version {index + 1}</a>}
      </li>)}</ol>}
      {approval && <div className="creative-actions">{reviewActions(record).map(action =>
        <button className="secondary" key={action.label} onClick={() => setReview({record,action})}>{action.label}</button>
      )}{record.stage === 'Published' && <button className="secondary" onClick={() => setMeasurement(record)}>Edit performance</button>}</div>}
      {record.history.length > 0 && <details className="creative-history"><summary>Review history</summary><ol>{[...record.history].reverse().map((entry, index) => <li key={index}>
        <strong>{entry.stage}</strong> · <time dateTime={entry.at}>{new Intl.DateTimeFormat('en-NG', {timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'}).format(new Date(entry.at))}</time>{entry.note && <p>{entry.note}</p>}
      </li>)}</ol></details>}
    </article>
  }

  const create = view === 'calendar' ? 'post' : view === 'report' ? null : view
  return <section className="development creative" aria-label={content ? 'Creative production' : 'Social media planning'}>
    <div className="dev-toolbar panel">
      {brand && <label>Brand <select value={brand.id} onChange={event => setSelected(event.target.value)}>{brands.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <button className="text-button" onClick={() => setEditor({kind:'brand'})}><Plus size={16} /> New brand</button>
      {!brand && <p className="dev-muted">Create a brand to plan campaigns, posts, and creative work.</p>}
    </div>
    {brand && <>
      <nav className="dev-views" aria-label="Creative views">
        {(content ? ['brief', 'asset', 'calendar', 'brand'] : ['calendar', 'post', 'campaign', 'report', 'brand', 'asset']).map(value => {
          const tab = value as View
          return <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{views[tab]}</button>
        })}
      </nav>
      <div className="section-heading">
        <h2>{views[view]}</h2>
        {(view === 'calendar' || view === 'report') && <label className="dev-status-filter">Month <input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>}
        {create && create !== 'brand' && <button className="primary" onClick={() => setEditor({kind:create})}><Plus size={16} /> New {creativeLabels[create]}</button>}
      </div>
      {view === 'report' ? <div className="panel dev-card"><p>{measured.length} of {published.length} published posts have manually recorded metrics.</p>
        {!!measured.length && <dl className="creative-metrics"><div><dt>Post reach total</dt><dd>{report.reach.toLocaleString()}</dd></div>
          <div><dt>Impressions</dt><dd>{report.impressions.toLocaleString()}</dd></div><div><dt>Engagements</dt><dd>{report.engagements.toLocaleString()}</dd></div></dl>}
      </div> : <div className="dev-records">{(view === 'calendar' ? monthlyPosts : items).map(card)}
        {!(view === 'calendar' ? monthlyPosts : items).length && <p className="panel empty">{view === 'calendar' ? 'No posts with a planned date in this month.' : 'No records yet.'}</p>}
      </div>}
    </>}
    {editor && <EditorDialog title={(editor.record ? 'Edit ' : 'New ') + creativeLabels[editor.kind]} onClose={() => setEditor(null)} onSubmit={saveEditor} save="Save">
      <label>{editor.kind === 'brand' ? 'Brand name' : 'Title'}<input name="title" required maxLength={100} defaultValue={editor.record?.title} onInput={event => event.currentTarget.setCustomValidity('')} /></label>
      <label>{{brand:'Brand guidelines',campaign:'Objectives and audience',post:'Caption and hashtags',brief:'Objectives, audience, and deliverables',asset:'Asset description'}[editor.kind]}
        <textarea name="details" rows={4} maxLength={10000} defaultValue={editor.record?.details} />
      </label>
      {(editor.kind === 'brief' || editor.kind === 'post') && <>
        <label>Assigned to<input name="owner" maxLength={100} defaultValue={editor.record?.owner} /></label>
        <label>Campaign<select name="campaign" defaultValue={editor.record?.campaign ?? ''}><option value="">None</option>
          {related.filter(item => item.kind === 'campaign').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label>Asset version<select name="asset" defaultValue={editor.record?.asset ?? ''}><option value="">None</option>
          {related.filter(item => item.kind === 'asset').flatMap(item => item.versions.map((_, index) =>
            <option key={item.id + ':' + index} value={item.id + ':' + index}>{item.title} · Version {index + 1}</option>))}
        </select></label>
      </>}
      {editor.kind === 'post' && <>
        <label>Channel<select name="channel" defaultValue={editor.record?.channel || 'Instagram'}>{['Instagram','Facebook','LinkedIn','TikTok','X','YouTube','Other'].map(channel => <option key={channel}>{channel}</option>)}</select></label>
        <label>Planned date and time (WAT)<input type="datetime-local" name="scheduledAt" defaultValue={editor.record?.scheduledAt} /></label>
      </>}
      {editor.kind === 'asset' && <label>{editor.record ? 'Add a version URL' : 'Version URL'}<input type="url" name="url" required={!editor.record} onInput={event => event.currentTarget.setCustomValidity('')} /></label>}
    </EditorDialog>}
    {review && <EditorDialog title={review.action.label} onClose={() => setReview(null)} onSubmit={saveReview} save="Confirm">
      {(review.action.stage === 'Scheduled' || review.action.stage === 'Published') && <p className="dev-muted">This records the status in Kasel OS. Publish or schedule the post in the channel separately.</p>}
      {review.action.stage === 'Published' && <label>Publication date (WAT)<input name="publishedOn" type="date" required max={lagosDate()} defaultValue={lagosDate()} /></label>}
      <label>{review.action.note ? 'Revision feedback' : 'Note (optional)'}<textarea name="note" rows={3} maxLength={2000} required={review.action.note} onInput={event => event.currentTarget.setCustomValidity('')} /></label>
    </EditorDialog>}
    {measurement && <EditorDialog title="Post performance" onClose={() => setMeasurement(null)} onSubmit={saveMetrics} save="Save metrics">
      {(['reach', 'impressions', 'engagements'] as const).map(metric => <label key={metric} className="creative-metric-label">{metric}
        <input name={metric} type="number" min={0} max={Number.MAX_SAFE_INTEGER} required defaultValue={measurement.metrics?.[metric]} />
      </label>)}
    </EditorDialog>}
  </section>
}

function EditorDialog({ title, onClose, onSubmit, save, children }: {
  title: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; save: string; children: React.ReactNode
}) {
  return <dialog ref={element => {if (element && !element.open) element.showModal()}} onCancel={onClose} aria-labelledby="creative-dialog-title">
    <form onSubmit={onSubmit}>
      <div className="dialog-heading"><h2 id="creative-dialog-title">{title}</h2><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
      {children}
      <div className="dialog-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{save}</button></div>
    </form>
  </dialog>
}
