import type { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'
import { getMiniTournamentStandings, progressPersonalMiniTournament } from '../game/tierDMiniTournamentService'
import { getCurrentLeague, getTierDCompetitionWindow } from '../game/tierDLeague'

export async function tierDMiniTournamentRoutes(app:FastifyInstance){
  app.post<{Body:{level?:number}}>('/tier-d/mini-tournament/progress',async(request,reply)=>{
    const token=request.headers.authorization?.replace('Bearer ','');if(!token)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return reply.status(401).send({error:'UNAUTHORIZED'})
    const level=request.body?.level;if(!Number.isInteger(level)||level!<1)return reply.status(400).send({error:'INVALID_LEVEL'});const safeLevel=level as number
    try{
      return reply.send(await progressPersonalMiniTournament(data.user.id,getCurrentLeague(safeLevel).id,safeLevel,!getTierDCompetitionWindow(safeLevel)))
    }catch(error){return reply.status(409).send({error:error instanceof Error?error.message:'TOURNAMENT_UNAVAILABLE'})}
  })
  app.get<{Querystring:{tournamentId?:string}}>('/tier-d/mini-tournament',async(request,reply)=>{
    const token=request.headers.authorization?.replace('Bearer ','');if(!token)return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return reply.status(401).send({error:'UNAUTHORIZED'})
    if(!request.query.tournamentId)return reply.status(400).send({error:'TOURNAMENT_ID_REQUIRED'})
    try{return reply.send(await getMiniTournamentStandings(request.query.tournamentId,data.user.id))}catch{return reply.status(404).send({error:'TOURNAMENT_NOT_FOUND'})}
  })
}
