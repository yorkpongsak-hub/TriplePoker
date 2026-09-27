import { gameConfig } from '../../src/config/gameConfig'
import { chargeAuctionBid,chargeAutoSortFee,chargeGrandFinaleCall,checkConservation,collectAntes,computeTotal,settleRound } from '../../src/game/tokenFlow'

const players=['p1','p2','p3','p4'];const stacks=(buyIn:number)=>Object.fromEntries(players.map(id=>[id,buyIn]))

describe('Tier C+ canonical Token flow',()=>{
 test.each([
  ['initiate',600,[40,60,100]],['adept',1800,[120,180,300]],['mastermind',4500,[300,450,750]],['highNoble',15000,[1000,1500,2500]],['lastBoss',30000,[2000,3000,5000]],
 ] as const)('%s contributes the complete Buy-in over exactly three Matches',(tier,buyIn,piles)=>{const stake=gameConfig.tokenPot.tiers[tier];expect(gameConfig.buyIn[tier]).toBe(buyIn);expect([stake.pile1,stake.pile2,stake.pile3]).toEqual(piles);expect((stake.pile1+stake.pile2+stake.pile3)*3).toBe(buyIn)})

 test('score settlement distributes every pile Pot with no entry rake or jackpot',()=>{const buyIn=600,stake=gameConfig.tokenPot.tiers.initiate;const collected=collectAntes(stacks(buyIn),players,stake);const result=settleRound({stacks:collected.stacks,pot:collected.pot,feeRake:0,playerIds:players,winners:['p1','p1','p1'],stakes:stake,rake:.05,pileScoreWeights:[{p1:10,p2:0,p3:0,p4:0},{p1:15,p2:15,p3:0,p4:0},{p1:69,p2:31,p3:0,p4:0}]});expect(result.feeRake).toBe(0);expect(result.jackpotBonus).toBe(0);expect(result.jackpotRake).toBe(0);expect(result.pot).toEqual([0,0,0]);expect(Object.values(result.stacks).reduce((a,b)=>a+b,0)).toBe(buyIn*players.length);expect(checkConservation(result.stacks,players,result.pot,result.feeRake,buyIn,'canonical')).toBe(true)})

 test('zero-score piles use deterministic fallback and do not burn the Pot',()=>{const buyIn=600,stake=gameConfig.tokenPot.tiers.initiate;const collected=collectAntes(stacks(buyIn),players,stake);const zero=Object.fromEntries(players.map(id=>[id,0]));const result=settleRound({stacks:collected.stacks,pot:collected.pot,feeRake:0,playerIds:players,winners:['','',''],stakes:stake,rake:.05,pileScoreWeights:[zero,zero,zero]});expect(result.feeRake).toBe(0);expect(result.displayDeltas).toEqual({p1:0,p2:0,p3:0,p4:0});expect(computeTotal(result.stacks,players,result.pot,result.feeRake)).toBe(buyIn*players.length)})
})

describe('unrelated optional costs remain conservation-safe',()=>{
 test('Auto Sort, Auction and Call only move existing Tokens',()=>{const initial=stacks(4500);const auto=chargeAutoSortFee(initial,0,'p1',100);const auction=chargeAuctionBid(auto.stacks,auto.feeRake,'p1',150);const call=chargeGrandFinaleCall(auction.stacks,[0,0,0],'p1',300);expect(computeTotal(call.stacks,players,call.pot,auction.feeRake)).toBe(4500*4)})
 test('insufficient optional actions fail without mutation',()=>{expect(chargeAuctionBid({p1:10},0,'p1',11)).toMatchObject({ok:false,charged:0,stacks:{p1:10}});expect(chargeGrandFinaleCall({p1:10},[0,0,0],'p1',11)).toMatchObject({ok:false,charged:0,stacks:{p1:10},pot:[0,0,0]})})
})
