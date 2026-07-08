import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'

dotenv.config()

// สร้าง Redis client (Upstash)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
})
