import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server } from 'socket.io'
import { authRoutes } from './routes/auth'
import { profileRoutes } from './routes/profile'
import { countryRoutes } from './routes/country'
import statsRoutes from './routes/stats'
import crownVaultRoutes from './routes/crownVault'
import merchRoutes from './routes/merch'
import sovereignRoutes from './routes/sovereign'
import rewardsRoutes from './routes/rewards'
import badgeRoutes from './routes/badges'
import tierDLeaderboardRoutes from './routes/tierDLeaderboard'
import { tierDRewardRoutes } from './routes/tierDRewards'
import { tierDItemOfferRoutes } from './routes/tierDItemOffers'
import { tierDMiniTournamentRoutes } from './routes/tierDMiniTournament'
import { lockExpiredMiniTournaments } from './game/tierDMiniTournamentService'
import { adRoutes } from './routes/ads'
import { dailyStreakRoutes } from './routes/dailyStreak'
import { startSovereignLifecycleRuntime } from './arena/sovereign/sovereignLifecycleRuntime'
import { registerGameSocket } from './sockets/gameSocket'
import { registerArenaSocket } from './arena/realtime/arenaSocket'
import { registerSpectatorSocket } from './spectator/spectatorSocket'
import { attachSpectatorService } from './spectator/spectatorRuntime'
import { validateGameConfig } from './config/gameConfig'
import { validateVipPlusFoundation } from './game/vipPlusFoundation'
import { supabase } from './config/supabase'
import { buildOriginPolicy, takeRate, type RateState } from './security/runtimeSecurity'
import * as dotenv from 'dotenv'

dotenv.config()

// Economy Progression Spec v2.0 §11 ข้อ 5 — fail fast ถ้า gameConfig.ts ขัดกันเอง (เช่น callAmount
// ไม่ตรงกับ grandFinaleBetting หรือ progressionGate.minToken ไม่ตรงกับ tierRanges.min)
validateGameConfig()
validateVipPlusFoundation()

// สร้าง Fastify instance
const app = Fastify({
  logger: true,
  bodyLimit: 64 * 1024,
  requestTimeout: 15_000,
  connectionTimeout: 10_000,
  maxParamLength: 200,
})

const originAllowed = buildOriginPolicy(process.env.ALLOWED_ORIGINS ?? '', process.env.NODE_ENV === 'production')
const httpRate = new Map<string, RateState>()
const socketConnections = new Map<string, RateState>()

// ลงทะเบียน CORS
app.register(cors, { origin: (origin, callback) => callback(null, originAllowed(origin)) })
app.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0]
  const sensitive = /auth|reward|claim|purchase|ad\/complete/i.test(path)
  const withinGlobalLimit = takeRate(httpRate, request.ip, 180, 60_000)
  const withinSensitiveLimit = !sensitive || takeRate(httpRate, `${request.ip}:sensitive`, 30, 60_000)
  if (!withinGlobalLimit || !withinSensitiveLimit) {
    reply.header('Retry-After', '60')
    return reply.status(429).send({ error: 'RATE_LIMITED' })
  }
})
app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('Referrer-Policy', 'no-referrer')
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  reply.header('Cache-Control', 'no-store')
  return payload
})

// Routes
app.register(authRoutes)
app.register(profileRoutes)
app.register(countryRoutes)
app.register(statsRoutes)
app.register(crownVaultRoutes)
app.register(merchRoutes)
if (process.env.SOVEREIGN_ENABLED === 'true') app.register(sovereignRoutes)
app.register(rewardsRoutes)
app.register(badgeRoutes)
app.register(tierDLeaderboardRoutes)
app.register(tierDRewardRoutes)
app.register(tierDItemOfferRoutes)
app.register(tierDMiniTournamentRoutes)
app.register(adRoutes)
app.register(dailyStreakRoutes)

// Health check
app.get('/health', async () => ({
  status: 'ok',
  project: 'TriplePoker',
  studio: 'The Sage Unicorn'
}))
app.get('/health/live', async () => ({ status: 'ok' }))
app.get('/health/ready', async (_request, reply) => {
  const timeout = new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3_000))
  try {
    const result = await Promise.race([supabase.from('users').select('user_id', { head: true, count: 'exact' }).limit(1), timeout])
    if (result.error) throw result.error
    return { status: 'ready' }
  } catch {
    return reply.status(503).send({ status: 'not_ready' })
  }
})

// เริ่ม server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001
    await app.listen({ port, host: '0.0.0.0' })

    // Socket.IO ใช้ Fastify server ตัวเดียวกัน
    const io = new Server(app.server, {
      cors: { origin: (origin, callback) => callback(null, originAllowed(origin)) },
      allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin)),
      maxHttpBufferSize: 32 * 1024,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    })
    io.use(async (socket, next) => {
      const address = socket.handshake.address || 'unknown'
      if (!takeRate(socketConnections, address, 30, 60_000)) return next(new Error('RATE_LIMITED'))
      const token = typeof socket.handshake.auth?.accessToken === 'string' ? socket.handshake.auth.accessToken : ''
      if (!token || token.length > 4096) return next(new Error('UNAUTHORIZED'))
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data.user) return next(new Error('UNAUTHORIZED'))
      socket.data.authUserId = data.user.id
      socket.data.packetRate = { count: 0, resetAt: Date.now() + 10_000 }
      next()
    })
    const spectatorService = registerSpectatorSocket(io)
    attachSpectatorService(spectatorService)
    registerGameSocket(io, spectatorService)
    if (process.env.SOVEREIGN_ENABLED === 'true') {
      registerArenaSocket(io)
      startSovereignLifecycleRuntime()
    }
    // 24-hour Mini Tournament settlement is server-driven; API reads only act
    // as an idempotent fallback if this worker was temporarily unavailable.
    setInterval(() => { void lockExpiredMiniTournaments().catch(error => app.log.error(error, 'Mini tournament deadline sweep failed')) }, 60_000)

    console.log(`TriplePoker Server running on port ${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
