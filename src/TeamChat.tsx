import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cloud } from './cloud-workspace'

type Message = {id:string; author_label:string; body:string; created_at:string}
const batch = 30
const dates = new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})

export function TeamChat({teamId,readOnly,onRead}: {teamId:string;readOnly:boolean;onRead:(id:string)=>Promise<void>}) {
  const [messages,setMessages] = useState<Message[]>([])
  const [draft,setDraft] = useState('')
  const [loading,setLoading] = useState(true)
  const [posting,setPosting] = useState(false)
  const [loadError,setLoadError] = useState(false)
  const [postError,setPostError] = useState('')
  const [limit,setLimit] = useState(batch)
  const [hasMore,setHasMore] = useState(false)
  const refresh = useRef<() => void>(() => {})

  useEffect(() => {
    if (!cloud) return
    const client = cloud
    let active = true
    let request: AbortController | undefined
    const fetchMessages = () => {
      request?.abort()
      const next = new AbortController()
      request = next
      void client.from('team_chat_messages').select('id,author_label,body,created_at').eq('team_id',teamId)
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1).abortSignal(next.signal)
        .then(({data,error}) => {
          if (!active || next.signal.aborted) return
          setLoading(false)
          setLoadError(Boolean(error))
          if (error) return
          const items = (data ?? []).slice(0,limit)
          setMessages(items)
          if (items[0] && !document.hidden) void onRead(items[0].id)
          setHasMore((data ?? []).length > limit)
        })
    }
    refresh.current = fetchMessages
    fetchMessages()
    const channel = client.channel('team-chat:' + teamId + ':' + crypto.randomUUID())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'team_chat_messages',filter:'team_id=eq.' + teamId},fetchMessages)
      .subscribe(status => {if (active && status === 'SUBSCRIBED') fetchMessages()})
    window.addEventListener('focus',fetchMessages)
    document.addEventListener('visibilitychange',fetchMessages)
    const fallback = window.setInterval(() => {if (!document.hidden) fetchMessages()},30000)
    return () => {
      active = false
      request?.abort()
      window.clearInterval(fallback)
      window.removeEventListener('focus',fetchMessages)
      document.removeEventListener('visibilitychange',fetchMessages)
      refresh.current = () => {}
      void client.removeChannel(channel)
    }
  },[teamId,limit,onRead])

  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || !draft.trim() || posting) return
    setPosting(true)
    setPostError('')
    try {
      const {error} = await cloud!.rpc('post_team_chat_message',{target_team:teamId,message_body:draft})
      if (error) {setPostError('Could not send the message. Your draft is still here.');return}
      setDraft('')
      refresh.current()
    } catch {
      setPostError('Could not send the message. Your draft is still here.')
    } finally {setPosting(false)}
  }

  return <section className="panel" aria-label="Team chat">
    <div className="panel-heading"><div><h2>Workspace chat</h2><p>Visible to members of this workspace.</p></div>
      <button className="text-button" type="button" onClick={() => refresh.current()}>Refresh chat</button>
    </div>
    {!readOnly && <form className="chat-compose" onSubmit={send}>
      <label>Message<textarea rows={3} maxLength={4000} value={draft} disabled={posting} onChange={event => setDraft(event.target.value)} /></label>
      <button className="primary" disabled={posting || !draft.trim()}>{posting ? 'Sending…' : 'Send message'}</button>
      {postError && <p role="alert" className="dev-muted">{postError}</p>}
    </form>}
    {loading && <p role="status" className="empty">Loading messages…</p>}
    {loadError && <p role="status" className="empty">Could not load messages. Refresh chat to try again.</p>}
    {!loading && !loadError && !messages.length && <p className="empty">No messages yet.</p>}
    {!!messages.length && <ol className="discussion-list chat-messages">{messages.map(message => <li key={message.id}>
      <strong>{message.author_label}</strong><time dateTime={message.created_at}>{dates.format(new Date(message.created_at))} WAT</time>
      <p>{message.body}</p>
    </li>)}</ol>}
    {hasMore && <div className="activity-footer"><button className="secondary" type="button" onClick={() => setLimit(value => value + batch)}>Load older messages</button></div>}
  </section>
}
