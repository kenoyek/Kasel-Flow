import { defaultAutomation, type Automation } from './assistant-data'
import { emptyBusiness, type BusinessData } from './business-data'
import type { CreativeRecord } from './creative-data'
import type { DevelopmentRecord } from './development-data'

export type Status = 'To do' | 'In progress' | 'In review' | 'Done'
export type Project = { id: string; name: string; department: string; description: string; color: string; repository?: string }
export type Task = { id: string; title: string; project: string; status: Status; due: string; sprint?: string }
export type Workspace = { projects: Project[]; tasks: Task[]; development: DevelopmentRecord[]; creative: CreativeRecord[]; business: BusinessData; automation: Automation }
export const departments = ['Development', 'Social Media', 'Content', 'Operations']
export const statuses: Status[] = ['To do', 'In progress', 'In review', 'Done']
export const colors = ['violet', 'blue', 'pink', 'teal', 'gold']
export const seed: Workspace = {
  development: [],
  creative: [],
  business: emptyBusiness,
  automation: defaultAutomation,
  projects: [
    {id:'teach',name:'TeachEasy',department:'Development',description:'School management platform',color:'violet'},
    {id:'asele',name:'Asele',department:'Development',description:'Marketplace product development',color:'blue'},
    {id:'brand',name:'Kasel Brand Campaign',department:'Social Media',description:'December agency campaign',color:'pink'},
    {id:'studio',name:'Creative Studio',department:'Content',description:'Design and production requests',color:'teal'},
    {id:'farm',name:'FarmStead',department:'Development',description:'Agriculture product development',color:'teal'},
    {id:'reframe',name:'Reframe',department:'Development',description:'Product development',color:'pink'},
    {id:'onevet',name:'1Vet',department:'Development',description:'Veterinary product development',color:'violet'},
    {id:'ops',name:'Agency Operations',department:'Operations',description:'Internal processes and planning',color:'gold'},
  ],
  tasks: [
    {id:'1',title:'Review parent analytics designs',project:'teach',status:'In review',due:'2026-11-27'},
    {id:'2',title:'Build attendance dashboard',project:'teach',status:'In progress',due:'2026-11-30'},
    {id:'3',title:'Publish onboarding guide',project:'teach',status:'Done',due:'2026-11-23'},
    {id:'4',title:'Update product listing flows',project:'asele',status:'In progress',due:'2026-12-02'},
    {id:'5',title:'QA the checkout experience',project:'asele',status:'To do',due:'2026-12-04'},
    {id:'6',title:'Finalize December content calendar',project:'brand',status:'In progress',due:'2026-11-28'},
    {id:'7',title:'Approve campaign launch captions',project:'brand',status:'In review',due:'2026-12-01'},
    {id:'8',title:'Draft campaign objectives',project:'brand',status:'Done',due:'2026-11-24'},
    {id:'9',title:'Send brand concept for review',project:'studio',status:'To do',due:'2026-12-03'},
    {id:'10',title:'Prepare weekly operations report',project:'ops',status:'To do',due:'2026-12-04'},
    {id:'11',title:'Update the team handbook',project:'ops',status:'Done',due:'2026-11-25'},
  ],
}
