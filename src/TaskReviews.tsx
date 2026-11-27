import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cloud } from './cloud-workspace'
import { isAssetUrl } from './creative-data'
import type { TaskAssignee } from './team-workspace'

const statuses = {pending:'Awaiting review',approved:'Approved',changes_requested:'Changes requested'} as const
type ReviewStatus = keyof typeof statuses
type Decision = Exclude<ReviewStatus,'pending'>
type Review = {id:string; title:string; deliverable_url:string; instructions:string; status:ReviewStatus; decision_note:string;
  requester_label:string; reviewer_id:string; reviewer_label:string; created_at:string; decided_at:string | null}
export type ReviewNotice = {id:string; task_id:string; task_title:string; title:string}
const dates = new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})

export function useReviewInbox(teamId?: string, userId?: string) {
  const [items,setItems] = useState<ReviewNotice[]>([])
  useEffect(() => {
    if (!cloud || !teamId || !userId) return
    const client = cloud
    let request: AbortController | undefined
    const check = () => {
      request?.abort()
      const next = new AbortController()
      request = next
      void client.from('team_deliverable_reviews').select('id,task_id,task_title,title')
        .eq('team_id',teamId).eq('reviewer_id',userId).eq('status','pending')
        .order('created_at',{ascending:false}).limit(20).abortSignal(next.signal).then(({data,error}) => {
          if (!next.signal.aborted && !error) setItems(data ?? [])
        })
    }
    check()
    window.addEventListener('focus',check)
    const timer = window.setInterval(() => {if (!document.hidden) check()},30000)
    return () => {request?.abort();window.removeEventListener('focus',check);window.clearInterval(timer)}
  },[teamId,userId])
  return {items, remove:(id: string) => setItems(current => current.filter(item => item.id !== id))}
}

export function TaskReviews({teamId,taskId,userId,members,readOnly,highlight,onDecision}: {
  teamId:string; taskId:string; userId:string; members:TaskAssignee[]; readOnly:boolean; highlight?:string; onDecision:(id:string)=>void
}) {
  const [entries,setEntries] = useState<Review[]>([])
  const [showRequest,setShowRequest] = useState(false)
  const [decision,setDecision] = useState<{id:string; decision:Decision} | null>(null)
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [attempt,setAttempt] = useState(0)
  const target = useRef<HTMLElement>(null)
  const candidates = members.filter(member => member.user_id !== userId)

  useEffect(() => {
    const request = new AbortController()
    setLoading(true)
    setError('')
    const base = () => cloud!.from('team_deliverable_reviews')
      .select('id,title,deliverable_url,instructions,status,decision_note,requester_label,reviewer_id,reviewer_label,created_at,decided_at')
      .eq('team_id',teamId).eq('task_id',taskId)
    const recent = base().order('created_at',{ascending:false}).order('id',{ascending:false}).limit(20).abortSignal(request.signal)
    const selected = highlight ? base().eq('id',highlight).abortSignal(request.signal).maybeSingle() : null
    void Promise.all([recent,selected]).then(([result,pinned]) => {
      if (request.signal.aborted) return
      setLoading(false)
      if (result.error || pinned?.error) {setError('Could not load deliverable reviews. Refresh to try again.');return}
      const items = (result.data ?? []) as Review[]
      setEntries(pinned?.data ? [pinned.data as Review,...items.filter(item => item.id !== highlight)] : items)
    })
    return () => request.abort()
  },[teamId,taskId,attempt,highlight])

  useEffect(() => {if (!loading && highlight) target.current?.scrollIntoView({block:'nearest'})},[loading,highlight])

  async function requestReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || readOnly) return
    const form = new FormData(event.currentTarget)
    const get = (key:string) => String(form.get(key) ?? '').trim()
    if (!isAssetUrl(get('link'))) {
      setNotice('Enter an HTTPS deliverable link without embedded credentials.')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      const {error:failure} = await cloud!.rpc('request_team_deliverable_review',{
        target_team:teamId,target_task:taskId,target_reviewer:get('reviewer'),
        review_title:get('title'),review_url:get('link'),review_instructions:get('instructions'),
      })
      if (failure) {setNotice('Could not request review. Check that the task is saved and the reviewer is still a team member.');return}
      setShowRequest(false)
      setAttempt(value => value + 1)
    } catch {
      setNotice('Could not request review. Your draft is still open.')
    } finally {setBusy(false)}
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!decision || busy) return
    const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
    if (decision.decision === 'changes_requested' && !note) {setNotice('Explain what needs to change.');return}
    setBusy(true)
    setNotice('')
    try {
      const {data,error:failure} = await cloud!.rpc('decide_team_deliverable_review',{
        target_team:teamId,target_review:decision.id,decision:decision.decision,note,
      })
      if (failure) {setNotice('Could not save your decision. Try again.');return}
      if (data === true) onDecision(decision.id)
      else setNotice('This review is no longer pending for you. Refresh to check its status.')
      setDecision(null)
      setAttempt(value => value + 1)
    } catch {
      setNotice('Could not save your decision. Try again.')
    } finally {setBusy(false)}
  }

  return <section className="task-discussion" aria-label="Deliverable reviews">
    <div className="dev-card-heading"><h3>Deliverable reviews</h3><button type="button" className="text-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Refresh reviews</button></div>
    {loading && <p className="dev-muted" role="status">Loading reviews…</p>}
    {error && <p className="dev-muted" role="status">{error}</p>}
    {!loading && !error && !entries.length && <p className="dev-muted">No reviews yet.</p>}
    <div className="discussion-list">{entries.map(entry => <article key={entry.id} ref={entry.id === highlight ? target : undefined} className={entry.id === highlight ? 'highlight-comment review-entry' : 'review-entry'}>
      <div className="dev-card-heading"><strong>{entry.title}</strong><span className="status">{statuses[entry.status]}</span></div>
      <small>Requested by {entry.requester_label} · Reviewer {entry.reviewer_label}</small>
      {isAssetUrl(entry.deliverable_url) && <a href={entry.deliverable_url} target="_blank" rel="noreferrer">Open deliverable</a>}
      {entry.instructions && <p>{entry.instructions}</p>}
      {entry.decided_at && <time dateTime={entry.decided_at}>Decided {dates.format(new Date(entry.decided_at))} WAT</time>}
      {entry.decision_note && <p>{entry.decision_note}</p>}
      {entry.status === 'pending' && entry.reviewer_id === userId && decision?.id !== entry.id && <div className="creative-actions">
        {(['approved','changes_requested'] as const).map(value => <button key={value} className="secondary" type="button" disabled={busy}
          onClick={() => {setNotice('');setDecision({id:entry.id,decision:value})}}>{value === 'approved' ? 'Approve' : 'Request changes'}</button>)}
      </div>}
      {decision?.id === entry.id && <form onSubmit={saveDecision}>
        <label>{decision.decision === 'approved' ? 'Decision note (optional)' : 'Changes needed'}
          <textarea name="note" rows={3} maxLength={4000} required={decision.decision === 'changes_requested'} /></label>
        <div className="creative-actions"><button className="primary" disabled={busy}>Confirm {decision.decision === 'approved' ? 'approval' : 'changes'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setDecision(null)}>Cancel decision</button></div>
      </form>}
    </article>)}</div>
    {!readOnly && candidates.length > 0 && !showRequest && <button className="secondary" type="button" onClick={() => {setNotice('');setShowRequest(true)}}>Request review</button>}
    {showRequest && <form onSubmit={requestReview}>
      <label>Deliverable title<input name="title" maxLength={120} required /></label>
      <label>Deliverable link<input name="link" type="url" maxLength={2000} required /></label>
      <label>Reviewer<select name="reviewer" required defaultValue=""><option value="">Choose reviewer</option>{candidates.map(member => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}</select></label>
      <label>Review instructions<textarea name="instructions" rows={3} maxLength={4000} /></label>
      <div className="creative-actions"><button className="primary" disabled={busy}>Send review request</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setShowRequest(false)}>Cancel request</button></div>
    </form>}
    {notice && <p className="dev-muted" role="status">{notice}</p>}
  </section>
}
