import { consumeProfitableAiInterstitialTicket, issueProfitableAiInterstitialTicket, resetProfitableAiInterstitialTicketsForTest } from '../../src/game/profitableAiInterstitial'

beforeEach(resetProfitableAiInterstitialTicketsForTest)

test('issues only for positive authoritative settlements in approved AI-only tiers', () => {
  expect(issueProfitableAiInterstitialTicket({tier:'adept',gameId:'g1',userId:'u1',tokenDelta:10})).toBeUndefined()
  expect(issueProfitableAiInterstitialTicket({tier:'initiate',gameId:'g2',userId:'u1',tokenDelta:0})).toBeUndefined()
  expect(issueProfitableAiInterstitialTicket({tier:'mastermind',gameId:'g3',userId:'u1',tokenDelta:-1})).toBeUndefined()
  expect(issueProfitableAiInterstitialTicket({tier:'tier_d',gameId:'g4',userId:'u1',tokenDelta:1})).toBeDefined()
})

test('allows at most one single-use ticket per game and binds it to the player', () => {
  const ticket=issueProfitableAiInterstitialTicket({tier:'initiate',gameId:'g1',userId:'u1',tokenDelta:5,now:1_000})!
  expect(issueProfitableAiInterstitialTicket({tier:'initiate',gameId:'g1',userId:'u1',tokenDelta:9,now:1_001})).toBeUndefined()
  expect(consumeProfitableAiInterstitialTicket(ticket,'u2',1_002)).toBe(false)
  expect(consumeProfitableAiInterstitialTicket(ticket,'u1',1_003)).toBe(false)
})

test('expires unused tickets and consumes a valid ticket once', () => {
  const valid=issueProfitableAiInterstitialTicket({tier:'mastermind',gameId:'g1',userId:'u1',tokenDelta:3,now:1_000})!
  expect(consumeProfitableAiInterstitialTicket(valid,'u1',2_000)).toBe(true)
  expect(consumeProfitableAiInterstitialTicket(valid,'u1',2_001)).toBe(false)
  const expired=issueProfitableAiInterstitialTicket({tier:'mastermind',gameId:'g2',userId:'u1',tokenDelta:3,now:1_000})!
  expect(consumeProfitableAiInterstitialTicket(expired,'u1',601_001)).toBe(false)
})
