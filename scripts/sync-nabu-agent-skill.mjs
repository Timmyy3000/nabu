import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const defaultSourceUrl =
  'https://raw.githubusercontent.com/Timmyy3000/skills/6c0e2379ba7b839773da7dd792c0d5663d5c6e06/skills/nabu/SKILL.md'
const sourceUrl = process.env.NABU_AGENT_SKILL_URL ?? defaultSourceUrl
const skillPath = path.resolve('src/lib/agent/nabu-skill.md')
const response = await fetch(sourceUrl)

if (!response.ok) {
  throw new Error(`Unable to fetch Nabu skill from ${sourceUrl}: ${response.status} ${response.statusText}`)
}

const content = await response.text()
await writeFile(skillPath, content, 'utf8')

const bytes = Buffer.from(content, 'utf8')
const blobSha = createHash('sha1')
  .update(Buffer.from(`blob ${bytes.byteLength}\0`))
  .update(bytes)
  .digest('hex')

console.log(`Synced ${skillPath} from ${sourceUrl}`)
console.log(`Git blob SHA: ${blobSha}`)
console.log('Update the pinned source commit and blob SHA before committing a new snapshot.')
