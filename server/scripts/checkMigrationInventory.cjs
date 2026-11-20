const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const directory = path.resolve(__dirname, '../../supabase/migrations')
const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
const parsed = files.map(name => {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name)
  if (!match) throw new Error(`Invalid migration filename: ${name}`)
  const bytes = fs.readFileSync(path.join(directory, name))
  return { number: Number(match[1]), name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
})

const numbers = parsed.map(item => item.number)
const duplicates = numbers.filter((number, index) => numbers.indexOf(number) !== index)
if (duplicates.length) throw new Error(`Duplicate migration numbers: ${[...new Set(duplicates)].join(', ')}`)
const expected = Array.from({ length: Math.max(...numbers) }, (_, index) => index + 1)
const missing = expected.filter(number => !numbers.includes(number))
if (missing.length) throw new Error(`Missing migration numbers: ${missing.map(number => String(number).padStart(3, '0')).join(', ')}`)

const destructive = parsed.filter(item => /\b(TRUNCATE|DROP\s+(TABLE|SCHEMA)|DELETE\s+FROM\s+public\.users)\b/i.test(
  fs.readFileSync(path.join(directory, item.name), 'utf8'),
))
const allowedHistoricalDestructive = new Set(['031_economy_clean_reset.sql'])
const unexpectedDestructive = destructive.filter(item => !allowedHistoricalDestructive.has(item.name))
if (unexpectedDestructive.length) {
  throw new Error(`Unexpected destructive migration(s): ${unexpectedDestructive.map(item => item.name).join(', ')}`)
}

console.log(`Migration inventory OK: ${parsed.length} files, 001-${String(parsed.at(-1).number).padStart(3, '0')}, no gaps or duplicates.`)
console.log(`Historical manual-only destructive migration: ${[...allowedHistoricalDestructive].join(', ')} (never replay during routine deploy).`)
console.log(`Latest: ${parsed.at(-1).name} sha256=${parsed.at(-1).sha256}`)
