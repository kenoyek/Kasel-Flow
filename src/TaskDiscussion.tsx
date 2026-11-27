import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cloud } from './cloud-workspace'
import type { TaskAssignee } from './team-workspace'

type Comment = { id: string; author_label: string; body: string; mention_labels: string[]; created_at: string }
export type TaskMention = { comment_id: string; task_id: string; task_title: string; author_label: string; read_at: string | null; notice_kind?: 'comment' | 'mention' }
const dateFormat = new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})
const pageSize = 20

export function taskNoticeText(notice: TaskMention) {
  return notice.author_label + (notice.notice_kind === 'comment' ? ' commented on this task' : ' mentioned you')
}

export function useTaskMentions(teamId?: string) {
  const [mentions,setMentions] = useState<TaskMention[]>([])
  const [refresh,setRefresh] = useState(0)
  useEffect(() => {
    if (!teamId || !cloud) return
    const client = cloud
    let request: AbortController | undefined
    function check() {
      request?.abort()
      const next = new AbortController()
      request = next
      void client.from('team_task_mentions').select('comment_id,task_id,task_title,author_label,read_at,notice_kind')
        .eq('team_id',teamId).order('read_at',{ascending:false,nullsFirst:true}).order('created_at',{ascending:false})
        .limit(20).abortSignal(next.signal).then(({data,error}) => {
          if (!next.signal.aborted && !error) setMentions(data ?? [])
        })
    }
    check()
    const channel = client.channel('team-task-notices:' + teamId + ':' + crypto.randomUUID())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'team_task_mentions',filter:'team_id=eq.' + teamId},check)
      .subscribe(status => {if (status === 'SUBSCRIBED') check()})
    window.addEventListener('focus',check)
    const timer = window.setInterval(() => {if (!document.hidden) check()},30000)
    return () => {
      request?.abort()
      window.removeEventListener('focus',check)
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  },[teamId,refresh])

  async function markRead(mention: TaskMention) {
    if (!teamId || !cloud || mention.read_at) return
    const {error} = await cloud.rpc('read_team_task_mention',{target_team:teamId,target_comment:mention.comment_id})
    if (!error) {
      setMentions(items => items.map(item => item.comment_id === mention.comment_id ? {...item,read_at:new Date().toISOString()} : item))
      setRefresh(value => value + 1)
    }
  }

  return {mentions, markRead}
}

export function TaskDiscussion({teamId,taskId,members,owner,readOnly,highlight}: {
  teamId: string; taskId: string; members: TaskAssignee[]; owner: string; readOnly: boolean; highlight?: string
}) {
  const highlighted = useRef<HTMLLIElement>(null)
  const [comments,setComments] = useState<Comment[]>([])
  const [body,setBody] = useState('')
  const [selected,setSelected] = useState<string[]>([])
  const [loading,setLoading] = useState(true)
  const [sending,setSending] = useState(false)
  const [error,setError] = useState('')
  const [attempt,setAttempt] = useState(0)
  const [page,setPage] = useState(0)
  const [hasMore,setHasMore] = useState(false)
  const [postError,setPostError] = useState('')

  useEffect(() => {
    const request = new AbortController()
    setLoading(true)
    setError('')
    let query = cloud!.from('team_task_comments').select('id,author_label,body,mention_labels,created_at')
      .eq('team_id',teamId).eq('task_id',taskId)
    if (highlight) query = query.neq('id',highlight)
    const pageRequest = query.order('created_at',{ascending:false}).order('id',{ascending:false})
      .range(page * pageSize,(page + 1) * pageSize).abortSignal(request.signal)
    const pinnedRequest = highlight ? cloud!.from('team_task_comments').select('id,author_label,body,mention_labels,created_at')
      .eq('team_id',teamId).eq('task_id',taskId).eq('id',highlight).abortSignal(request.signal).maybeSingle() : null
    void Promise.all([pageRequest,pinnedRequest]).then(([result,pinned]) => {
      if (request.signal.aborted) return
      setLoading(false)
      if (result.error || pinned?.error) {setError('Could not load this discussion. Refresh to try again.');return}
      const items = result.data ?? []
      setHasMore(items.length > pageSize)
      setComments(pinned?.data ? [pinned.data,...items.slice(0,pageSize)] : items.slice(0,pageSize))
    })
    return () => request.abort()
  },[teamId,taskId,highlight,attempt,page])

  useEffect(() => {
    if (!loading && highlight) highlighted.current?.scrollIntoView({block:'nearest'})
  },[highlight,loading])

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || sending || !body.trim()) return
    setSending(true)
    setPostError('')
    try {
      const {error:failure} = await cloud!.rpc('post_team_task_comment',{target_team:teamId,target_task:taskId,comment_body:body,mentioned_users:selected})
      if (failure) {
        setPostError(failure.code === '22023' ? 'Save the task first and check that each mention is a current teammate.' : 'Could not post your comment. Your draft is still here.')
        return
      }
      setBody('')
      setSelected([])
      setPage(0)
      setAttempt(value => value + 1)
    } catch {
      setPostError('Could not post your comment. Your draft is still here.')
    } finally {setSending(false)}
  }

  return <section className="task-discussion" aria-label="Task discussion">
    <div className="dev-card-heading"><h3>Discussion</h3><button type="button" className="text-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Refresh discussion</button></div>
    {loading && <p role="status" className="dev-muted">Loading discussion…</p>}
    {error && <p role="status" className="dev-muted">{error}</p>}
    {!loading && !error && !comments.length && <p className="dev-muted">No comments yet.</p>}
    {!!comments.length && <ol className="discussion-list">{comments.map(comment => <li key={comment.id} ref={comment.id === highlight ? highlighted : undefined} className={comment.id === highlight ? 'highlight-comment' : undefined}>
      <strong>{comment.author_label}</strong><time dateTime={comment.created_at}>{dateFormat.format(new Date(comment.created_at))} WAT</time>
      <p>{comment.body}</p>
      {!!comment.mention_labels.length && <small>{comment.mention_labels.map(label => '@' + label).join(' · ')}</small>}
    </li>)}</ol>}
    {(page > 0 || hasMore) && <div className="creative-actions">
      {page > 0 && <button type="button" className="text-button" disabled={loading} onClick={() => setPage(value => value - 1)}>Newer comments</button>}
      {hasMore && <button type="button" className="text-button" disabled={loading} onClick={() => setPage(value => value + 1)}>Older comments</button>}
    </div>}
    {!readOnly && <form onSubmit={post}>
      <label>Comment<textarea name="comment" required maxLength={4000} rows={3} value={body} onChange={event => setBody(event.target.value)} /></label>
      <label>@Mention a teammate<select value="" disabled={sending || selected.length >= 10} onChange={event => {
        if (event.target.value) setSelected([...selected,event.target.value])
      }}><option value="">Choose a teammate</option>
        {members.filter(member => member.user_id !== owner && !selected.includes(member.user_id)).map(member => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}
      </select></label>
      {!!selected.length && <div className="creative-actions">{selected.map(id => <button key={id} type="button" className="secondary" disabled={sending} onClick={() => setSelected(selected.filter(item => item !== id))}>
        Remove @{members.find(member => member.user_id === id)?.label ?? 'teammate'}
      </button>)}</div>}
      <button type="submit" className="primary discussion-post" disabled={sending || !body.trim()}>{sending ? 'Posting…' : 'Post comment'}</button>
      {postError && <p role="alert" className="dev-muted">{postError}</p>}
    </form>}
  </section>
}
