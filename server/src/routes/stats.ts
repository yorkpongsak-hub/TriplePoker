// routes/stats.ts
// Player Stats Leaderboard — GET /stats/leaderboard?type=token|ps|winrate
// Public endpoint (ไม่ต้อง auth — เป็น leaderboard สาธารณะ) ใช้ supabaseAdmin เพราะ RLS ของ
// public.users จำกัดแค่ auth.uid() = user_id (anon client มองเห็นแค่แถวตัวเอง) เหมือน routes/profile.ts
// cache ผลใน Upstash Redis TTL 5 นาที กัน query ทับถี่ๆ ตอนหลายคนเปิดหน้า Stats พร้อมกัน
// ทุก query ใช้ .eq/.in/.select ด้วยคอลัมน์ user_id เสมอ (Known Bug #3 — ห้าม .eq('id', ...))

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabaseAdmin } from '../config/supabase'
import { redis } from '../config/redis'

type LeaderboardType = 'token' | 'ps' | 'winrate'

const CACHE_TTL_SECONDS = 300 // 5 นาที
const TOP_N = 10
// winrate: กัน sample เล็ก (เช่น 1/1 = 100%) บิดอันดับ — เกณฑ์ตาม task spec
const MIN_GAMES_FOR_WINRATE = 10

interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  value: number
}

function cacheKeyFor(type: LeaderboardType): string {
  return `leaderboard:${type}`
}

async function queryToken(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url, token_balance')
    .order('token_balance', { ascending: false })
    .limit(TOP_N)
  if (error) throw error
  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    value: row.token_balance ?? 0,
  }))
}

async function queryPS(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url, performance_score')
    .order('performance_score', { ascending: false })
    .limit(TOP_N)
  if (error) throw error
  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    value: row.performance_score ?? 0,
  }))
}

async function queryWinRate(): Promise<LeaderboardEntry[]> {
  // Supabase query builder ไม่รองรับ order by expression (games_won/games_played) ตรงๆ —
  // ดึงผู้เล่นที่ผ่านเกณฑ์ games_played ก่อน แล้วคำนวณ + sort ฝั่ง server
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url, games_played, games_won')
    .gte('games_played', MIN_GAMES_FOR_WINRATE)
  if (error) throw error

  return (data ?? [])
    .map(row => ({
      user_id: row.user_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      // % ทศนิยม 1 ตำแหน่ง
      value: Math.round(((row.games_won ?? 0) / row.games_played) * 1000) / 10,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)
    .map((row, i) => ({ rank: i + 1, ...row }))
}

export default async function statsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { type?: string } }>(
    '/stats/leaderboard',
    async (request: FastifyRequest<{ Querystring: { type?: string } }>, reply: FastifyReply) => {
      const type = request.query.type as LeaderboardType | undefined
      if (type !== 'token' && type !== 'ps' && type !== 'winrate') {
        return reply.status(400).send({ error: 'INVALID_TYPE', message: 'type must be one of: token, ps, winrate' })
      }

      const cacheKey = cacheKeyFor(type)

      // 1) ลอง cache ก่อน
      try {
        const cached = await redis.get<LeaderboardEntry[]>(cacheKey)
        if (cached) {
          return reply.send({ success: true, type, entries: cached, cached: true, updatedAt: null })
        }
      } catch (err) {
        console.error('[STATS] Redis read error:', err)
        // Redis ล่ม → ตกไป query DB ตรงๆ ต่อ ไม่ throw
      }

      // 2) query DB จริง
      let entries: LeaderboardEntry[] = []
      try {
        if (type === 'token') entries = await queryToken()
        else if (type === 'ps') entries = await queryPS()
        else entries = await queryWinRate()
      } catch (err) {
        // เผื่อ games_played/games_won ยังไม่มีคอลัมน์ (SQL migration ยังไม่ได้รันบน Supabase) — ตอบ empty list แทน 500
        console.error(`[STATS] Error querying leaderboard type=${type}:`, err)
        return reply.send({
          success: true,
          type,
          entries: [],
          cached: false,
          updatedAt: new Date().toISOString(),
          note: 'Leaderboard data unavailable — check that required columns exist on public.users.',
        })
      }

      // 3) เขียน cache (ไม่ block response ถ้า Redis ล่ม)
      try {
        await redis.set(cacheKey, entries, { ex: CACHE_TTL_SECONDS })
      } catch (err) {
        console.error('[STATS] Redis write error:', err)
      }

      return reply.send({ success: true, type, entries, cached: false, updatedAt: new Date().toISOString() })
    }
  )

  // GET /stats/player/:userId — public read-only stats สำหรับหน้า Player Profile Viewer
  // (มติลุงเยาะ 2026-07-26: คลิกชื่อ/Avatar จาก Top 10 leaderboard เข้ามาดูตรงนี้) ไม่ auth เหมือน
  // leaderboard ด้านบน เพราะโชว์แค่ field เดียวกับที่ leaderboard เปิดเผยอยู่แล้วทุก field
  // (ไม่มี crown_balance/iap_token_total/vip_status ที่ sensitive กว่า)
  fastify.get<{ Params: { userId: string } }>(
    '/stats/player/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('user_id, display_name, avatar_url, tier_unlocked_max, token_balance, performance_score, games_played, games_won')
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Player not found.' })
      }

      const gamesPlayed = data.games_played ?? 0
      const gamesWon = data.games_won ?? 0
      const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 1000) / 10 : 0

      return reply.send({
        success: true,
        player: {
          user_id: data.user_id,
          display_name: data.display_name,
          avatar_url: data.avatar_url,
          tier_unlocked_max: data.tier_unlocked_max,
          token_balance: data.token_balance ?? 0,
          performance_score: data.performance_score ?? 0,
          games_played: gamesPlayed,
          games_won: gamesWon,
          win_rate: winRate,
        },
      })
    }
  )
}
