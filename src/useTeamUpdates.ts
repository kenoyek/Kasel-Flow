import { useEffect, useRef, useState } from 'react'
import { cloud, type CloudWorkspace } from './cloud-workspace'
import { readTeam } from './team-workspace'

type Connection = 'connecting' | 'live' | 'unavailable'

export function useTeamUpdates(teamId?: string) {
  const [latest, setLatest] = useState<CloudWorkspace | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [refreshing, setRefreshing] = useState(false)
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
      setRefreshing(true)
      setRefreshError(false)
      readTeam(teamId, next.signal).then(snapshot => {
        if (active && !next.signal.aborted) {
          setLatest(previous => !previous || snapshot.revision > previous.revision ? snapshot : previous)
        }
      }).catch(() => {
        if (active && !next.signal.aborted) setRefreshError(true)
      }).finally(() => {
        if (active && !next.signal.aborted) setRefreshing(false)
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
    window.addEventListener('online', check)
    window.addEventListener('focus', check)
    return () => {
      active = false
      request?.abort()
      refresh.current = () => {}
      window.removeEventListener('online', check)
      window.removeEventListener('focus', check)
      void client.removeChannel(channel)
    }
  }, [teamId])

  return {latest, connection, refreshing, refreshError, refresh: () => refresh.current()}
}
