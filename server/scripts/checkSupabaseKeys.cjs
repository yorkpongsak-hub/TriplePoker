#!/usr/bin/env node
// ============================================================
// checkSupabaseKeys.cjs — Pre-flight ตรวจ Supabase keys ของ dev env (server/.env + client/.env)
// ใช้หลังเปลี่ยนจาก legacy JWT (anon / service_role) เป็น publishable / secret key ใหม่
//
// ⚠️ ไม่พิมพ์ค่า key ออกมาเด็ดขาด — แสดงแค่ prefix ประเภท key และผล PASS/FAIL
// อ่านอย่างเดียว: ไม่มีการเขียนข้อมูลลง DB
//
// รัน: cd server && npm run check:supabase-keys
// ============================================================
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const SERVER_ENV = path.resolve(__dirname, '../.env')
const CLIENT_ENV = path.resolve(__dirname, '../../client/.env')

let failed = 0
const pass = msg => console.log(`  PASS  ${msg}`)
const fail = msg => { failed++; console.log(`  FAIL  ${msg}`) }

// แสดงเฉพาะชนิดของ key (ไม่แสดงค่า)
function keyKind(value) {
  if (!value) return 'missing'
  if (value.startsWith('sb_publishable_')) return 'publishable'
  if (value.startsWith('sb_secret_')) return 'secret'
  if (value.startsWith('eyJ')) return 'legacy-jwt'
  return 'unknown'
}

// แยก error ของเครือข่ายออกจาก error ที่ Supabase ปฏิเสธ key จริง
function describe(error) {
  const msg = String((error && (error.message || error)) || '')
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) return 'เชื่อมต่อ Supabase ไม่ได้ (เน็ต/DNS) — เช็คอินเทอร์เน็ตก่อน ไม่ใช่ปัญหา key'
  return `Supabase ปฏิเสธ: ${error.code ? error.code + ' ' : ''}${msg}`
}

function readEnv(file) {
  if (!fs.existsSync(file)) return null
  return dotenv.parse(fs.readFileSync(file))
}

async function main() {
  const server = readEnv(SERVER_ENV)
  const client = readEnv(CLIENT_ENV)

  console.log('\n[1] Format')
  if (!server) { fail(`ไม่พบ ${SERVER_ENV}`); return }
  if (!client) { fail(`ไม่พบ ${CLIENT_ENV}`); return }

  const url = server.SUPABASE_URL
  const anon = server.SUPABASE_ANON_KEY
  const secret = server.SUPABASE_SERVICE_ROLE_KEY
  const clientUrl = client.EXPO_PUBLIC_SUPABASE_URL
  const clientAnon = client.EXPO_PUBLIC_SUPABASE_ANON_KEY

  keyKind(anon) === 'publishable' ? pass('server SUPABASE_ANON_KEY = publishable') : fail(`server SUPABASE_ANON_KEY = ${keyKind(anon)} (ต้องเป็น sb_publishable_...)`)
  keyKind(secret) === 'secret' ? pass('server SUPABASE_SERVICE_ROLE_KEY = secret') : fail(`server SUPABASE_SERVICE_ROLE_KEY = ${keyKind(secret)} (ต้องเป็น sb_secret_...)`)
  keyKind(clientAnon) === 'publishable' ? pass('client EXPO_PUBLIC_SUPABASE_ANON_KEY = publishable') : fail(`client EXPO_PUBLIC_SUPABASE_ANON_KEY = ${keyKind(clientAnon)} (ต้องเป็น sb_publishable_...)`)
  clientAnon && clientAnon === anon ? pass('client กับ server ใช้ public (anon/publishable) key ตัวเดียวกัน') : fail('public key ของ client กับ server ไม่ตรงกัน')
  url && url === clientUrl ? pass('client กับ server ชี้ project เดียวกัน') : fail('SUPABASE_URL ของ client กับ server ไม่ตรงกัน')
  if (secret && clientAnon === secret) fail('⚠️ client ใช้ secret key — ห้ามเด็ดขาด (ฝังอยู่ใน APK ได้)')
  if (!url || !anon || !secret) return

  const ref = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || 'unknown'
  console.log(`  INFO  project ref: ${ref}`)

  console.log('\n[2] Publishable key (สิทธิ์เดียวกับผู้เล่นที่ยังไม่ login — RLS ต้องกันไว้)')
  const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  {
    const { error, count } = await pub.from('users').select('user_id', { count: 'exact', head: true })
    if (error) fail(`publishable key → ${describe(error)}`)
    else if ((count ?? 0) > 0) fail(`anonymous อ่าน public.users ได้ ${count} แถว — RLS ไม่ได้กัน (ตรวจด่วน)`)
    else pass('Data API รับ key · anonymous อ่าน public.users ไม่ได้ (RLS ทำงาน)')
  }

  console.log('\n[3] Secret key (server admin — bypass RLS)')
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  {
    const { error, count } = await admin.from('users').select('user_id', { count: 'exact', head: true })
    if (error) fail(`secret key (Data API) → ${describe(error)}`)
    else pass(`อ่าน public.users ได้ (${count ?? 0} แถว)`)
  }
  {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    error ? fail(`secret key (Auth admin API) → ${describe(error)}`) : pass('Auth admin API ใช้ได้')
  }
  {
    const { error } = await admin.from('economy_pool_accounts').select('pool_key', { head: true, count: 'exact' })
    error ? fail(`secret key (economy tables) → ${describe(error)}`) : pass('อ่าน economy ledger tables ได้')
  }
}

main()
  .catch(err => { failed++; console.log(`  FAIL  unexpected: ${err && err.message ? err.message : err}`) })
  .finally(() => {
    console.log(failed ? `\nผลรวม: FAIL ${failed} ข้อ — แก้ .env แล้วรันใหม่` : '\nผลรวม: PASS ทั้งหมด — restart server และ Expo (--clear) ก่อนเทส')
    process.exit(failed ? 1 : 0)
  })
