import { useEffect, useRef, useState } from 'react'
import { cloud, type CloudWorkspace } from './cloud-workspace'
import { readTeam } from './team-workspace'

type Connection = 'connecting' | 'live' | 'unavailable'

export function useTeamUpdates(teamId?: string) {
  const [latest, setLatest] = useState<CloudWorkspace | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [refreshError, setRefreshError] = useState(false)
  const refresh = useRef<() => void>(() => {})

  useEffect(() => {
    if (!teamId || !cloud) return
    const client = cloud
    let active = true
    let request: AbortController | undefined

    const check = () => {
      request?.abort()
      const next = new AbortController()
      request = next
      setRefreshError(false)
      readTeam(teamId, next.signal).then(snapshot => {
        if (active && !next.signal.aborted) {
          setLatest(previous => !previous || snapshot.revision > previous.revision ? snapshot : previous)
        }
      }).catch(() => {
        if (active && !next.signal.aborted) setRefreshError(true)
      })
    }
    refresh.current = check

    const channel = client.channel('team-workspace:' + teamId + ':' + crypto.randomUUID())
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'team_workspaces', filter:'id=eq.' + teamId}, check)
      .subscribe(status => {
        if (!active) return
        setConnection(status === 'SUBSCRIBED' ? 'live' : 'unavailable')
        if (status === 'SUBSCRIBED') check()
      })
    const checkVisible = () => {if (!document.hidden && navigator.onLine) check()}
    checkVisible()
    const timer = window.setInterval(checkVisible, 30_000)
    document.addEventListener('visibilitychange', checkVisible)
    window.addEventListener('online', checkVisible)
    window.addEventListener('focus', check)
    return () => {
      active = false
      request?.abort()
      refresh.current = () => {}
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', checkVisible)
      window.removeEventListener('online', checkVisible)
      window.removeEventListener('focus', check)
      void client.removeChannel(channel)
    }
  }, [teamId])

  return {latest, connection, refreshError, refresh: () => refresh.current()}
}
