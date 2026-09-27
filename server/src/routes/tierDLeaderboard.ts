import type { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'
import { getTierDLeaderboard } from '../game/tierDLeaderboardService'
import { markPersonalTournamentIntroSeen, markPersonalTournamentRankSeen, markPersonalTournamentRewardSeen } from '../game/tierDMiniTournamentService'
import { getTierDLeagueAwards } from '../game/tierDRewardService'
import { getTierDRecords, getTierDShowcase, type TierDRecordBoard, type TierDRecordLeague } from '../game/tierDRecordsService'

export default async function tierDLeaderboardRoutes(app: FastifyInstance) {
  app.get('/tier-d/leaderboard', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    // The response intentionally exposes only enabled/disabled, never eligible population.
    const rawLevel=(request.query as {level?:string}).level;const level=rawLevel===undefined?undefined:Number(rawLevel)
    return getTierDLeaderboard(data.user.id,Number.isInteger(level)&&level!>0?level:undefined)
  })
  app.post<{Body:{tournamentId?:string;rank?:number}}>('/tier-d/leaderboard/seen',async(request,reply)=>{
    const token=request.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {tournamentId,rank}=request.body??{};if(!tournamentId||!Number.isInteger(rank)||rank!<1)return reply.status(400).send({error:'INVALID_RANK'})
    return markPersonalTournamentRankSeen(data.user.id,tournamentId,rank as number)
  })
  app.post<{Body:{tournamentId?:string}}>('/tier-d/leaderboard/intro-seen',async(request,reply)=>{
    const token=request.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {tournamentId}=request.body??{};if(!tournamentId)return reply.status(400).send({error:'TOURNAMENT_ID_REQUIRED'})
    return markPersonalTournamentIntroSeen(data.user.id,tournamentId)
  })
  app.post<{Body:{tournamentId?:string}}>('/tier-d/leaderboard/reward-seen',async(request,reply)=>{
    const token=request.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {tournamentId}=request.body??{};if(!tournamentId)return reply.status(400).send({error:'TOURNAMENT_ID_REQUIRED'})
    return markPersonalTournamentRewardSeen(data.user.id,tournamentId)
  })
  app.get('/tier-d/awards', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    return { awards: await getTierDLeagueAwards(data.user.id) }
  })
  app.get('/tier-d/records', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const query = request.query as { board?: string; league?: string }
    const board = query.board === 'streak' ? 'streak' : 'pb' as TierDRecordBoard
    const allowedLeagues = new Set(['all','bronze','silver','gold','platinum','diamond','elite','master','grandmaster','legend','mythic'])
    const league = (allowedLeagues.has(query.league ?? 'all') ? query.league ?? 'all' : 'all') as TierDRecordLeague
    return getTierDRecords(board, league)
  })
  app.get('/tier-d/showcase/:userId', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { userId } = request.params as { userId: string }
    return getTierDShowcase(userId)
  })
}
