import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const skillPath = path.resolve('src/lib/agent/nabu-skill.md')
const sourceCommit = '6c0e2379ba7b839773da7dd792c0d5663d5c6e06'
const expectedBlobSha = '343bba45c092cc15fc5afcba63b05f4cc0e01cfe'
const sourceUrl = `https://github.com/Timmyy3000/skills/blob/${sourceCommit}/skills/nabu/SKILL.md`

const content = await readFile(skillPath)
const header = Buffer.from(`blob ${content.byteLength}\0`)
const actualBlobSha = createHash('sha1').update(header).update(content).digest('hex')

if (actualBlobSha !== expectedBlobSha) {
  throw new Error(`Nabu skill snapshot drifted: expected ${expectedBlobSha}, found ${actualBlobSha}`)
}

console.log(`Verified ${skillPath} against ${sourceUrl}`)
