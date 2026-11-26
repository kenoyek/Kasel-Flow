import { cloud, emptyWorkspace, type CloudWorkspace } from './cloud-workspace'
import type { Workspace } from './data'

export type TeamRole = 'owner' | 'editor' | 'viewer'
export type Team = { id: string; name: string; role: TeamRole }
export type TeamInvite = { id: string; team_name: string; expires_at: string; member_role: TeamRole }
export type SentInvite = Omit<TeamInvite, 'team_name'> & { email: string }
export type TaskAssignee = { user_id: string; label: string }
export type Member = { user_id: string; label: string; member_role: TeamRole }

export async function listTeams(owner: string) {
  const client = cloud!
  const {data,error} = await client.from('team_members').select('member_role,team_workspaces!inner(id,name)').eq('user_id',owner)
  if (error) throw error
  return (data ?? []).flatMap(row => {
    const joined = row.team_workspaces as unknown as {id: string; name: string}
    return joined ? [{...joined, role: row.member_role as TeamRole}] : []
  }).sort((first, second) => first.name.localeCompare(second.name))
}

export async function readTeam(team: string, signal: AbortSignal): Promise<CloudWorkspace> {
  const {data,error} = await cloud!.from('team_workspaces').select('workspace,revision').eq('id',team).abortSignal(signal).single()
  if (error || !data) throw new Error('This team workspace is unavailable.')
  return {data:{...emptyWorkspace, projects:data.workspace.projects, tasks:data.workspace.tasks}, revision:data.revision}
}

export async function listTaskAssignees(team: string, signal: AbortSignal): Promise<TaskAssignee[]> {
  const {data,error} = await cloud!.rpc('team_task_assignees',{team}).abortSignal(signal)
  if (error) throw error
  return data ?? []
}

export async function saveTeam(team: string, workspace: Workspace, revision: number) {
  const {data,error} = await cloud!.rpc('save_team_workspace',{team, expected_revision:revision, snapshot:{projects:workspace.projects,tasks:workspace.tasks}})
  if (error?.code === '42501') throw new Error('Your team editing access has changed. Export your unsaved copy from Settings before leaving.')
  if (error?.code === '23514' && error.message.includes('Task assignee')) {
    throw new Error('An assignee is no longer a team member. Reopen the workspace to refresh assignments before saving.')
  }
  if (error) throw new Error('Team save failed. Your edits remain open.')
  if (data === null) throw new Error('The team workspace changed elsewhere. Export your unsaved copy from Settings before reopening it.')
  return data as number
}
