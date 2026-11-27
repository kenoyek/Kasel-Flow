import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cloud } from './cloud-workspace'
import { listPendingInvites, listTeams, readTeam, type Member, type SentInvite, type Team, type TeamInvite } from './team-workspace'

type AcceptedInvite = { invitation_id: string; email: string; member_role: 'editor' | 'viewer'; accepted_at: string }
const invitationDate = new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium'})

function creationError(error: {code?: string; message?: string}) {
  if (error.code === '42501' && error.message === 'Verified email required') {
    return 'Confirm this account’s email in Supabase Authentication → Users, then try again.'
  }
  if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) {
    return 'Team creation is unavailable. Apply the team-workspaces migration in Supabase and try again.'
  }
  if (error.code === '42501' && error.message === 'Workspace administrator required') {
    return 'Only workspace administrators can create teams.'
  }
  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'Supabase denied team creation. Sign out, sign back in, and try again.'
  }
  return 'Could not create the team. Try again or check the Supabase logs for this request.'
}

export function TeamPicker({owner, openPrivate, openTeam, focusInvites, accessPending, onSignOut}: {
  owner: string; focusInvites: boolean; openPrivate?: () => void; openTeam: (team: Team) => void; accessPending: boolean; onSignOut: () => Promise<void>
}) {
  const [teams, setTeams] = useState<Team[]>([])
  const [shareLink, setShareLink] = useState('')
  const [inviteError, setInviteError] = useState(false)
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [deletion, setDeletion] = useState<{ team: Team; revision: number; projects: number; tasks: number } | null>(null)
  const [deletionError, setDeletionError] = useState('')
  const [managed, setManaged] = useState<Team | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [accepted, setAccepted] = useState<AcceptedInvite[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [sent, setSent] = useState<SentInvite[]>([])
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const alive = useRef(false)
  const invitationsHeading = useRef<HTMLHeadingElement>(null)

  async function refresh() {
    const [teamsResult, invitesResult] = await Promise.allSettled([listTeams(owner), listPendingInvites()])
    if (alive.current) {
      setInviteError(invitesResult.status === 'rejected')
      if (invitesResult.status === 'fulfilled') setInvites(invitesResult.value)
      if (teamsResult.status === 'fulfilled') setTeams(teamsResult.value)
    }
    if (teamsResult.status === 'rejected') throw teamsResult.reason
    return teamsResult.value
  }

  async function loadRoster(team: Team) {
    const [roster, invitations, history] = await Promise.all([
      cloud!.from('team_members').select('user_id,label,member_role').eq('team_id',team.id).order('label'),
      cloud!.from('team_invites').select('id,email,member_role,expires_at').eq('team_id',team.id).order('expires_at',{ascending:false}),
      cloud!.from('team_invitation_history').select('invitation_id,email,member_role,accepted_at').eq('team_id',team.id)
        .order('accepted_at',{ascending:false}).order('invitation_id',{ascending:false}).limit(20),
    ])
    if (roster.error || invitations.error) throw Error('Could not load team members or invitations.')
    if (alive.current) {
      setMembers(roster.data)
      setSent(invitations.data)
      setAccepted(history.error ? [] : history.data ?? [])
      setHistoryError(Boolean(history.error))
      setManaged(team)
    }
  }

  async function run(action: () => Promise<void>, error: string) {
    setBusy(true)
    setMessage('')
    try {await action()}
    catch {if (alive.current) setMessage(error)}
    finally {if (alive.current) setBusy(false)}
  }

  useEffect(() => {
    alive.current = true
    if (focusInvites) invitationsHeading.current?.focus()
    void run(async () => {await refresh()}, 'Unable to load team workspaces. Try refreshing.')
    return () => {alive.current = false}
  }, [owner, focusInvites])

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    void run(async () => {
      const {data,error} = await cloud!.rpc('create_team_workspace',{team_name:name})
      if (!alive.current) return
      if (error) {setMessage(creationError(error));return}
      if (typeof data !== 'string') throw Error('Missing team ID')
      const team: Team = {id:data, name, role:'owner'}
      setTeams(previous => [...previous.filter(item => item.id !== team.id),team].sort((a,b) => a.name.localeCompare(b.name)))
      form.reset()
      setMessage('Team created. Open it or choose Manage ' + name + ' to invite teammates.')
    }, 'Could not confirm team creation. Refresh workspaces before trying again.')
  }

  async function previewDeletion(team: Team) {
    const snapshot = await readTeam(team.id, AbortSignal.timeout(12000))
    if (!alive.current) return
    setDeletionError('')
    setDeletion({team, revision:snapshot.revision, projects:snapshot.data.projects.length, tasks:snapshot.data.tasks.length})
  }

  async function deleteTeam() {
    if (busy || !deletion) return
    setBusy(true)
    setDeletionError('')
    try {
      const {data,error} = await cloud!.rpc('delete_team_workspace',{team:deletion.team.id,expected_revision:deletion.revision})
      if (!alive.current) return
      if (error) {
        setDeletionError(error.code === 'PGRST202'
          ? 'Install the team deletion migration in Supabase to enable this action.'
          : error.code === '42501' ? 'Only the team owner can delete this workspace.' : 'Could not delete the team. Try again.')
        return
      }
      if (data !== true) {
        setDeletion(null)
        setMessage('The team changed while this confirmation was open. Review its current contents before deleting.')
        return
      }
      setTeams(previous => previous.filter(item => item.id !== deletion.team.id))
      setManaged(null)
      setMembers([])
      setSent([])
      setAccepted([])
      setHistoryError(false)
      setDeletion(null)
      setMessage('Deleted team ' + deletion.team.name + '.')
    } catch {
      if (alive.current) setDeletionError('Could not confirm deletion. Close this dialog and refresh workspaces before trying again.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  async function copyInvitation(invitation: SentInvite) {
    const url = new URL(import.meta.env.BASE_URL,window.location.origin)
    url.searchParams.set('invite',invitation.id)
    try {
      await navigator.clipboard.writeText(url.href)
      if (alive.current) setMessage('Invitation link copied. Share it with ' + invitation.email + '.')
    } catch {
      if (alive.current) setShareLink(url.href)
    }
  }

  function invite(event: FormEvent<HTMLFormElement>, team: Team) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    void run(async () => {
      const {error} = await cloud!.rpc('invite_team_member',{team:team.id,recipient:values.get('email'),access_role:values.get('role')})
      if (error) throw error
      await loadRoster(team)
      form.reset()
      setMessage('Invitation created. Copy its link to share with the recipient. It expires after seven days.')
    }, 'Could not invite this member. Confirm the address and role.')
  }

  return <main className="team-picker">
    <div className="page-heading"><div><h1>Workspaces</h1><p>{openPrivate ? 'Choose a private or shared workspace.' : 'Open a team or accept an invitation.'}</p></div>
      <div className="creative-actions">
        {openPrivate && <button className="secondary" onClick={openPrivate}>Open private workspace</button>}
        <button className="text-button" disabled={busy} onClick={() => void run(onSignOut,'Could not sign out. Try again.')}>Sign out</button>
      </div></div>
    {accessPending && <p className="team-message">The workspace access migration is pending. Team workspaces remain available.</p>}
    {message && <p role="status" className="team-message">{message}</p>}
    <div className="assistant-grid">
      <section className="panel dev-card assistant-panel"><h2>Teams</h2>
        {busy && <p role="status" className="dev-muted">Working…</p>}
        {!busy && !teams.length && <p className="dev-muted">{openPrivate ? 'No team workspaces yet.' : 'No teams have been assigned to this account yet.'}</p>}
        {teams.map(team => <div className="team-row team-workspace-row" key={team.id}>
          <div className="team-workspace-label"><strong>{team.name}</strong><span className="status">{team.role}</span></div>
          <button className="primary" aria-label={'Open ' + team.name + ' workspace'} disabled={busy} onClick={() => openTeam(team)}>Open workspace</button>
          {team.role === 'owner' && <button className="text-button" disabled={busy} onClick={() => void run(() => loadRoster(team),'Could not load the team roster.')}>Manage {team.name}</button>}
        </div>)}
        <button className="text-button" disabled={busy} onClick={() => void run(async () => {await refresh()},'Could not refresh workspaces.')}>Refresh workspaces</button>
      </section>
      {openPrivate && <section className="panel dev-card assistant-panel"><h2>Create team</h2>
        <form onSubmit={create}><label>Team name<input name="name" maxLength={100} required /></label><button className="primary" disabled={busy}>Create team</button></form>
      </section>}
      <section className="panel dev-card assistant-panel"><h2 ref={invitationsHeading} tabIndex={-1}>Invitations</h2>
        {inviteError ? <p className="dev-muted">Invitations could not be loaded. Refresh workspaces to retry.</p> : !invites.length && <p className="dev-muted">No pending invitations for your verified email.</p>}
        {invites.map(item => <div className="team-row" key={item.id}>
          <span>{item.team_name} · {item.member_role} · expires {item.expires_at.slice(0,10)}</span>
          <button className="secondary" disabled={busy} onClick={() => void run(async () => {
            const {data,error} = await cloud!.rpc('accept_team_invite',{invitation:item.id})
            if (error) throw error
            const spaces = await refresh()
            const team = spaces.find(space => space.id === data)
            if (team && alive.current) openTeam(team)
          },'Invitation unavailable. Refresh and try again.')}>Accept invitation</button>
        </div>)}
      </section>
      {managed && <section className="panel dev-card assistant-panel">
        <div className="dev-card-heading"><h2>{managed.name} members</h2>
          <button className="secondary" disabled={busy} onClick={() => openTeam(managed)}>Go to workspace</button>
        </div>
        {members.map(member => <div className="team-row" key={member.user_id}><span>{member.label}</span>
          {member.member_role === 'owner' ? <span className="status">owner</span> : <>
            <select aria-label={'Role for ' + member.label} value={member.member_role} disabled={busy} onChange={event => {
              const role = event.target.value
              void run(async () => {
                const {error} = await cloud!.rpc('set_team_member_role',{team:managed.id,member:member.user_id,access_role:role})
                if (error) throw error
                await loadRoster(managed)
              },'Could not change the member role.')
            }}><option value="editor">editor</option><option value="viewer">viewer</option></select>
            <button className="text-button" disabled={busy} onClick={() => {
              if (!window.confirm('Remove ' + member.label + ' from this team?')) return
              void run(async () => {
                const {error} = await cloud!.rpc('set_team_member_role',{team:managed.id,member:member.user_id,access_role:null})
                if (error) throw error
                await loadRoster(managed)
              },'Could not remove the member.')
            }}>Remove</button>
          </>}
        </div>)}
        <div className="team-invitations" aria-label="Invitation status">
          <h3>Invitations sent</h3>
          {!sent.length && <p className="dev-muted">No pending or expired invitations.</p>}
          {sent.map(item => {
            const expired = Date.parse(item.expires_at) <= Date.now()
            return <div className="team-row" key={item.id}>
              <span className="status">{expired ? 'Expired' : 'Pending'}</span>
              <span>{item.email} · {item.member_role} · {expired ? 'expired' : 'expires'} {invitationDate.format(new Date(item.expires_at))}</span>
              {!expired && <button className="text-button" disabled={busy} onClick={() => void copyInvitation(item)}>Copy invite link</button>}
              <button className="text-button" disabled={busy} onClick={() => void run(async () => {
                const {error} = await cloud!.rpc('cancel_team_invite',{invitation:item.id})
                if (error) throw error
                await loadRoster(managed)
              },'Could not cancel the invitation.')}>{expired ? 'Remove expired invitation' : 'Cancel invitation'}</button>
            </div>
          })}
          <h3>Recent acceptances</h3>
          {historyError && <p className="dev-muted">Invitation history is unavailable. Refresh the team management panel to retry.</p>}
          {!historyError && !accepted.length && <p className="dev-muted">No acceptances recorded yet.</p>}
          {accepted.map(item => <div className="team-row" key={item.invitation_id}>
            <span className="status done">Accepted</span>
            <span>{item.email} · {item.member_role} · {invitationDate.format(new Date(item.accepted_at))}</span>
          </div>)}
        </div>
        <form onSubmit={event => invite(event, managed)}>
          <label>Invite email<input name="email" type="email" required maxLength={254} /></label>
          <label>Role<select name="role"><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label>
          <button className="primary" disabled={busy}>Create invitation</button>
        </form>
        <div className="activity-footer">
          <button className="secondary destructive" disabled={busy} onClick={() => void run(() => previewDeletion(managed),'Could not load the team details for deletion.')}>Delete team</button>
        </div>
      </section>}
    </div>
    {shareLink && <dialog ref={node => {if (node && !node.open) node.showModal()}} onCancel={() => setShareLink('')} aria-labelledby="team-share-title">
      <div className="dialog-heading"><h2 id="team-share-title">Share team invitation</h2></div>
      <label>Invitation link<input readOnly value={shareLink} onFocus={event => event.currentTarget.select()} /></label>
      <div className="dialog-actions"><button className="secondary" onClick={() => setShareLink('')}>Close</button></div>
    </dialog>}
    {deletion && <dialog ref={element => {if (element && !element.open) element.showModal()}}
      onCancel={event => {event.preventDefault();if (!busy) setDeletion(null)}} aria-labelledby="team-delete-title">
      <div className="dialog-heading"><h2 id="team-delete-title">Delete {deletion.team.name}?</h2></div>
      <p className="dev-details">Team ID ends in {deletion.team.id.slice(-8)}. This workspace contains {deletion.projects} {deletion.projects === 1 ? 'project' : 'projects'} and {deletion.tasks} {deletion.tasks === 1 ? 'task' : 'tasks'}.</p>
      <p className="dev-details">Deleting it permanently removes its shared records, memberships, invitations, and activity history.</p>
      {deletionError && <p role="alert" className="dev-details">{deletionError}</p>}
      <div className="dialog-actions">
        <button className="secondary" type="button" autoFocus disabled={busy} onClick={() => setDeletion(null)}>Cancel</button>
        <button className="primary destructive-primary" type="button" disabled={busy} onClick={() => void deleteTeam()}>{busy ? 'Deleting…' : 'Delete team permanently'}</button>
      </div>
    </dialog>}
  </main>
}
