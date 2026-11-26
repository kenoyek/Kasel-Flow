export type CreativeKind = 'brand' | 'campaign' | 'post' | 'brief' | 'asset'
export type CreativeStage = 'Draft' | 'Internal review' | 'Client review' | 'Changes requested' | 'Approved' | 'Scheduled' | 'Published'
export type CreativeRecord = {
  id: string
  kind: CreativeKind
  brand: string
  title: string
  details: string
  campaign: string
  owner: string
  channel: string
  scheduledAt: string
  stage: CreativeStage
  publishedOn?: string
  asset: string
  versions: { url: string; addedAt: string }[]
  history: { stage: CreativeStage; note: string; at: string }[]
  metrics?: { reach: number; impressions: number; engagements: number }
}
export const creativeLabels = { brand: 'brand', campaign: 'campaign', post: 'post', brief: 'creative brief', asset: 'asset' } as const

export function reviewActions(record: CreativeRecord): { label: string; stage: CreativeStage; note?: boolean }[] {
  switch (record.stage) {
    case 'Draft':
    case 'Changes requested':
      return [{ label: 'Submit for internal review', stage: 'Internal review' }]
    case 'Internal review':
      return [{ label: 'Approve internally', stage: 'Client review' }, { label: 'Request internal changes', stage: 'Changes requested', note: true }]
    case 'Client review':
      return [{ label: 'Record client approval', stage: 'Approved' }, { label: 'Record client revisions', stage: 'Changes requested', note: true }]
    case 'Approved':
      return record.kind === 'post' && record.scheduledAt ? [{ label: 'Mark scheduled', stage: 'Scheduled' }] : []
    case 'Scheduled':
      return [{ label: 'Record publication', stage: 'Published' }]
    case 'Published':
      return []
  }
}

export function isAssetUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export function lagosDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
