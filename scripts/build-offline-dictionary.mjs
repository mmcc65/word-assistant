import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'

const source = process.argv[2]
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/build-offline-dictionary.mjs <ecdict.csv>')
  process.exit(1)
}

const outputRoot = path.resolve('public/dictionaries/ecdict')
fs.mkdirSync(outputRoot, { recursive: true })

/** @type {Record<string, Record<string, [string, string, string, string, string]>>} */
const buckets = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz_'].map((key) => [key, {}]))
let scanned = 0
let included = 0

function rank(value) {
  const number = Number.parseInt(value || '0', 10)
  return Number.isFinite(number) ? number : 0
}

function shouldInclude(row) {
  const tag = String(row.tag || '').toLowerCase()
  const bnc = rank(row.bnc)
  const frq = rank(row.frq)
  return tag.includes('cet4') || tag.includes('cet6') || Number(row.collins) > 0 || Number(row.oxford) > 0 ||
    (bnc > 0 && bnc <= 30000) || (frq > 0 && frq <= 30000)
}

Papa.parse(fs.createReadStream(source), {
  header: true,
  skipEmptyLines: true,
  step(result) {
    scanned += 1
    const row = result.data
    const word = String(row.word || '').trim().toLowerCase()
    const translation = String(row.translation || '').trim()
    if (!translation || !/^[a-z][a-z' -]*$/.test(word) || !shouldInclude(row)) return
    const bucket = /^[a-z]/.test(word) ? word[0] : '_'
    const candidate = [
      String(row.phonetic || '').trim(),
      String(row.definition || '').trim(),
      translation,
      String(row.tag || '').trim(),
      String(row.exchange || '').trim(),
    ]
    if (!buckets[bucket][word]) included += 1
    buckets[bucket][word] = candidate
  },
  complete() {
    let bytes = 0
    for (const [bucket, entries] of Object.entries(buckets)) {
      const file = path.join(outputRoot, `${bucket}.json`)
      const content = JSON.stringify(entries)
      fs.writeFileSync(file, content)
      bytes += Buffer.byteLength(content)
    }
    fs.writeFileSync(path.join(outputRoot, 'metadata.json'), JSON.stringify({
      source: 'ECDICT',
      sourceUrl: 'https://github.com/skywind3000/ECDICT',
      license: 'MIT',
      generatedAt: new Date().toISOString(),
      entries: included,
      bytes,
    }, null, 2))
    console.log(`Scanned ${scanned.toLocaleString()} rows; wrote ${included.toLocaleString()} entries (${(bytes / 1048576).toFixed(1)} MB).`)
  },
  error(error) {
    console.error(error)
    process.exit(1)
  },
})
