import { FastifyInstance } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { recoverStaleEscrow } from '../game/gameLoop'
import { assertVip, assertVipPro, VipStatus } from '../middleware/vipGuard'
import { getAvatarPreset, isAvatarKeyAllowed, DEFAULT_AVATAR_KEY } from '../constants/avatarPresets'

const VALID_TIERS = ['initiate', 'adept', 'mastermind', 'high_noble', 'last_boss'] as const

export async function profileRoutes(app: FastifyInstance) {

  // เรียกตอนเปิดแอป/login (client/app/_layout.tsx) — กู้คืน escrow ที่ค้าง 'in_match' เกิน 60 นาที
  // (client force-close/crash กลางแมตช์ก่อนหน้า) ก่อนที่ผู้เล่นจะพยายาม join โต๊ะใหม่ด้วยซ้ำ (Buy-in Spec §4)
  app.post('/profile/recover-escrow', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }

    const result = await recoverStaleEscrow(authData.user.id)

    // --- Profile Picture v1.0: lazy cleanup (app-open housekeeping) ---
    // VIP หมดอายุ = ลบรูปจริงทิ้งตาม spec (ตั้งใหม่ได้ตอนกลับมาเป็น VIP)
    // แยก try/catch ของตัวเอง — ห้ามให้ cleanup พังแล้วลาก escrow recovery ล้มไปด้วย
    try {
      const userId = authData.user.id
      const { data: picUser } = await supabaseAdmin
        .from('users')
        .select('vip_status, profile_image_url, avatar_url')
        .eq('user_id', userId)
        .maybeSingle()
      const vipStatus: VipStatus = (picUser?.vip_status as VipStatus) ?? 'none'
      const vipExpired = vipStatus === 'none'
      if (picUser && vipExpired && picUser.profile_image_url) {
        // ลบไฟล์จาก storage ก่อน (service role ข้าม RLS ได้)
        const { error: rmErr } = await supabaseAdmin.storage
          .from('avatars')
          .remove([picUser.profile_image_url])
        // ลบ file สำเร็จ (หรือไฟล์ไม่มีอยู่แล้ว) ค่อยเคลียร์ field ใน DB
        if (!rmErr) {
          await supabaseAdmin
            .from('users')
            .update({ profile_image_url: null })
            .eq('user_id', userId)
        }
      }

      // Avatar Preset revert: ถ้า preset ที่เลือกไว้ tier สูงกว่า vip_status ปัจจุบัน (VIP หมดอายุ/downgrade)
      // → รีเซ็ตเป็น default อัตโนมัติ — เช็คเฉพาะ key ที่รู้จัก (avatar_url แบบ emoji ตรงๆ เดิมข้ามไป ไม่บังคับรีเซ็ต)
      const currentPreset = picUser?.avatar_url ? getAvatarPreset(picUser.avatar_url) : undefined
      if (currentPreset && !isAvatarKeyAllowed(picUser!.avatar_url, vipStatus)) {
        await supabaseAdmin
          .from('users')
          .update({ avatar_url: DEFAULT_AVATAR_KEY })
          .eq('user_id', userId)
      }
    } catch (e) {
      console.log('[profile] avatar cleanup skipped:', e)
    }

    return reply.send({ success: true, ...result })
  })

  // Lobby Matchmaking Spec v1.0 §1.3 — บันทึกว่าผู้เล่นเคยเห็น Tier Unlock Celebration ของ tier นี้แล้ว
  // (กัน replay ซ้ำเมื่อเปลี่ยนเครื่อง — เก็บใน Supabase ไม่ใช่ AsyncStorage)
  app.post<{ Body: { tier?: string } }>('/profile/celebrate-tier', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }

    const { tier } = request.body ?? {}
    if (!tier || !VALID_TIERS.includes(tier as any)) {
      return reply.status(400).send({ error: 'INVALID_TIER', message: 'tier must be one of: ' + VALID_TIERS.join(', ') })
    }

    // ใช้ supabaseAdmin เพราะ RLS ของ public.users จำกัดแค่ auth.uid() = user_id — anon client เดิมมองไม่เห็นแถวเลย
    const { data: userData, error: readError } = await supabaseAdmin
      .from('users')
      .select('tier_unlock_celebrated')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (readError) {
      return reply.status(500).send({ error: 'DB_ERROR', message: 'Please try again.' })
    }
    if (!userData) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User record not found.' })
    }

    const current: string[] = userData.tier_unlock_celebrated ?? []
    const updated = current.includes(tier) ? current : [...current, tier]

    if (updated.length !== current.length) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ tier_unlock_celebrated: updated })
        .eq('user_id', authData.user.id)

      if (updateError) {
        return reply.status(500).send({ error: 'DB_ERROR', message: 'Please try again.' })
      }
    }

    return reply.send({ success: true, tierUnlockCelebrated: updated })
  })

  // ── POST /profile/avatar ────────────────────────────────────────────
  // เปลี่ยน Avatar Preset (emoji เดิม 24 แบบ + รูปภาพ VIP ใหม่ 9 แบบ) — endpoint เดียวที่อนุญาต
  // ให้เขียน avatar_url ตั้งแต่นี้ไป (client ห้ามเขียน Supabase ตรงอีกต่อไป — validate tier ที่นี่เท่านั้น)
  app.post<{ Body: { avatarKey?: string } }>('/profile/avatar', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }
    const userId = authData.user.id

    const { avatarKey } = request.body ?? {}
    if (!avatarKey) {
      return reply.status(400).send({ error: 'INVALID_AVATAR_KEY', message: 'avatarKey is required' })
    }

    const preset = getAvatarPreset(avatarKey)
    if (!preset) {
      return reply.status(400).send({ error: 'INVALID_AVATAR_KEY', message: 'Unknown avatar preset key' })
    }

    try {
      if (preset.tier === 'vip_pro') {
        await assertVipPro(userId)
      } else if (preset.tier === 'vip') {
        await assertVip(userId, 'cosmetic')
      }
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({
        error: err.code ?? 'VIP_REQUIRED',
        upgrade_url: err.upgrade_url ?? '/shop/vip',
        message: preset.tier === 'vip_pro'
          ? 'This avatar is VIP PRO exclusive.'
          : 'This avatar requires VIP membership.',
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: avatarKey })
      .eq('user_id', userId)

    if (updateError) {
      return reply.status(500).send({ error: 'DB_ERROR', message: 'Please try again.' })
    }

    return reply.send({ success: true, avatarKey })
  })
}
