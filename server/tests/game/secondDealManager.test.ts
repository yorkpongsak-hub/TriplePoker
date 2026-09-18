import { canOfferSecondDeal, settleSecondDeal, startSecondDeal } from '../../src/game/secondDealManager'
test('Second Deal preserves a streak only for one winning recovery match',()=>{
 const active=startSecondDeal(4); expect(settleSecondDeal(active,true)).toEqual({matchWinStreak:4,recoveryActive:false,canChain:false})
 expect(settleSecondDeal(startSecondDeal(4),false).matchWinStreak).toBe(0)
 expect(canOfferSecondDeal(0,true,true)).toBe(false)
})
