// ─────────────────────────────────────────────────────────────────────────────
// apiService.ts — Fastify API Calls
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  UserProfileResponse, PublicProfileResponse,
  UpdateProfileRequest, TokenBalanceResponse,
  DebtPayAdResponse, ApiError,
} from '../types/api.types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ─── Base Fetch ───────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── User Endpoints ───────────────────────────────────────────────────────────

/** ดึง profile ตัวเอง */
export async function getMyProfile(token: string): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>('/users/me', {}, token);
}

/** ดึง public profile ผู้เล่นอื่น */
export async function getPublicProfile(userId: string, token: string): Promise<PublicProfileResponse> {
  return apiFetch<PublicProfileResponse>(`/users/${userId}`, {}, token);
}

/** อัพเดท display name / avatar */
export async function updateProfile(body: UpdateProfileRequest, token: string): Promise<void> {
  return apiFetch<void>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }, token);
}

/** ดึง token balance + debt */
export async function getTokenBalance(token: string): Promise<TokenBalanceResponse> {
  return apiFetch<TokenBalanceResponse>('/users/me/token', {}, token);
}

/** ชำระหนี้ด้วย Ad */
export async function payDebtWithAd(token: string): Promise<DebtPayAdResponse> {
  return apiFetch<DebtPayAdResponse>('/users/me/debt/pay-ad', { method: 'POST' }, token);
}

/** เลือก Pay Later → เปิด Debt Badge */
export async function payDebtLater(token: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/users/me/debt/pay-later', { method: 'POST' }, token);
}
