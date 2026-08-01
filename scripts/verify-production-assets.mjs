import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const publicRoot = path.resolve('.output/public')
const serverEntry = path.resolve('.output/server/index.mjs')
const assetsRoot = path.join(publicRoot, 'assets')

await access(serverEntry)

const assetNames = await readdir(assetsRoot)
const stylesheetNames = assetNames.filter((name) => /^styles-[^/]+\.css$/.test(name))

if (stylesheetNames.length !== 1) {
  throw new Error(`Expected exactly one compiled stylesheet in ${assetsRoot}, found ${stylesheetNames.length}`)
}

const stylesheetPath = path.join(assetsRoot, stylesheetNames[0])
const stylesheet = await readFile(stylesheetPath, 'utf8')

for (const selector of ['.app-shell', '.vault-shell']) {
  if (!stylesheet.includes(selector)) {
    throw new Error(`Compiled stylesheet is missing the Nabu selector ${selector}`)
  }
}

console.log(`Verified ${stylesheetNames[0]} (${Buffer.byteLength(stylesheet)} bytes) and ${serverEntry}`)
