import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server } from 'socket.io'
import { authRoutes } from './routes/auth'
import { profileRoutes } from './routes/profile'
import statsRoutes from './routes/stats'
import crownVaultRoutes from './routes/crownVault'
import merchRoutes from './routes/merch'
import sovereignRoutes from './routes/sovereign'
import { startSovereignLifecycleRuntime } from './arena/sovereign/sovereignLifecycleRuntime'
import { registerGameSocket } from './sockets/gameSocket'
import { registerArenaSocket } from './arena/realtime/arenaSocket'
import { registerSpectatorSocket } from './spectator/spectatorSocket'
import { attachSpectatorService } from './spectator/spectatorRuntime'
import { validateGameConfig } from './config/gameConfig'
import { validateVipPlusFoundation } from './game/vipPlusFoundation'
import * as dotenv from 'dotenv'

dotenv.config()

// Economy Progression Spec v2.0 §11 ข้อ 5 — fail fast ถ้า gameConfig.ts ขัดกันเอง (เช่น callAmount
// ไม่ตรงกับ grandFinaleBetting หรือ progressionGate.minToken ไม่ตรงกับ tierRanges.min)
validateGameConfig()
validateVipPlusFoundation()

// สร้าง Fastify instance
const app = Fastify({ logger: true })

// ลงทะเบียน CORS
app.register(cors, { origin: '*' })

// Routes
app.register(authRoutes)
app.register(profileRoutes)
app.register(statsRoutes)
app.register(crownVaultRoutes)
app.register(merchRoutes)
app.register(sovereignRoutes)

// Health check
app.get('/health', async () => ({
  status: 'ok',
  project: 'TriplePoker',
  studio: 'The Sage Unicorn'
}))

// เริ่ม server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001
    await app.listen({ port, host: '0.0.0.0' })

    // Socket.IO ใช้ Fastify server ตัวเดียวกัน
    const io = new Server(app.server, {
      cors: { origin: '*' }
    })
    const spectatorService = registerSpectatorSocket(io)
    attachSpectatorService(spectatorService)
    registerGameSocket(io, spectatorService)
    registerArenaSocket(io)
    startSovereignLifecycleRuntime()

    console.log(`TriplePoker Server running on port ${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
