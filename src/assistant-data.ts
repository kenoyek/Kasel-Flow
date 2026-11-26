import type { Workspace } from './data'
import { money, paid } from './business-data'

export const reports = {
  overdue: 'Overdue tasks',
  reviews: 'Review queue',
  project: 'Project status',
  bugs: 'Unresolved bugs',
  invoices: 'Outstanding invoices',
  social: 'Social performance',
} as const
export type Report = keyof typeof reports
export type ReportResult = { title: string; summary: string; lines: string[] }
export type Automation = { reminders: boolean; runs: { report: Report; at: string; result: ReportResult }[] }
export const defaultAutomation: Automation = {reminders:false, runs:[]}

export function reportWorkspace(data: Workspace, report: Report, today: string, projectId = '', month = today.slice(0, 7)): ReportResult {
  const title = reports[report]
  const result = (lines: string[], unit: string): ReportResult => ({title, summary: lines.length ? lines.length + ' ' + unit : 'No matching records.', lines})
  const projectName = (id: string) => data.projects.find(project => project.id === id)?.name ?? 'Unknown project'
  if (report === 'overdue') {
    return result(data.tasks.filter(task => task.status !== 'Done' && task.due && task.due < today)
      .sort((a,b) => a.due.localeCompare(b.due)).map(task => `${task.title} · ${projectName(task.project)} · due ${task.due}`), 'overdue tasks')
  }
  if (report === 'reviews') {
    const tasks = data.tasks.filter(task => task.status === 'In review').map(task => `${task.title} · ${projectName(task.project)}`)
    const creative = data.creative.filter(record => record.stage === 'Internal review' || record.stage === 'Client review')
      .map(record => `${record.title} · ${record.stage}`)
    const approvals = data.business.records.filter(record => record.kind === 'approval' && record.stage === 'Pending')
      .map(record => `${record.title} · Client approval`)
    return result([...tasks, ...creative, ...approvals], 'items awaiting review')
  }
  if (report === 'project') {
    const tasks = data.tasks.filter(task => task.project === projectId)
    return {title: projectName(projectId) + ' · Project status', summary:`${tasks.filter(task => task.status === 'Done').length} of ${tasks.length} tasks complete`,
      lines:tasks.map(task => `${task.title} · ${task.status}${task.due ? ' · due ' + task.due : ''}`)}
  }
  if (report === 'bugs') {
    return result(data.development.filter(record => record.kind === 'bug' && record.status !== 'Resolved' && (!projectId || record.project === projectId))
      .map(record => `${record.title} · ${projectName(record.project)} · ${record.priority || 'Unrated'} · ${record.status}`), 'unresolved bugs')
  }
  if (report === 'invoices') {
    const open = data.business.records.filter(record => record.kind === 'invoice' && record.stage === 'Issued' && record.amount > paid(record))
    return {title, summary: money(open.reduce((total, record) => total + record.amount - paid(record), 0)) + ' outstanding',
      lines:open.map(record => `${record.title} · ${data.business.clients.find(client => client.id === record.client)?.name ?? 'Unassigned'} · ${money(record.amount - paid(record))}`)}
  }
  const published = data.creative.filter(record => record.kind === 'post' && record.stage === 'Published' && record.publishedOn?.startsWith(month + '-'))
  const measured = published.filter(record => record.metrics)
  return {title: title + ' · ' + month, summary:`${measured.length} of ${published.length} published posts have recorded metrics`,
    lines:measured.map(record => `${record.title} · ${record.metrics?.impressions} impressions · ${record.metrics?.engagements} engagements`)}
}

export function draftTasks(brief: string) {
  return [...new Set(brief.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim().slice(0,100)).filter(Boolean))].slice(0,20)
}
