export const businessKinds = {
  lead: { label: 'Leads', name: 'lead', stages: ['New', 'Qualified', 'Proposal', 'Won', 'Lost'] },
  proposal: { label: 'Proposals', name: 'proposal', stages: ['Draft', 'Sent', 'Accepted', 'Declined'] },
  contract: { label: 'Contracts', name: 'contract', stages: ['Draft', 'Sent', 'Signed', 'Ended'] },
  invoice: { label: 'Invoices', name: 'invoice', stages: ['Draft', 'Issued', 'Void'] },
  retainer: { label: 'Retainers', name: 'retainer', stages: ['Planned', 'Active', 'Paused', 'Ended'] },
  expense: { label: 'Expenses', name: 'expense', stages: ['Pending', 'Paid'] },
  payroll: { label: 'Payroll', name: 'payroll record', stages: ['Pending', 'Paid'] },
  request: { label: 'Requests', name: 'request', stages: ['Open', 'In progress', 'Resolved'] },
  issue: { label: 'Issues', name: 'issue', stages: ['Open', 'In progress', 'Resolved'] },
  approval: { label: 'Approvals', name: 'approval', stages: ['Pending', 'Approved', 'Changes requested'] },
  milestone: { label: 'Milestones', name: 'milestone', stages: ['Planned', 'In progress', 'Complete'] },
  deliverable: { label: 'Deliverables', name: 'deliverable', stages: ['Preparing', 'Available'] },
  message: { label: 'Messages', name: 'message', stages: ['Posted'] },
} as const

export type BusinessKind = keyof typeof businessKinds
export type Client = { id: string; name: string; email: string; contact: string; projects: string[] }
export type BusinessRecord = {
  id: string
  kind: BusinessKind
  title: string
  notes: string
  stage: string
  client: string
  project: string
  date: string
  amount: number
  currency: 'NGN'
  url: string
  shared: boolean
  payments: { amount: number; date: string; reference: string }[]
  history: { at: string; action: string }[]
}
export type BusinessData = { clients: Client[]; records: BusinessRecord[] }
export const emptyBusiness: BusinessData = {clients: [], records: []}
export const financial = new Set<BusinessKind>(['proposal', 'invoice', 'retainer', 'expense', 'payroll'])
export const shareable = new Set<BusinessKind>(['invoice', 'request', 'issue', 'approval', 'milestone', 'deliverable', 'message'])

export function parseAmount(input: string) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(input.trim())
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null
}

const currencyFormat = new Intl.NumberFormat('en-NG', {style:'currency', currency:'NGN'})
export const money = (amount: number) => currencyFormat.format(amount / 100)
export const paid = (record: BusinessRecord) => record.payments.reduce((total, payment) => total + payment.amount, 0)

export function clientRecords(data: BusinessData, client: Client) {
  return data.records.filter(record => record.client === client.id && record.shared && shareable.has(record.kind) &&
    (!record.project || client.projects.includes(record.project)) &&
    (record.kind !== 'invoice' || record.stage === 'Issued') &&
    (record.kind !== 'deliverable' || record.stage === 'Available'))
}
