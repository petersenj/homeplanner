import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(projectRoot, 'public', 'changelog.json')
const gitLog = execFileSync('git', [
  'log',
  '--no-merges',
  '-30',
  '--date=short',
  '--pretty=format:%cs%x1f%s',
], { cwd: projectRoot, encoding: 'utf8' })

const entries = gitLog.split(/\r?\n/).filter(Boolean).map((line) => {
  const [date, ...subjectParts] = line.split('\x1f')
  if (!date || !subjectParts.length) {
    throw new Error(`Unexpected Git log entry: ${line}`)
  }
  return { date, subject: subjectParts.join('\x1f') }
})

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
console.log(`Generated changelog with ${entries.length} Git commits.`)
