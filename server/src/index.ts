import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server } from 'socket.io'
import { authRoutes } from './routes/auth'
import { registerGameSocket } from './sockets/gameSocket'
import * as dotenv from 'dotenv'

dotenv.config()

// สร้าง Fastify instance
const app = Fastify({ logger: true })

// ลงทะเบียน CORS
app.register(cors, { origin: '*' })

// Routes
app.register(authRoutes)

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
    registerGameSocket(io)

    console.log(`TriplePoker Server running on port ${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
