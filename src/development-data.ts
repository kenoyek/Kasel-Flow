export const modules = {
  roadmap: { label: 'Roadmap', singular: 'roadmap item', states: ['Planned', 'In progress', 'Delivered'], date: 'Target date', details: 'Outcome and scope' },
  sprint: { label: 'Sprints', singular: 'sprint', states: ['Planned', 'Active', 'Completed'], date: 'End date', details: 'Sprint goal' },
  bug: { label: 'Bugs', singular: 'bug', states: ['Open', 'Investigating', 'Resolved'], details: 'Observed behavior and expected result' },
  request: { label: 'Feature requests', singular: 'feature request', states: ['Submitted', 'Accepted', 'Declined', 'Delivered'], details: 'Request and user need' },
  release: { label: 'Releases', singular: 'release', states: ['Planned', 'Ready', 'Deployed', 'Rolled back'], date: 'Release date', details: 'Changelog and deployment notes' },
  qa: { label: 'QA', singular: 'test case', states: ['Pending', 'Passed', 'Failed', 'Blocked'], details: 'Test steps and acceptance criteria' },
  doc: { label: 'Docs', singular: 'document', states: ['Draft', 'Published'], details: 'Documentation' },
  incident: { label: 'Incidents', singular: 'incident', states: ['Open', 'Monitoring', 'Resolved'], details: 'Impact, response, and resolution' },
  time: { label: 'Time logs', singular: 'time log', states: [], date: 'Worked on', details: 'Work summary' },
} as const
export type RecordKind = keyof typeof modules
export type DevelopmentRecord = {
  id: string
  project: string
  kind: RecordKind
  title: string
  status: string
  details: string
  date: string
  start: string
  priority: string
  taskId: string
  minutes: number
}
export const moduleKeys = Object.keys(modules) as RecordKind[]

export function githubRepository(url: string) {
  const match = /^https:\/\/github\.com\/([a-z\d](?:[a-z\d-]*[a-z\d])?)\/([a-z\d_.-]+)\/?$/i.exec(url.trim())
  if (!match) return ''
  const name = match[2].replace(/\.git$/i, '')
  return name && name !== '.' && name !== '..' ? `https://github.com/${match[1]}/${name}` : ''
}
