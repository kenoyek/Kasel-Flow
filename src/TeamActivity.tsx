import { useEffect, useState } from 'react'
import { cloud } from './cloud-workspace'

type Counts = { added?: number; updated?: number; removed?: number }
type Activity = {
  revision: number
  occurred_at: string
  actor_label: string | null
  event_type: 'created' | 'saved'
  projects: Counts
  tasks: Counts
}

const pageSize = 20
const dateFormat = new Intl.DateTimeFormat('en-NG', {timeZone:'Africa/Lagos', dateStyle:'medium', timeStyle:'short'})

function summarize(label: string, counts: Counts) {
  const changes = [
    counts.added ? counts.added + ' added' : '',
    counts.updated ? counts.updated + ' updated' : '',
    counts.removed ? counts.removed + ' removed' : '',
  ].filter(Boolean)
  return changes.length ? label + ' · ' + changes.join(', ') : ''
}

export function TeamActivity({teamId, revision}: {teamId: string; revision: number}) {
  const [entries,setEntries] = useState<Activity[]>([])
  const [loading,setLoading] = useState(true)
  const [failed,setFailed] = useState(false)
  const [hasMore,setHasMore] = useState(false)
  const [page,setPage] = useState(0)
  const [attempt,setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    void cloud!.from('team_activity').select('revision,occurred_at,actor_label,event_type,projects,tasks')
      .eq('team_id',teamId).order('revision',{ascending:false}).range(page * pageSize,(page + 1) * pageSize).abortSignal(controller.signal)
      .then(({data,error}) => {
        if (controller.signal.aborted) return
        setLoading(false)
        if (error) {setFailed(true);return}
        const items = data ?? []
        setEntries(items.slice(0,pageSize))
        setHasMore(items.length > pageSize)
      })
    return () => controller.abort()
  }, [teamId,revision,page,attempt])

  return <section className="panel" aria-label="Team activity log">
    <div className="panel-heading">
      <div><h2>Workspace history</h2><p>Saved changes to shared projects and tasks.</p></div>
      <button className="text-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Refresh activity</button>
    </div>
    {loading && <p className="empty" role="status">Loading activity…</p>}
    {failed && <p className="empty" role="status">Could not load team activity. Check that the activity migration is applied and try again.</p>}
    {!loading && !failed && !entries.length && <p className="empty">No activity has been recorded for this workspace yet.</p>}
    {!failed && entries.length > 0 && <ol className="activity-list">{entries.map(entry => {
      const changes = [summarize('Projects',entry.projects),summarize('Tasks',entry.tasks)].filter(Boolean)
      return <li key={entry.revision}>
        <div><strong>{entry.event_type === 'created' ? 'Created the team workspace' : 'Saved team changes'}</strong>
          <p>{entry.actor_label ?? 'System'} · Revision {entry.revision}</p>
          {changes.map(line => <p key={line}>{line}</p>)}
        </div>
        <time dateTime={entry.occurred_at}>{dateFormat.format(new Date(entry.occurred_at))} WAT</time>
      </li>
    })}</ol>}
    {!failed && (page > 0 || hasMore) && <div className="activity-footer creative-actions">
      {page > 0 && <button className="secondary" disabled={loading} onClick={() => setPage(value => value - 1)}>Newer activity</button>}
      {hasMore && <button className="secondary" disabled={loading} onClick={() => setPage(value => value + 1)}>Older activity</button>}
    </div>}
  </section>
}
