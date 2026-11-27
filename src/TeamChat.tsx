import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { MessagesSquare, Pin, RefreshCw, Reply, Search, Send, X } from 'lucide-react'
import { cloud } from './cloud-workspace'

type MessageContent = {id:string; author_id?:string | null; author_label:string; body:string}
type Message = MessageContent & {created_at:string; reply_to:string | null}
type SearchHit = MessageContent & {created_at:string}
type Profile = {user_id:string; label:string; display_name:string | null}
const batch = 30
const dayLabel = new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',dateStyle:'long'})
const timeLabel = new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',hour:'numeric',minute:'2-digit'})
const day = (date:string) => dayLabel.format(new Date(date))

function initials(value:string) {
  const base = value.split('@')[0].trim()
  const words = base.split(/[.\s_-]+/).filter(Boolean)
  return (words.length > 1 ? words.slice(0,2).map(word => Array.from(word)[0]).join('') : Array.from(base).slice(0,2).join('')).toLocaleUpperCase() || '?'
}

export function TeamChat({teamId,teamName,userId,email,displayName,readOnly,onRead}: {
  teamId:string;teamName:string;userId:string;email:string;displayName:string;readOnly:boolean;onRead:(id:string)=>Promise<void>
}) {
  const [pinned,setPinned] = useState<Message | null>(null)
  const [pinBusy,setPinBusy] = useState(false)
  const [pinError,setPinError] = useState('')
  const [parents,setParents] = useState(new Map<string,MessageContent>())
  const [profiles,setProfiles] = useState<Profile[]>([])
  const [messages,setMessages] = useState<Message[]>([])
  const [replyTo,setReplyTo] = useState<MessageContent | null>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const [draft,setDraft] = useState('')
  const [loading,setLoading] = useState(true)
  const [posting,setPosting] = useState(false)
  const [loadError,setLoadError] = useState(false)
  const [postError,setPostError] = useState('')
  const [searchOpen,setSearchOpen] = useState(false)
  const [query,setQuery] = useState('')
  const [searchRequest,setSearchRequest] = useState<{term:string} | null>(null)
  const [matches,setMatches] = useState<SearchHit[]>([])
  const [searchStatus,setSearchStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [anchor,setAnchor] = useState<SearchHit | null>(null)
  const pendingJump = useRef(false)
  const [limit,setLimit] = useState(batch)
  const [hasMore,setHasMore] = useState(false)
  const refresh = useRef<() => void>(() => {})
  const conversation = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const oldHeight = useRef<number | null>(null)

  useLayoutEffect(() => {
    const element = conversation.current
    if (!element) return
    if (anchor && pendingJump.current) {
      const target = document.getElementById('chat-message-' + anchor.id)
      if (target) {
        pendingJump.current = false
        target.focus({preventScroll:true})
        target.scrollIntoView({block:'center',inline:'nearest'})
      }
    } else if (oldHeight.current !== null) {
      element.scrollTop += element.scrollHeight - oldHeight.current
      oldHeight.current = null
    } else if (followLatest.current) {
      element.scrollTop = element.scrollHeight
    }
  },[messages,anchor])

  function sender(message:MessageContent) {
    const own = message.author_id === userId || (!message.author_id && message.author_label === email)
    const profile = profiles.find(item => message.author_id ? item.user_id === message.author_id : item.label === message.author_label)
    const name = (own ? displayName : profile?.display_name) || message.author_label
    return {own,name,email:message.author_label}
  }

  useEffect(() => {
    if (!cloud || !searchOpen || !searchRequest) return
    const request = new AbortController()
    void cloud.rpc('search_team_chat',{target_team:teamId,search_text:searchRequest.term})
      .abortSignal(request.signal).then(({data,error}) => {
        if (request.signal.aborted) return
        setMatches(error ? [] : data ?? [])
        setSearchStatus(error ? 'error' : 'done')
      })
    return () => request.abort()
  },[teamId,searchOpen,searchRequest])

  useEffect(() => {
    if (!cloud) return
    const client = cloud
    let active = true
    let request: AbortController | undefined
    const fetchMessages = () => {
      request?.abort()
      const next = new AbortController()
      request = next
      const room = () => client.from('team_chat_messages').select('id,author_id,author_label,body,created_at,reply_to').eq('team_id',teamId)
      const history = room()
      if (anchor) {
        history.or(`created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.lte.${anchor.id})`)
      }
      const recent = history.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1).abortSignal(next.signal)
      const pin = room().not('pinned_at','is',null).abortSignal(next.signal).maybeSingle()
      const people = client.rpc('team_chat_profiles',{target_team:teamId}).abortSignal(next.signal)
      void Promise.all([recent,pin,people]).then(async ([{data,error},pinResult,peopleResult]) => {
          if (!active || next.signal.aborted) return
          setLoading(false)
          setLoadError(Boolean(error))
          if (error) return
          const items = (data ?? []).slice(0,limit)
          const currentPin = pinResult.error ? null : pinResult.data
          const visible = currentPin ? [...items,currentPin] : items
          const known = new Map<string,MessageContent>(visible.map(message => [message.id,message]))
          const missing = [...new Set(visible.flatMap(message =>
            message.reply_to && !known.has(message.reply_to) ? [message.reply_to] : []
          ))]
          if (missing.length) {
            const {data:older} = await room().in('id',missing).abortSignal(next.signal)
            if (!active || next.signal.aborted) return
            for (const message of older ?? []) known.set(message.id,message)
          }
          if (!peopleResult.error) setProfiles(peopleResult.data ?? [])
          setPinned(currentPin)
          setParents(known)
          setMessages(items)
          if (!anchor && items[0] && !document.hidden) void onRead(items[0].id)
          setHasMore((data ?? []).length > limit)
        })
    }
    refresh.current = fetchMessages
    fetchMessages()
    const channel = client.channel('team-chat:' + teamId + ':' + crypto.randomUUID())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'team_chat_messages',filter:'team_id=eq.' + teamId},fetchMessages)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'team_chat_messages',filter:'team_id=eq.' + teamId},fetchMessages)
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
  },[teamId,limit,onRead,anchor])

  function openHistory(match:SearchHit | null) {
    oldHeight.current = null
    pendingJump.current = Boolean(match)
    followLatest.current = !match
    setLimit(batch)
    setSearchOpen(false)
    if (anchor?.id === match?.id) {
      const target = match && document.getElementById('chat-message-' + match.id)
      if (target) {
        pendingJump.current = false
        target.focus({preventScroll:true})
        target.scrollIntoView({block:'center',inline:'nearest'})
      }
      return
    }
    setLoading(true)
    setMessages([])
    setHasMore(false)
    setLoadError(false)
    setAnchor(match)
  }

  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || !draft.trim() || posting) return
    setPosting(true)
    setPostError('')
    try {
      const args = {target_team:teamId,message_body:draft}
      const {error} = replyTo
        ? await cloud!.rpc('reply_to_team_chat_message',{...args,target_message:replyTo.id})
        : await cloud!.rpc('post_team_chat_message',args)
      if (error) {setPostError('Could not send the message. Your draft is still here.');return}
      setDraft('')
      setReplyTo(null)
      followLatest.current = true
      if (anchor) openHistory(null)
      else refresh.current()
    } catch {
      setPostError('Could not send the message. Your draft is still here.')
    } finally {setPosting(false)}
  }

  async function changePin(message: Message, makePinned: boolean) {
    if (readOnly || pinBusy) return
    setPinBusy(true)
    setPinError('')
    try {
      const {data,error} = await cloud!.rpc('set_team_chat_pin',{target_team:teamId,target_message:message.id,make_pinned:makePinned})
      if (error) setPinError('Could not update the pinned message. Try again.')
      else if (!data) setPinError('The pinned message changed. Review the current pin and try again.')
      refresh.current()
    } catch {
      setPinError('Could not update the pinned message. Try again.')
    } finally {setPinBusy(false)}
  }

  function quote(message:MessageContent) {
    return <blockquote className="chat-quote">
      <strong>{sender(message).name}</strong>
      <span>{message.body}</span>
    </blockquote>
  }

  const chronological = [...messages].reverse()
  const pinnedSender = pinned ? sender(pinned) : null
  const pinnedParent = pinned?.reply_to ? parents.get(pinned.reply_to) : undefined

  return <section className="panel team-chat" aria-label="Team chat">
    <div className="panel-heading chat-room-header">
      <div className="chat-room-title"><span className="chat-room-icon"><MessagesSquare size={20} /></span>
        <div><h2>{teamName} chat</h2><p>Workspace members</p></div>
      </div>
      <div className="chat-header-actions">
      <button className="icon-button" type="button" aria-label="Search chat" aria-expanded={searchOpen} onClick={() => {
        setSearchOpen(!searchOpen)
        setSearchRequest(null)
        setSearchStatus('idle')
      }}><Search size={17} /></button>
      <button className="icon-button" type="button" aria-label="Refresh chat" title="Refresh chat" onClick={() => refresh.current()}><RefreshCw size={17} /></button>
      </div>
    </div>
    {searchOpen && <section className="chat-search" aria-label="Search messages">
      <form onSubmit={event => {
        event.preventDefault()
        const term = query.trim()
        if (term.length < 2 || searchStatus === 'loading') return
        setSearchStatus('loading')
        setSearchRequest({term})
      }}>
        <input type="search" aria-label="Search message text" placeholder="Search messages…" autoFocus value={query}
          minLength={2} maxLength={120} onChange={event => {
            setQuery(event.target.value)
            setSearchRequest(null)
            setSearchStatus('idle')
          }} />
        <button className="secondary" disabled={query.trim().length < 2 || searchStatus === 'loading'}>Search</button>
      </form>
      {searchStatus === 'loading' && <p role="status">Searching…</p>}
      {searchStatus === 'error' && <p role="alert">Could not search messages. Try again.</p>}
      {searchStatus === 'done' && (matches.length ? <>
        <ul>{matches.slice(0,25).map(match => <li key={match.id}>
          <button type="button" className="chat-search-match" onClick={() => openHistory(match)}>
            <strong>{sender(match).name}</strong><small>{day(match.created_at)}</small><span>{match.body}</span>
          </button>
        </li>)}</ul>
        {matches.length > 25 && <p>Showing the 25 most recent matches. Refine your search to find older results.</p>}
      </> : <p role="status">No matching messages.</p>)}
    </section>}
    {anchor && <div className="chat-history-bar">
      <span>Chat history · {day(anchor.created_at)}</span>
      <button type="button" className="text-button" onClick={() => openHistory(null)}>Back to latest</button>
    </div>}
    {pinned && pinnedSender && <section className="chat-pinned" aria-label="Pinned message">
      <div className="dev-card-heading"><h3><Pin size={15} /> Pinned message</h3>
        {!readOnly && <button className="text-button" type="button" disabled={pinBusy} onClick={() => void changePin(pinned,false)}>Unpin</button>}
      </div>
      <strong>{pinnedSender.name}</strong>
      {pinnedParent && quote(pinnedParent)}
      <p>{pinned.body}</p>
    </section>}
    {pinError && <p role="alert" className="empty">{pinError}</p>}
    <div ref={conversation} className="chat-conversation" onScroll={event => {
      const element = event.currentTarget
      followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60
    }}>
      {hasMore && <div className="chat-older"><button className="secondary" type="button" onClick={() => {
        oldHeight.current = conversation.current?.scrollHeight ?? null
        setLimit(value => value + batch)
      }}>Load older messages</button></div>}
      {loading && <p role="status" className="empty">Loading messages…</p>}
      {loadError && <p role="status" className="empty">Could not load messages. Refresh chat to try again.</p>}
      {!loading && !loadError && !messages.length && <div className="chat-empty"><MessagesSquare size={25} /><p>No messages yet.</p></div>}
      {!!chronological.length && <ol className="chat-thread">{chronological.map((message,index) => {
        const identity = sender(message)
        const date = day(message.created_at)
        const parent = message.reply_to ? parents.get(message.reply_to) : undefined
        return <Fragment key={message.id}>
          {(index === 0 || day(chronological[index-1].created_at) !== date) && <li className="chat-day">{date}</li>}
          <li id={'chat-message-' + message.id} tabIndex={-1}
            className={'chat-line' + (identity.own ? ' chat-own' : '') + (anchor?.id === message.id ? ' chat-search-target' : '')}>
            <span className="chat-avatar" aria-hidden="true">{initials(identity.name)}</span>
            <article className="chat-message">
              <div className="chat-message-header"><strong>{identity.name}</strong>
                {identity.own && <span className="chat-you">You</span>}
                <time dateTime={message.created_at}>{timeLabel.format(new Date(message.created_at))} WAT</time>
              </div>
              {identity.name !== identity.email && <small className="chat-email">{identity.email}</small>}
              <div className="chat-bubble">
                {parent && quote(parent)}
                <p>{message.body}</p>
              </div>
              <div className="chat-message-actions">
                {!readOnly && <button className="text-button" type="button" disabled={posting} onClick={() => {
                setReplyTo(message)
                composer.current?.focus()
              }}><Reply size={14} /> Reply</button>}
              {pinned?.id === message.id ? <span className="status">Pinned</span> : !readOnly && <button className="text-button chat-pin-action" type="button" disabled={pinBusy}
                onClick={() => void changePin(message,true)}>{pinned ? 'Replace pin' : 'Pin message'}</button>}
              </div>
            </article>
          </li>
        </Fragment>
      })}</ol>}
    </div>
    {!readOnly && <form className="chat-compose" onSubmit={send}>
      {replyTo && <div className="chat-reply-preview">
        <div><small>Replying to</small>{quote(replyTo)}</div>
        <button className="icon-button" type="button" aria-label="Cancel reply" disabled={posting} onClick={() => {
          setReplyTo(null)
          composer.current?.focus()
        }}><X size={16} /></button>
      </div>}
      <label>Message<textarea ref={composer} rows={2} maxLength={4000} value={draft} disabled={posting} placeholder="Write a message…" onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }
      }} /></label>
      <div className="chat-compose-actions"><small>Shift + Enter for a new line</small>
        <button className="primary" disabled={posting || !draft.trim()}><Send size={15} />{posting ? 'Sending…' : 'Send message'}</button></div>
      {postError && <p role="alert" className="dev-muted">{postError}</p>}
    </form>}
  </section>
}
