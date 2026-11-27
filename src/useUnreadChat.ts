import { useCallback, useEffect, useRef, useState } from 'react'
import { cloud } from './cloud-workspace'

export function useUnreadChat(teamId?: string) {
  const [count,setCount] = useState(0)
  const check = useRef<() => void>(() => {})
  const markedThrough = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!cloud || !teamId) return
    const client = cloud
    let active = true
    let request: AbortController | undefined
    function refresh() {
      request?.abort()
      const next = new AbortController()
      request = next
      void client.rpc('team_chat_unread_count',{target_team:teamId}).abortSignal(next.signal).then(({data,error}) => {
        if (active && !next.signal.aborted && !error && typeof data === 'number') setCount(data)
      })
    }
    markedThrough.current = undefined
    check.current = refresh
    refresh()
    const channel = client.channel('team-chat-unread:' + teamId + ':' + crypto.randomUUID())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'team_chat_messages',filter:'team_id=eq.' + teamId},refresh)
      .subscribe(status => {if (active && status === 'SUBSCRIBED') refresh()})
    window.addEventListener('focus',refresh)
    const timer = window.setInterval(() => {if (!document.hidden) refresh()},30000)
    return () => {
      active=false
      request?.abort()
      check.current=() => {}
      window.removeEventListener('focus',refresh)
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  },[teamId])

  const markRead = useCallback(async (id:string) => {
    if (!cloud || !teamId || markedThrough.current === id) return
    markedThrough.current = id
    const {error} = await cloud.rpc('mark_team_chat_read',{target_team:teamId,through_message:id})
    if (error && markedThrough.current === id) markedThrough.current = undefined
    if (!error) check.current()
  },[teamId])

  return {count, markRead}
}
