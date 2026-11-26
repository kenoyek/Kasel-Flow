import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cloud } from './cloud-workspace'
import { listTeams, type Member, type SentInvite, type Team, type TeamInvite } from './team-workspace'

export function TeamPicker({owner, openPrivate, openTeam}: {
  owner: string; openPrivate: () => void; openTeam: (team: Team) => void
}) {
  const [teams, setTeams] = useState<Team[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [managed, setManaged] = useState<Team | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [sent, setSent] = useState<SentInvite[]>([])
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const alive = useRef(false)

  async function refresh() {
    const [spaces, pending] = await Promise.all([listTeams(owner), cloud!.rpc('pending_team_invites')])
    if (pending.error) throw pending.error
    if (alive.current) {setTeams(spaces); setInvites(pending.data ?? [])}
    return spaces
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
    void run(async () => {await refresh()}, 'Unable to load team workspaces. Try refreshing.')
    return () => {alive.current = false}
  }, [owner])

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    void run(async () => {
      const {error} = await cloud!.rpc('create_team_workspace',{team_name:name})
      if (error) throw error
      await refresh()
      form.reset()
    }, 'Could not create this team. A verified email is required.')
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
    <div className="page-heading"><div><h1>Workspaces</h1><p>Choose a private or shared workspace.</p></div>
      <button className="secondary" onClick={openPrivate}>Open private workspace</button></div>
    {message && <p role="status" className="team-message">{message}</p>}
    <div className="assistant-grid">
      <section className="panel dev-card assistant-panel"><h2>Teams</h2>
        {busy && <p role="status" className="dev-muted">Working…</p>}
        {!busy && !teams.length && <p className="dev-muted">No team workspaces yet.</p>}
        {teams.map(team => <div className="team-row" key={team.id}>
          <button className="text-button" disabled={busy} onClick={() => openTeam(team)}>{team.name}</button>
          <span className="status">{team.role}</span>
          {team.role === 'owner' && <button className="secondary" disabled={busy} onClick={() => void run(() => loadRoster(team),'Could not load the team roster.')}>Manage {team.name}</button>}
        </div>)}
        <button className="text-button" disabled={busy} onClick={() => void run(async () => {await refresh()},'Could not refresh workspaces.')}>Refresh workspaces</button>
      </section>
      <section className="panel dev-card assistant-panel"><h2>Create team</h2>
        <form onSubmit={create}><label>Team name<input name="name" maxLength={100} required /></label><button className="primary" disabled={busy}>Create team</button></form>
      </section>
      <section className="panel dev-card assistant-panel"><h2>Invitations</h2>
        {!invites.length && <p className="dev-muted">No pending invitations for your verified email.</p>}
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
      </section>}
    </div>
  </main>
}
