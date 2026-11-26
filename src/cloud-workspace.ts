import { createClient } from '@supabase/supabase-js'
import { defaultAutomation } from './assistant-data'
import { emptyBusiness } from './business-data'
import type { Workspace } from './data'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const cloud = url && key ? createClient(url, key, {auth:{flowType:'pkce'}}) : null

export const emptyWorkspace: Workspace = {
  projects: [], tasks: [], development: [], creative: [], business: emptyBusiness, automation: defaultAutomation,
}

export type CloudWorkspace = { data: Workspace; revision: number }

export async function readCloud(owner: string, signal: AbortSignal): Promise<CloudWorkspace> {
  if (!cloud) throw new Error('Cloud storage is unavailable.')
  const result = await cloud.from('private_workspaces').select('workspace,revision').eq('owner_id',owner).abortSignal(signal).maybeSingle()
  if (result.error) throw new Error('Could not load the private workspace.')
  return result.data ? {data:result.data.workspace as Workspace,revision:result.data.revision} : {data:emptyWorkspace,revision:0}
}

export async function writeCloud(owner: string, workspace: Workspace, revision: number): Promise<number> {
  if (!cloud) throw new Error('Cloud storage is unavailable.')
  if (new Blob([JSON.stringify(workspace)]).size > 2 * 1024 * 1024) throw new Error('Workspace exceeds the 2 MB storage limit. Export a copy from Settings.')
  const table = cloud.from('private_workspaces')
  const mutation = revision
    ? table.update({workspace}).eq('owner_id', owner).eq('revision', revision)
    : table.insert({owner_id:owner, workspace})
  const {data, error} = await mutation.select('revision').maybeSingle()
  if (error && error.code !== '23505') throw new Error('Cloud save failed. Your edits are still open. Try again or export a copy from Settings.')
  if (!data) throw new Error('The workspace changed elsewhere. Export your unsaved copy from Settings before reloading.')
  return data.revision
}
