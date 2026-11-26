import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cloud } from './cloud-workspace'
import { listPendingInvites, listTeams, readTeam, type Member, type SentInvite, type Team, type TeamInvite } from './team-workspace'

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
  const [inviteError, setInviteError] = useState(false)
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [deletion, setDeletion] = useState<{ team: Team; revision: number; projects: number; tasks: number } | null>(null)
  const [deletionError, setDeletionError] = useState('')
  const [managed, setManaged] = useState<Team | null>(null)
  const [members, setMembers] = useState<Member[]>([])
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
    const [roster, invitations] = await Promise.all([
      cloud!.from('team_members').select('user_id,label,member_role').eq('team_id',team.id).order('label'),
      cloud!.from('team_invites').select('id,email,member_role,expires_at').eq('team_id',team.id).order('email'),
    ])
    if (roster.error || invitations.error) throw Error('Could not load team members or invitations.')
    if (alive.current) {setMembers(roster.data); setSent(invitations.data); setManaged(team)}
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
      setDeletion(null)
      setMessage('Deleted team ' + deletion.team.name + '.')
    } catch {
      if (alive.current) setDeletionError('Could not confirm deletion. Close this dialog and refresh workspaces before trying again.')
    } finally {
      if (alive.current) setBusy(false)
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
      setMessage('Invitation available in the recipient’s workspace switcher for seven days.')
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
        {teams.map(team => <div className="team-row" key={team.id}>
          <button className="text-button" disabled={busy} onClick={() => openTeam(team)}>{team.name}</button>
          <span className="status">{team.role}</span>
          {team.role === 'owner' && <button className="secondary" disabled={busy} onClick={() => void run(() => loadRoster(team),'Could not load the team roster.')}>Manage {team.name}</button>}
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
      {managed && <section className="panel dev-card assistant-panel"><h2>{managed.name} members</h2>
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
        {sent.map(item => <div className="team-row" key={item.id}><span>{item.email} · {item.member_role} invitation · expires {item.expires_at.slice(0,10)}</span>
          <button className="text-button" disabled={busy} onClick={() => void run(async () => {
            const {error} = await cloud!.rpc('cancel_team_invite',{invitation:item.id})
            if (error) throw error
            await loadRoster(managed)
          },'Could not cancel the invitation.')}>Cancel invitation</button></div>)}
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
