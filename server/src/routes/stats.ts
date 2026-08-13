// routes/stats.ts
// Player Stats Leaderboard — GET /stats/leaderboard?type=token|ps|winrate
// Public endpoint (ไม่ต้อง auth — เป็น leaderboard สาธารณะ) ใช้ supabaseAdmin เพราะ RLS ของ
// public.users จำกัดแค่ auth.uid() = user_id (anon client มองเห็นแค่แถวตัวเอง) เหมือน routes/profile.ts
// cache ผลใน Upstash Redis TTL 5 นาที กัน query ทับถี่ๆ ตอนหลายคนเปิดหน้า Stats พร้อมกัน
// ทุก query ใช้ .eq/.in/.select ด้วยคอลัมน์ user_id เสมอ (Known Bug #3 — ห้าม .eq('id', ...))

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabaseAdmin } from '../config/supabase'
import { redis } from '../config/redis'
import type { MatchWinTier } from '../game/matchWinsService'

type BaseLeaderboardType = 'token' | 'ps' | 'winrate' | 'xp' | 'boss_defeats'
type LeaderboardType = BaseLeaderboardType | 'all_matrix'

const CACHE_TTL_SECONDS = 300 // 5 นาที
const TOP_N = 10

interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  value: number
  metrics?: Partial<Record<BaseLeaderboardType, {
    rank: number
    value: number
  }>>
}

function cacheKeyFor(type: LeaderboardType): string {
  // All Matrix v2 มีรายละเอียดอันดับและคะแนนดิบของแต่ละเมตริกซ์
  return type === 'all_matrix' ? 'leaderboard:all_matrix:v2' : `leaderboard:${type}`
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

async function queryXP(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url, xp')
    .order('xp', { ascending: false })
    .limit(TOP_N)
  if (error) throw error
  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    value: row.xp ?? 0,
  }))
}

async function queryBossDefeats(): Promise<LeaderboardEntry[]> {
  const { data: bossRows, error: bossError } = await supabaseAdmin
    .from('player_boss_stats')
    .select('user_id, victories')
  if (bossError) throw bossError

  const totals = new Map<string, number>()
  for (const row of bossRows ?? []) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + (row.victories ?? 0))
  }
  const leaders = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N)
  if (leaders.length === 0) return []

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url')
    .in('user_id', leaders.map(([userId]) => userId))
  if (usersError) throw usersError
  const usersById = new Map((users ?? []).map(user => [user.user_id, user]))

  return leaders.flatMap(([userId, victories], index) => {
    const user = usersById.get(userId)
    return user ? [{ rank: index + 1, user_id: userId, display_name: user.display_name, avatar_url: user.avatar_url, value: victories }] : []
  })
}

async function queryWinRate(): Promise<LeaderboardEntry[]> {
  // Supabase query builder ไม่รองรับ order by expression (games_won/games_played) ตรงๆ —
  // ดึงผู้เล่นที่ผ่านเกณฑ์ games_played ก่อน แล้วคำนวณ + sort ฝั่ง server
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url, games_played, games_won')
  if (error) throw error

  return (data ?? [])
    .map(row => ({
      user_id: row.user_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      // % ทศนิยม 1 ตำแหน่ง
      value: (row.games_played ?? 0) > 0
        ? Math.round(((row.games_won ?? 0) / row.games_played) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)
    .map((row, i) => ({ rank: i + 1, ...row }))
}

async function queryBaseLeaderboard(type: BaseLeaderboardType): Promise<LeaderboardEntry[]> {
  if (type === 'token') return queryToken()
  if (type === 'ps') return queryPS()
  if (type === 'winrate') return queryWinRate()
  if (type === 'xp') return queryXP()
  return queryBossDefeats()
}

async function getCachedBaseLeaderboard(type: BaseLeaderboardType): Promise<LeaderboardEntry[]> {
  const cacheKey = cacheKeyFor(type)
  try {
    const cached = await redis.get<LeaderboardEntry[]>(cacheKey)
    if (cached) return cached
  } catch (err) {
    console.error(`[STATS] Redis read error for ${type}:`, err)
  }

  const entries = await queryBaseLeaderboard(type)
  try {
    await redis.set(cacheKey, entries, { ex: CACHE_TTL_SECONDS })
  } catch (err) {
    console.error(`[STATS] Redis write error for ${type}:`, err)
  }
  return entries
}

const MATRIX_MAX: Record<BaseLeaderboardType, number> = {
  ps: 25,
  winrate: 20,
  boss_defeats: 20,
  xp: 20,
  token: 15,
}

function matrixPoints(max: number, rank: number): number {
  if (rank <= 4) return max - (rank - 1)
  if (rank === 5) return Math.ceil(max / 2)
  return Math.max(0, Math.ceil(max / 2) - 2)
}

// ─── Top10 (per-Tier match win, มติลุงเยาะ 2026-08-13) ──────────────────────
// ต่างจาก leaderboard ด้านบนตรงที่ query จาก match_wins (per-match history) ไม่ใช่ users
// column สะสม — Top10 คือ "ใครทำสถิติโทเคนชนะแมตช์เดียวสูงสุด" ต่อ Tier ไม่ใช่ยอดรวมปัจจุบัน
const TOP10_TIERS: MatchWinTier[] = ['initiate', 'adept', 'mastermind', 'highNoble']
const TOP10_CACHE_TTL_SECONDS = 300

interface Top10Entry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  tokens_won: number
  won_at: string
  is_triple_sweep: boolean
  rank_before: number | null
  rank_after: number | null
}

function top10CacheKeyFor(tier: MatchWinTier): string {
  return `top10:matchwin:${tier}`
}

async function queryTop10(tier: MatchWinTier): Promise<Top10Entry[]> {
  const { data, error } = await supabaseAdmin
    .from('match_wins')
    .select('user_id, tokens_won, won_at, is_triple_sweep, rank_before, rank_after')
    .eq('tier', tier)
    .order('tokens_won', { ascending: false })
  if (error) throw error

  // เก็บแถวแรกที่เจอของแต่ละ user_id เท่านั้น (= personal best เพราะ sort desc แล้ว)
  const bestRowByUser = new Map<string, NonNullable<typeof data>[number]>()
  for (const row of data ?? []) {
    if (!bestRowByUser.has(row.user_id)) bestRowByUser.set(row.user_id, row)
  }
  const top10 = [...bestRowByUser.values()].slice(0, TOP_N)
  if (top10.length === 0) return []

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('user_id, display_name, avatar_url')
    .in('user_id', top10.map(row => row.user_id))
  if (usersError) throw usersError
  const usersById = new Map((users ?? []).map(user => [user.user_id, user]))

  return top10.flatMap((row, index) => {
    const user = usersById.get(row.user_id)
    return user
      ? [{
          rank: index + 1,
          user_id: row.user_id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          tokens_won: row.tokens_won,
          won_at: row.won_at,
          is_triple_sweep: row.is_triple_sweep,
          rank_before: row.rank_before,
          rank_after: row.rank_after,
        }]
      : []
  })
}

async function queryAllMatrix(): Promise<LeaderboardEntry[]> {
  const metricOrder: BaseLeaderboardType[] = ['ps', 'winrate', 'boss_defeats', 'xp', 'token']
  const leaderboards = await Promise.all(metricOrder.map(type => getCachedBaseLeaderboard(type)))
  const candidates = new Map<string, LeaderboardEntry & {
    total: number
    tie: number[]
    metrics: Partial<Record<BaseLeaderboardType, { rank: number; value: number }>>
  }>()

  leaderboards.forEach((entries, metricIndex) => {
    const type = metricOrder[metricIndex]
    entries.forEach(entry => {
      const current = candidates.get(entry.user_id) ?? {
        ...entry,
        total: 0,
        tie: [0, 0, 0, 0, 0],
        metrics: {},
      }
      const points = matrixPoints(MATRIX_MAX[type], entry.rank)
      current.total += points
      current.tie[metricIndex] = points
      current.metrics[type] = { rank: entry.rank, value: entry.value }
      candidates.set(entry.user_id, current)
    })
  })

  return [...candidates.values()]
    .sort((a, b) => b.total - a.total || b.tie[0] - a.tie[0] || b.tie[1] - a.tie[1] || b.tie[2] - a.tie[2] || b.tie[3] - a.tie[3] || b.tie[4] - a.tie[4])
    .slice(0, TOP_N)
    .map((entry, index) => ({
      rank: index + 1,
      user_id: entry.user_id,
      display_name: entry.display_name,
      avatar_url: entry.avatar_url,
      value: entry.total,
      metrics: entry.metrics,
    }))
}

export default async function statsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { type?: string } }>(
    '/stats/leaderboard',
    async (request: FastifyRequest<{ Querystring: { type?: string } }>, reply: FastifyReply) => {
      const type = request.query.type as LeaderboardType | undefined
      if (type !== 'token' && type !== 'ps' && type !== 'winrate' && type !== 'xp' && type !== 'boss_defeats' && type !== 'all_matrix') {
        return reply.status(400).send({ error: 'INVALID_TYPE', message: 'type must be one of: token, ps, winrate, xp, boss_defeats, all_matrix' })
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
        entries = type === 'all_matrix'
          ? await queryAllMatrix()
          : await queryBaseLeaderboard(type)
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

  // GET /stats/top10?tier=initiate|adept|mastermind|highNoble — มติลุงเยาะ 2026-08-13
  // Top 10 ต่อ Tier จัดจาก personal-best tokens_won ของผู้เล่นแต่ละคน — rank_before/rank_after
  // มาจาก match_wins ตรงๆ (คำนวณครั้งเดียวตอน INSERT ใน matchWinsService.ts ไม่ใช่คำนวณสดที่นี่)
  fastify.get<{ Querystring: { tier?: string } }>(
    '/stats/top10',
    async (request: FastifyRequest<{ Querystring: { tier?: string } }>, reply: FastifyReply) => {
      const tier = request.query.tier as MatchWinTier | undefined
      if (!tier || !TOP10_TIERS.includes(tier)) {
        return reply.status(400).send({ error: 'INVALID_TIER', message: 'tier must be one of: initiate, adept, mastermind, highNoble' })
      }

      const cacheKey = top10CacheKeyFor(tier)
      try {
        const cached = await redis.get<Top10Entry[]>(cacheKey)
        if (cached) {
          return reply.send({ success: true, tier, entries: cached, cached: true })
        }
      } catch (err) {
        console.error('[STATS] Redis read error for top10:', err)
      }

      let entries: Top10Entry[] = []
      try {
        entries = await queryTop10(tier)
      } catch (err) {
        console.error(`[STATS] Error querying top10 tier=${tier}:`, err)
        return reply.send({
          success: true,
          tier,
          entries: [],
          cached: false,
          note: 'Top10 data unavailable — check that match_wins.rank_before/rank_after columns exist.',
        })
      }

      try {
        await redis.set(cacheKey, entries, { ex: TOP10_CACHE_TTL_SECONDS })
      } catch (err) {
        console.error('[STATS] Redis write error for top10:', err)
      }

      return reply.send({ success: true, tier, entries, cached: false })
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

  // GET /stats/player/:userId/history — ประวัติชนะอันดับ 1 ล่าสุด 20 รายการ (มติลุงเยาะ 2026-07-26)
  // match_wins ไม่มี cap ที่ตาราง (เก็บตลอดกาล) — LIMIT ที่ query ตรงนี้แทนตามที่ตกลงกัน
  const HISTORY_LIMIT = 20
  fastify.get<{ Params: { userId: string } }>(
    '/stats/player/:userId/history',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params
      const { data, error } = await supabaseAdmin
        .from('match_wins')
        .select('tier, mode, won_at, tokens_won, is_triple_sweep, best_hand, opponents')
        .eq('user_id', userId)
        .order('won_at', { ascending: false })
        .limit(HISTORY_LIMIT)

      if (error) {
        console.error('[STATS] Error querying match_wins for', userId, error)
        return reply.send({ success: true, history: [], note: 'Match history unavailable — check that match_wins table exists.' })
      }

      return reply.send({ success: true, history: data ?? [] })
    }
  )

  // Boss records are deliberately separate from match_wins/History.
  fastify.get<{ Params: { userId: string } }>(
    '/stats/player/:userId/bosses',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params
      const { data, error } = await supabaseAdmin
        .from('player_boss_stats')
        .select('boss_id, encounters, victories, first_defeated_at, last_encountered_at, last_defeated_at, best_hand')
        .eq('user_id', userId)
        .order('last_encountered_at', { ascending: false })

      if (error) {
        console.error('[STATS] Error querying Boss stats for', userId, error)
        return reply.send({ success: true, bosses: [], note: 'Boss stats unavailable — run migration 013_boss_stats.sql.' })
      }

      return reply.send({ success: true, bosses: data ?? [] })
    }
  )
}
