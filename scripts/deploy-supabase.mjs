import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

const token = process.env.SUPABASE_ACCESS_TOKEN
const project = process.env.SUPABASE_PROJECT_REF
if (!token || !/^[a-z0-9]{20}$/.test(project ?? '')) {
  throw new Error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.')
}

const directory = new URL('../supabase/migrations/', import.meta.url)
const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
const versions = new Set()
const migrations = []
for (const name of files) {
  const version = /^(\d{12,14})_[a-z0-9_]+\.sql$/.exec(name)?.[1]
  if (!version || versions.has(version)) throw new Error(`Invalid or duplicate migration version in ${name}.`)
  versions.add(version)
  const sql = await readFile(new URL(name, directory), 'utf8')
  const checksum = createHash('sha256').update(sql).digest('hex')
  migrations.push({ version, name, sql, checksum })
}

async function query(sql, step) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    // Database error details can include SQL or production values.
    throw new Error(`${step} failed (Supabase HTTP ${response.status}).`)
  }
  return response.json()
}

const ledger = 'kasel_deploy.migrations'
const rows = await query(`select version, filename, checksum from ${ledger} order by version`, 'Reading production migration history')
if (!Array.isArray(rows) || !rows.length) throw new Error('Production migration history must be baselined first.')

const applied = new Map(rows.map(row => [row.version, row]))
const latest = rows.at(-1).version
for (const row of rows) {
  const migration = migrations.find(item => item.version === row.version)
  if (!migration || migration.name !== row.filename || migration.checksum !== row.checksum) {
    throw new Error(`Applied migration ${row.version} differs from the repository. Add a new migration to make database changes.`)
  }
}
for (const migration of migrations) {
  if (!applied.has(migration.version) && migration.version <= latest) {
    throw new Error(`Untracked migration ${migration.name} precedes the production migration history.`)
  }
}

const pending = migrations.filter(migration => !applied.has(migration.version))
for (const { version, name, sql, checksum } of pending) {
  // The ledger write and SQL share a transaction so a failed migration can be retried.
  await query(`begin;
insert into ${ledger}(version,filename,checksum) values ('${version}','${name}','${checksum}');
${sql}
commit;
`, name)
  console.log(`Applied ${name}`)
}
if (!pending.length) console.log('Production database is up to date.')
