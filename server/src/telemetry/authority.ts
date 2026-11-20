import { createHash } from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { entitlementsFromVipStatus } from '../game/membershipEntitlements'
import { gameTelemetry, enqueueServerTelemetry, anonymousGameId } from './gameplay'
import { telemetryConfig, type TelemetryContext, type MembershipSnapshot } from './schema'

type EventName = 'token_balance_change'|'item_use'|'item_reward'|'ad_reward'
export function receiptUuid(key: string): string {
  const bytes=createHash('sha256').update(`rise-receipt-v1:${key}`).digest().subarray(0,16)
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128
  const s=bytes.toString('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`
}
export function membershipSnapshot(status: string): MembershipSnapshot | undefined {
  if (!['none','vip','vip_pro'].includes(status)) return undefined
  const {plan,...entitlements}=entitlementsFromVipStatus(status)
  return {plan,entitled:plan!=='FREE',entitlements}
}
// Read-only observers: receipts capture context at the call; ledger player IDs
// resolve from committed rows. No observer is awaited by economy/gameplay.
// Raw account/request keys are never included in uploaded telemetry.
export class AuthorityTelemetry {
  private active=0
  readonly diagnostics={failed:0,dropped:0}
  constructor(private readonly enabled=()=>telemetryConfig().enabled,
    private readonly context=(userId:string)=>gameTelemetry.context(userId),
    private readonly db=supabaseAdmin,
    private readonly emit=enqueueServerTelemetry) {}
  private capture(userId:string) {
    try {return this.enabled()?this.context(userId):undefined}
    catch {this.diagnostics.failed++;return undefined}
  }
  private observe(work:()=>Promise<void>) {
    try {
      if (!this.enabled()) return
      if (this.active>=16) {this.diagnostics.dropped++;return}
      this.active++
      // Every query also has an abort signal, so timeout does not create unlimited
      // unfinished read requests when PostgreSQL is unavailable.
      void work().catch(()=>{this.diagnostics.failed++}).finally(()=>{this.active--})
    } catch {this.diagnostics.failed++}
  }
  private async read(query:any):Promise<any> {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000)
    try {
      const result=await Promise.race([query.abortSignal(controller.signal),new Promise<never>((_,reject)=>{
        controller.signal.addEventListener('abort',()=>reject(new Error('TELEMETRY_READ_TIMEOUT')),{once:true})
      })])
      if(result.error)throw new Error('TELEMETRY_READ_FAILED')
      return result.data
    } finally {clearTimeout(timer)}
  }
  private async member(userId:string) {
    try {
      const row=await this.read(this.db.from('users').select('vip_status').eq('user_id',userId).maybeSingle())
      return row?membershipSnapshot(row.vip_status):undefined
    } catch {return undefined}
  }
  private send(ctx:TelemetryContext,userId:string,key:string,name:EventName,properties:unknown,at:string|number,membership?:MembershipSnapshot) {
    try {
      const env=telemetryConfig().environment
      this.emit(ctx,name,properties,typeof at==='number'?at:Date.parse(at),receiptUuid(`${env}:${userId}:${name}:${key}`),membership)
    } catch {}
  }
  private id(userId:string,key:string) {return receiptUuid(`${telemetryConfig().environment}:${userId}:${key}`)}
  refreshMembership(userId:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const snapshot=await this.member(userId)
      if(snapshot)gameTelemetry.setMembership(userId,ctx.session_id,snapshot)
    })
  }
  ledger(transactionId:number|string):void {
    this.observe(async()=>{
      const rows=await this.read(this.db.from('economy_ledger_entries')
        .select('id,transaction_id,account_id,amount,balance_before,balance_after,created_at,economy_transactions!inner(reason,tier)')
        .eq('transaction_id',transactionId).eq('account_type','PLAYER').eq('currency','TOKEN'))
      for(const row of rows??[]) {
        const ctx=this.capture(row.account_id);if(!ctx)continue
        const tx=row.economy_transactions
        if(tx.tier && !['tier_d','initiate','adept','mastermind','highNoble'].includes(tx.tier))continue
        const delta=Number(row.amount),before=Number(row.balance_before),after=Number(row.balance_after)
        if([row.id,row.transaction_id].some(id=>typeof id==='number'&&!Number.isSafeInteger(id)))continue
        if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||before+delta!==after)continue
        const membership=await this.member(row.account_id)
        const properties={transaction_id:String(row.transaction_id),ledger_id:String(row.id),delta,balance_before:before,balance_after:after,
          flow:delta>0?'source':'sink',reason:tx.reason,...(tx.tier?{tier:tx.tier}:{})}
        this.send(ctx,row.account_id,`ledger:${row.id}`,'token_balance_change',properties,row.created_at,membership)
        if(tx.reason==='AD_REWARD' && delta>0)this.send(ctx,row.account_id,`ledger:${row.id}`,'ad_reward',
          {claim_id:this.id(row.account_id,`transaction:${row.transaction_id}`),placement:'TOKEN_RESCUE',reward_type:'token',quantity:delta},row.created_at,membership)
      }
    })
  }
  ledgerKey(key:string):void {
    this.observe(async()=>{
      const row=await this.read(this.db.from('economy_transactions').select('id').eq('idempotency_key',key).maybeSingle())
      if(row)this.ledger(row.id)
    })
  }
  itemUse(input:{userId:string;gameId:string;matchNumber:number;requestId:string}):void {
    const ctx=this.capture(input.userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('tier_d_item_action_receipts').select('item_key,created_at')
        .eq('user_id',input.userId).eq('game_id',input.gameId).eq('match_number',input.matchNumber).eq('request_id',input.requestId).maybeSingle())
      if(!row)return
      const key=`item-action:${input.gameId}:${input.matchNumber}:${input.requestId}`
      this.send(ctx,input.userId,key,'item_use',{receipt_id:this.id(input.userId,key),item_type:row.item_key,quantity:1,tier:'tier_d',
        game_id:anonymousGameId(`tier_d:${input.gameId}`),match_number:input.matchNumber},row.created_at,await this.member(input.userId))
    })
  }
  bombUse(userId:string,eventId:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('tier_d_bomb_defuser_uses').select('used_at').eq('user_id',userId).eq('bomb_event_id',eventId).maybeSingle())
      if(row) { const key=`bomb-use:${eventId}`;this.send(ctx,userId,key,'item_use',
        {receipt_id:this.id(userId,key),item_type:'bomb_defuser',quantity:1,tier:'tier_d'},row.used_at,await this.member(userId)) }
    })
  }
  level(userId:string,level:number,newAdSlots:unknown=[]):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const rows=await this.read(this.db.from('tier_d_level_item_rewards').select('reward_slot,item_key,granted_quantity,claimed_at')
        .eq('user_id',userId).eq('level',level).not('claimed_at','is',null))
      const membership=await this.member(userId)
      for(const row of rows??[]) {
        const key=`level:${level}:${row.reward_slot}`
        this.send(ctx,userId,key,'item_reward',{receipt_id:this.id(userId,key),item_type:row.item_key,quantity:row.granted_quantity,reward_source:'level_clear',tier:'tier_d',level},row.claimed_at,membership)
        if(Array.isArray(newAdSlots)&&newAdSlots.includes(row.reward_slot))this.send(ctx,userId,key,'ad_reward',
          {claim_id:this.id(userId,key),placement:'TIER_D_LEVEL_CLEAR',reward_type:row.item_key,quantity:row.granted_quantity},row.claimed_at,membership)
      }
    })
  }
  runtimeAd(userId:string,eventId:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('tier_d_runtime_item_ad_claims').select('item_key,claimed_at').eq('user_id',userId).eq('event_id',eventId).maybeSingle())
      if(!row)return
      const key=`runtime-ad:${eventId}`,membership=await this.member(userId)
      this.reward(ctx,userId,key,row.item_key,1,'runtime_ad',row.claimed_at,membership,'TIER_D_ITEM_REFILL')
    })
  }
  offer(userId:string,offerId:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('tier_d_item_offers').select('item_key,claimed_at').eq('user_id',userId).eq('id',offerId).not('claimed_at','is',null).maybeSingle())
      if(row)this.reward(ctx,userId,`offer:${offerId}`,row.item_key,1,'offer',row.claimed_at,await this.member(userId),'TIER_D_ITEM_OFFER')
    })
  }
  private reward(ctx:TelemetryContext,userId:string,key:string,item:string,quantity:number,source:string,at:string,membership?:MembershipSnapshot,placement?:string) {
    this.send(ctx,userId,key,'item_reward',{receipt_id:this.id(userId,key),item_type:item,quantity,reward_source:source,tier:'tier_d'},at,membership)
    if(placement)this.send(ctx,userId,key,'ad_reward',{claim_id:this.id(userId,key),placement,reward_type:item,quantity},at,membership)
  }
  daily(userId:string,claimDay:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('daily_streak_reward_claims').select('item_rewards,token_amount,social_item,ad_verified,membership_at_claim,created_at').eq('user_id',userId).eq('claim_day',claimDay).maybeSingle())
      if(!row)return
      const membership=membershipSnapshot(row.membership_at_claim),key=`daily:${claimDay}`
      const totals=new Map<string,number>()
      for(const [slot,item] of (row.item_rewards??[]).entries()) {
        this.reward(ctx,userId,`${key}:${slot}`,item.itemKey,item.quantity,'daily_streak',row.created_at,membership)
        totals.set(item.itemKey,(totals.get(item.itemKey)??0)+item.quantity)
      }
      if(row.social_item)this.reward(ctx,userId,`${key}:social`,row.social_item,1,'daily_streak',row.created_at,membership)
      if(row.ad_verified) {
        if(row.token_amount>0)totals.set('token',row.token_amount)
        for(const [item,quantity]of totals)this.send(ctx,userId,`${key}:${item}`,'ad_reward',
          {claim_id:this.id(userId,key),placement:'DAILY_STREAK',reward_type:item,quantity},row.created_at,membership)
      }
    })
  }
  legacyReward(userId:string,eventId:string,item:string,ad:boolean):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('tier_d_item_reward_grants').select('quantity,granted_at').eq('user_id',userId).eq('event_id',eventId).eq('item_key',item).maybeSingle())
      if(row)this.reward(ctx,userId,`legacy:${eventId}:${item}`,item,row.quantity,'legacy_reward',row.granted_at,await this.member(userId),ad?'TIER_D_LEGACY_REWARD':undefined)
    })
  }
  league(userId:string,leagueId:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const rows=await this.read(this.db.from('tier_d_league_awards').select('award_type,awarded_at').eq('user_id',userId).eq('league_id',leagueId))
      const membership=await this.member(userId)
      for(const row of rows??[])this.reward(ctx,userId,`league:${leagueId}:${row.award_type}`,row.award_type,1,'league',row.awarded_at,membership)
    })
  }
  tournament(userId:string,tournamentId:string):void {
    const ctx=this.capture(userId);if(!ctx)return
    this.observe(async()=>{
      const row=await this.read(this.db.from('tier_d_mini_tournament_rewards').select('item_key,awarded_at').eq('user_id',userId).eq('tournament_id',tournamentId).maybeSingle())
      if(row)this.reward(ctx,userId,`tournament:${tournamentId}`,row.item_key,1,'tournament',row.awarded_at,await this.member(userId))
    })
  }
}
export const authorityTelemetry=new AuthorityTelemetry()

