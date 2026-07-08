// ─────────────────────────────────────────────────────────────────────────────
// routes/user.ts — User API Routes
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   GET  /users/me              → ดึงข้อมูล profile + token balance ตัวเอง
//   GET  /users/:id             → ดึงข้อมูล profile ผู้เล่นคนอื่น (public)
//   PATCH /users/me             → อัพเดท displayName, avatar
//   GET  /users/me/token        → ดึง token balance + debt status
//   POST /users/me/debt/pay-ad  → ชำระหนี้ด้วย Ad reward
//   POST /users/me/debt/pay-later → เลือก Pay Later (Debt Badge)
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { gameConfig } from '../config/gameConfig';
import { getTierByToken } from '../game/pileResolution';

// ─── Plugin Register ──────────────────────────────────────────────────────────

export default async function userRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /users/me — Profile ตัวเอง ────────────────────────────────────────
  fastify.get('/users/me', {
    preHandler: [fastify.authenticate],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).userId as string;

    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id,
        display_name,
        avatar_url,
        token_balance,
        debt_amount,
        has_debt_badge,
        is_vip,
        vip_expires_at,
        pile3_wins_total,
        created_at,
        last_login_at
      `)
      .eq('id', userId)
      .single();

    if (error || !user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // คำนวณ Tier จาก token
    const tier = getTierByToken(user.token_balance);

    return reply.send({
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      tokenBalance: user.token_balance,
      tier,
      debt: {
        hasDebt: user.has_debt_badge,
        amount: user.debt_amount ?? 0,
      },
      isVIP: user.is_vip,
      vipExpiresAt: user.vip_expires_at,
      stats: {
        pile3WinsTotal: user.pile3_wins_total ?? 0,
      },
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
    });
  });

  // ── GET /users/:id — Public Profile ───────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/users/:id',
    async (req, reply) => {
      const { id } = req.params;

      const { data: user, error } = await supabase
        .from('users')
        .select(`
          id,
          display_name,
          avatar_url,
          token_balance,
          is_vip,
          pile3_wins_total,
          created_at
        `)
        .eq('id', id)
        .single();

      if (error || !user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const tier = getTierByToken(user.token_balance);

      return reply.send({
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        tier,
        isVIP: user.is_vip,
        stats: {
          pile3WinsTotal: user.pile3_wins_total ?? 0,
        },
        createdAt: user.created_at,
      });
    }
  );

  // ── PATCH /users/me — อัพเดท Profile ─────────────────────────────────────
  fastify.patch<{
    Body: { displayName?: string; avatarUrl?: string }
  }>('/users/me', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const userId = (req as any).userId as string;
    const { displayName, avatarUrl } = req.body;

    if (!displayName && !avatarUrl) {
      return reply.status(400).send({ error: 'Nothing to update' });
    }

    const updates: Record<string, string> = {};
    if (displayName) {
      if (displayName.length < 2 || displayName.length > 20) {
        return reply.status(400).send({ error: 'Display name must be 2–20 characters' });
      }
      updates.display_name = displayName;
    }
    if (avatarUrl) updates.avatar_url = avatarUrl;

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    if (error) {
      return reply.status(500).send({ error: 'Failed to update profile' });
    }

    return reply.send({ success: true });
  });

  // ── GET /users/me/token — Token Balance + Debt ────────────────────────────
  fastify.get('/users/me/token', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const userId = (req as any).userId as string;

    const { data, error } = await supabase
      .from('users')
      .select('token_balance, debt_amount, has_debt_badge, is_vip')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const tier = getTierByToken(data.token_balance);

    return reply.send({
      tokenBalance: data.token_balance,
      tier,
      debt: {
        hasDebt: data.has_debt_badge,
        amount: data.debt_amount ?? 0,
        installmentRate: gameConfig.debtRecovery.installment.deductPercent,
      },
      isVIP: data.is_vip,
    });
  });

  // ── POST /users/me/debt/pay-ad — ชำระหนี้ด้วย Ad ──────────────────────────
  fastify.post('/users/me/debt/pay-ad', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const userId = (req as any).userId as string;

    const { data: user, error } = await supabase
      .from('users')
      .select('token_balance, debt_amount, has_debt_badge')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (!user.has_debt_badge || (user.debt_amount ?? 0) <= 0) {
      return reply.status(400).send({ error: 'No active debt' });
    }

    const adReward = gameConfig.debtRecovery.adReward.tokenPerAd;
    const currentDebt = user.debt_amount ?? 0;
    const debtCleared = Math.min(adReward, currentDebt);
    const newDebt = currentDebt - debtCleared;
    const newBalance = user.token_balance + debtCleared;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        token_balance: newBalance,
        debt_amount: newDebt,
        has_debt_badge: newDebt > 0,
      })
      .eq('id', userId);

    if (updateError) {
      return reply.status(500).send({ error: 'Failed to process ad reward' });
    }

    return reply.send({
      success: true,
      debtCleared,
      debtRemaining: newDebt,
      newBalance,
    });
  });

  // ── POST /users/me/debt/pay-later — เลือก Pay Later ──────────────────────
  fastify.post('/users/me/debt/pay-later', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const userId = (req as any).userId as string;

    const { data: user, error } = await supabase
      .from('users')
      .select('debt_amount')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if ((user.debt_amount ?? 0) <= 0) {
      return reply.status(400).send({ error: 'No active debt' });
    }

    // เปิด Debt Badge — หัก 20% จาก Pot ทุก Hand อัตโนมัติ
    const { error: updateError } = await supabase
      .from('users')
      .update({ has_debt_badge: true })
      .eq('id', userId);

    if (updateError) {
      return reply.status(500).send({ error: 'Failed to activate debt badge' });
    }

    return reply.send({
      success: true,
      message: 'Debt badge activated — 20% deducted from future pot winnings',
      installmentRate: gameConfig.debtRecovery.installment.deductPercent,
    });
  });
}
