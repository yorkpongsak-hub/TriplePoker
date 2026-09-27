import { createHash } from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { addVipCrewMember, createVipCrew, type CrewSession, type VipCrew } from './vipPrivateCrew'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function loadOrCreateVipCrew(ownerId: string): Promise<VipCrew> {
  await supabaseAdmin.from('vip_private_crews').upsert({ owner_id: ownerId, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
  const { data, error } = await supabaseAdmin.from('vip_private_crew_members').select('player_id,display_name,added_at').eq('owner_id', ownerId).order('added_at')
  if (error) throw error
  let crew = createVipCrew(ownerId)
  for (const row of data ?? []) crew = addVipCrewMember(crew, { playerId: row.player_id, displayName: row.display_name, addedAt: Date.parse(row.added_at) })
  return crew
}

export async function createVipCrewInvite(ownerId: string, token: string, expiresAt: number): Promise<void> {
  await loadOrCreateVipCrew(ownerId)
  const { error } = await supabaseAdmin.from('vip_private_crew_invites').insert({ token_hash: hashToken(token), owner_id: ownerId, expires_at: new Date(expiresAt).toISOString() })
  if (error) throw error
}

export async function acceptVipCrewInvite(token: string, playerId: string, displayName: string, now = Date.now()): Promise<VipCrew> {
  const { data: ownerId, error } = await supabaseAdmin.rpc('accept_vip_private_crew_invite', {
    p_token_hash: hashToken(token), p_player_id: playerId, p_display_name: displayName, p_now: new Date(now).toISOString(),
  })
  if (error || !ownerId) throw new Error(error?.message || 'INVITE_INVALID_OR_EXPIRED')
  return loadOrCreateVipCrew(ownerId)
}

export async function removeVipCrewMemberStored(ownerId: string, playerId: string): Promise<VipCrew> {
  const { error } = await supabaseAdmin.from('vip_private_crew_members').delete().eq('owner_id', ownerId).eq('player_id', playerId)
  if (error) throw error
  return loadOrCreateVipCrew(ownerId)
}

export async function findCrewForPlayer(playerId: string): Promise<VipCrew | null> {
  const { data, error } = await supabaseAdmin.from('vip_private_crew_members').select('owner_id').eq('player_id', playerId).order('added_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.owner_id ? loadOrCreateVipCrew(data.owner_id) : null
}

export async function persistCrewSession(session: CrewSession): Promise<void> {
  const { error } = await supabaseAdmin.from('vip_private_crew_sessions').upsert({
    session_id: session.sessionId, owner_id: session.ownerId, phase: session.phase, state: session,
    version: session.version, created_at: new Date(session.createdAt).toISOString(), ended_at: session.endedAt ? new Date(session.endedAt).toISOString() : null,
  }, { onConflict: 'session_id' })
  if (error) throw error
  const result = session.results.at(-1)
  if (!result) return
  const { error: resultError } = await supabaseAdmin.from('vip_private_crew_match_results').upsert({ session_id: session.sessionId, match_number: result.matchNumber, result, completed_at: new Date(result.completedAt).toISOString() }, { onConflict: 'session_id,match_number' })
  if (resultError) throw resultError
  const rows = Object.entries(result.deltas).map(([playerId, points]) => ({ session_id: session.sessionId, match_number: result.matchNumber, player_id: playerId, points }))
  const { error: ledgerError } = await supabaseAdmin.from('vip_private_crew_score_ledger').upsert(rows, { onConflict: 'session_id,match_number,player_id' })
  if (ledgerError) throw ledgerError
}

export async function loadCrewSession(sessionId: string): Promise<CrewSession | null> {
  const { data, error } = await supabaseAdmin.from('vip_private_crew_sessions').select('state').eq('session_id', sessionId).maybeSingle()
  if (error) throw error
  return (data?.state as CrewSession | undefined) ?? null
}
