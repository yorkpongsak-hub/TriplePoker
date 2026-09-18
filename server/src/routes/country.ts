import { FastifyInstance } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { countryCode, detectCountry } from '../utils/playerCountry'

export async function countryRoutes(app:FastifyInstance) {
  app.post<{Body:{language?:unknown}}>('/profile/language',async(request,reply)=>{
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token)return reply.status(401).send({error:'Unauthorized'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user)return reply.status(401).send({error:'Unauthorized'})
    const language=request.body?.language
    if(typeof language!=='string'||!['en','th','zh-CN','zh','ja','ko','vi','id','es','pt','fr'].includes(language))return reply.status(400).send({error:'INVALID_LANGUAGE'})
    const {error:writeError}=await supabaseAdmin.from('player_language_preferences').upsert({user_id:data.user.id,language_code:language,updated_at:new Date().toISOString()},{onConflict:'user_id'})
    if(writeError)return reply.status(503).send({error:'LANGUAGE_UNAVAILABLE'})
    return {language_code:language}
  })

  app.post<{Body:{country?:unknown;mode?:unknown}}>('/profile/country',async(request,reply)=>{
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token)return reply.status(401).send({error:'Unauthorized'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user)return reply.status(401).send({error:'Unauthorized'})
    const mode=request.body?.mode??'auto'
    if(!['auto','manual','hidden'].includes(mode as string))return reply.status(400).send({error:'INVALID_MODE'})
    const code=mode==='auto'?detectCountry(request.headers,process.env.COUNTRY_GEO_PROVIDER):mode==='manual'?countryCode(request.body?.country):null
    if(mode==='manual'&&!code)return reply.status(400).send({error:'INVALID_COUNTRY'})
    // No guess from language: English does not imply US, and Thai does not prove residence.
    if(mode!=='auto'||code){
      const {error:writeError}=await supabaseAdmin.from('player_countries').upsert({
        user_id:data.user.id,country_code:code,source:mode==='auto'?'network':mode,updated_at:new Date().toISOString(),
      },{onConflict:'user_id',ignoreDuplicates:mode==='auto'})
      if(writeError)return reply.status(503).send({error:'COUNTRY_UNAVAILABLE'})
    }
    const {data:row,error:readError}=await supabaseAdmin.from('player_countries').select('country_code,source').eq('user_id',data.user.id).maybeSingle()
    if(readError)return reply.status(503).send({error:'COUNTRY_UNAVAILABLE'})
    return {country_code:row?.country_code??null,source:row?.source??null}
  })
}

// Enrich after reading score caches so a changed flag is visible immediately.
// A missing migration or optional country outage must not hide rankings.
export async function withCountries<T extends {user_id:string}>(entries:T[]):Promise<(T&{country_code:string|null})[]> {
  if(!entries.length)return []
  try {
    const {data,error}=await supabaseAdmin.from('player_countries').select('user_id,country_code').in('user_id',entries.map(e=>e.user_id))
    if(error)throw error
    const countries=new Map((data??[]).map(row=>[row.user_id,countryCode(row.country_code)]))
    return entries.map(entry=>({...entry,country_code:countries.get(entry.user_id)??null}))
  }catch{return entries.map(entry=>({...entry,country_code:null}))}
}
