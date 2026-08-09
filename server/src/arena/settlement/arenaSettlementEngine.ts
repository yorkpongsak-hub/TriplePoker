import { ArenaPile } from '../contracts/arenaContracts'

export type SettlementReason = 'ENTRY_FEE' | 'BOSS_FEE' | 'ANTE' | 'AUCTION' | 'CALL' | 'POT_PAYOUT' | 'BATTLE_REWARD' | 'CROWN_SINK'

export interface PlayerResultBreakdown {
  playerId: string
  persisted: boolean
  startingCrest: number
  entryFee: number
  ante: number
  jokerExtraAnte: number
  auction: number
  call: number
  bossFee: number
  battleRewards: number
  sweepJackpot: number
  winLoss: number
  netCrest: number
  endingCrest: number
}

export type SettlementCommand =
  | { type: 'BOSS_FEE'; commandId: string; playerIds: string[]; feeCrest: number }
  | { type: 'ANTE'; commandId: string; game: 1 | 2 | 3; pile: ArenaPile; playerIds: string[]; baseCrest: number; extraCrest: number }
  | { type: 'JOKER_ANTE_BONUS'; commandId: string; game: 1 | 2 | 3; pile: ArenaPile; winnerId: string; payerIds: string[]; amountCrest: number }
  | { type: 'AUCTION'; commandId: string; game: 1 | 2 | 3; winnerId: string; amountCrest: number }
  | { type: 'CALL'; commandId: string; game: 1 | 2 | 3; pile: 2 | 3; playerId: string; amountCrest: number }
  | { type: 'PILE_PAYOUT'; commandId: string; game: 1 | 2 | 3; pile: ArenaPile; winnerId: string }
  | { type: 'PILE_FORFEIT'; commandId: string; game: 1 | 2 | 3; pile: ArenaPile }
  | { type: 'SWEEP_JACKPOT'; commandId: string; game: 1 | 2 | 3; winnerId: string }
  | { type: 'END_MATCH'; commandId: string; playerIds: string[]; feeCrest: number }

export interface SettlementEntry { userId: string; deltaCrest: number; persisted: boolean }
export interface SettlementTransaction {
  commandId: string
  reason: SettlementReason
  entries: SettlementEntry[]
  potDeltaCrest: Partial<Record<ArenaPile, number>>
  battleRewardsDeltaCrest: number
  crownSinkDeltaCrest: number
}

interface MutableBreakdown extends PlayerResultBreakdown {}
export interface SettlementAccount { balanceCrest: number; persisted: boolean }

function safeAmount(value: number, field: string, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) throw new Error(`${field}_MUST_BE_POSITIVE_SAFE_INTEGER`)
}

export class ArenaSettlementEngine {
  private wallets = new Map<string, number>()
  private breakdowns = new Map<string, MutableBreakdown>()
  private pots: Record<ArenaPile, number> = { 1: 0, 2: 0, 3: 0 }
  private battleRewardsCrest = 0
  private crownSinkCrest = 0
  private processed = new Map<string, { fingerprint: string; transaction: SettlementTransaction }>()
  private pileWinners = new Map<string, string>()
  private ended = false
  private readonly initialConservationTotal: number

  constructor(startingBalances: Readonly<Record<string, number | SettlementAccount>>) {
    const entries = Object.entries(startingBalances)
    if (entries.length < 2 || entries.length > 4) throw new Error('ARENA_SETTLEMENT_REQUIRES_2_TO_4_PLAYERS')
    for (const [playerId, value] of entries) {
      const account = typeof value === 'number' ? { balanceCrest: value, persisted: true } : value
      const balance = account.balanceCrest
      if (!playerId) throw new Error('PLAYER_ID_REQUIRED')
      safeAmount(balance, 'STARTING_BALANCE', true)
      this.wallets.set(playerId, balance)
      this.breakdowns.set(playerId, {
        playerId, persisted: account.persisted, startingCrest: balance, entryFee: 0, ante: 0, jokerExtraAnte: 0, auction: 0,
        call: 0, bossFee: 0, battleRewards: 0, sweepJackpot: 0, winLoss: 0,
        netCrest: 0, endingCrest: balance,
      })
    }
    this.initialConservationTotal = entries.reduce((sum, [, value]) => sum + (typeof value === 'number' ? value : value.balanceCrest), 0)
  }

  execute(command: SettlementCommand): { duplicate: boolean; transaction: SettlementTransaction } {
    const fingerprint = JSON.stringify(command)
    const previous = this.processed.get(command.commandId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('SETTLEMENT_COMMAND_ID_CONFLICT')
      return { duplicate: true, transaction: previous.transaction }
    }
    if (this.ended) throw new Error('ARENA_MATCH_ALREADY_SETTLED')
    const transaction = this.apply(command)
    this.assertConservation()
    this.processed.set(command.commandId, { fingerprint, transaction })
    return { duplicate: false, transaction }
  }

  resultBreakdown(): PlayerResultBreakdown[] {
    return [...this.breakdowns.values()].map(item => {
      const endingCrest = this.balance(item.playerId)
      return { ...item, endingCrest, netCrest: endingCrest - item.startingCrest }
    })
  }

  totals(): { pots: Record<ArenaPile, number>; battleRewardsCrest: number; crownSinkCrest: number; walletCrest: number; conservedTotalCrest: number } {
    const walletCrest = [...this.wallets.values()].reduce((sum, value) => sum + value, 0)
    return {
      pots: { ...this.pots }, battleRewardsCrest: this.battleRewardsCrest, crownSinkCrest: this.crownSinkCrest,
      walletCrest, conservedTotalCrest: walletCrest + this.pots[1] + this.pots[2] + this.pots[3] + this.battleRewardsCrest + this.crownSinkCrest,
    }
  }

  private apply(command: SettlementCommand): SettlementTransaction {
    switch (command.type) {
      case 'BOSS_FEE': {
        safeAmount(command.feeCrest, 'BOSS_FEE')
        this.uniqueKnown(command.playerIds)
        this.ensureFunds(command.playerIds, command.feeCrest)
        const entries = command.playerIds.map(playerId => this.debit(playerId, command.feeCrest, 'bossFee'))
        this.crownSinkCrest += command.feeCrest * command.playerIds.length
        return this.transaction(command.commandId, 'BOSS_FEE', entries, {}, 0, command.feeCrest * command.playerIds.length)
      }
      case 'ANTE': {
        // Joker ANTE_X2 is an extra-only matched ante command: base is already
        // charged, so baseCrest may be zero while extraCrest must make total > 0.
        safeAmount(command.baseCrest, 'BASE_ANTE', true)
        safeAmount(command.extraCrest, 'EXTRA_ANTE', true)
        this.uniqueKnown(command.playerIds)
        const total = command.baseCrest + command.extraCrest
        safeAmount(total, 'TOTAL_ANTE')
        this.ensureFunds(command.playerIds, total)
        const entries = command.playerIds.map(playerId => {
          const current = this.balance(playerId)
          this.wallets.set(playerId, current - total)
          this.breakdown(playerId).ante += command.baseCrest
          this.breakdown(playerId).jokerExtraAnte += command.extraCrest
          return this.entry(playerId, -total)
        })
        this.pots[command.pile] += total * command.playerIds.length
        return this.transaction(command.commandId, 'ANTE', entries, { [command.pile]: total * command.playerIds.length }, 0, 0)
      }
      case 'JOKER_ANTE_BONUS': {
        safeAmount(command.amountCrest, 'JOKER_ANTE_BONUS')
        this.known(command.winnerId)
        this.uniqueKnown(command.payerIds)
        if (command.payerIds.includes(command.winnerId)) throw new Error('JOKER_BONUS_WINNER_CANNOT_PAY')
        this.ensureFunds(command.payerIds, command.amountCrest)
        const entries = command.payerIds.map(playerId => this.debit(playerId, command.amountCrest, 'jokerExtraAnte'))
        const reward = command.amountCrest * command.payerIds.length
        entries.push(this.credit(command.winnerId, reward, 'winLoss'))
        return this.transaction(command.commandId, 'ANTE', entries, {}, 0, 0)
      }
      case 'AUCTION': {
        safeAmount(command.amountCrest, 'AUCTION_AMOUNT')
        const entry = this.debit(command.winnerId, command.amountCrest, 'auction')
        this.battleRewardsCrest += command.amountCrest
        return this.transaction(command.commandId, 'AUCTION', [entry], {}, command.amountCrest, 0)
      }
      case 'CALL': {
        safeAmount(command.amountCrest, 'CALL_AMOUNT')
        const entry = this.debit(command.playerId, command.amountCrest, 'call')
        this.pots[command.pile] += command.amountCrest
        return this.transaction(command.commandId, 'CALL', [entry], { [command.pile]: command.amountCrest }, 0, 0)
      }
      case 'PILE_PAYOUT': {
        this.known(command.winnerId)
        const key = `${command.game}:${command.pile}`
        if (this.pileWinners.has(key)) throw new Error('PILE_ALREADY_PAID')
        const amount = this.pots[command.pile]
        if (amount <= 0) throw new Error('PILE_POT_EMPTY')
        const entry = this.credit(command.winnerId, amount, 'winLoss')
        this.pots[command.pile] = 0
        this.pileWinners.set(key, command.winnerId)
        return this.transaction(command.commandId, 'POT_PAYOUT', [entry], { [command.pile]: -amount }, 0, 0)
      }
      case 'PILE_FORFEIT': {
        const key = `${command.game}:${command.pile}`
        if (this.pileWinners.has(key)) throw new Error('PILE_ALREADY_PAID')
        const amount = this.pots[command.pile]
        if (amount <= 0) throw new Error('PILE_POT_EMPTY')
        this.pots[command.pile] = 0
        this.crownSinkCrest += amount
        return this.transaction(command.commandId, 'CROWN_SINK', [], { [command.pile]: -amount }, 0, amount)
      }
      case 'SWEEP_JACKPOT': {
        this.known(command.winnerId)
        const winners = ([1, 2, 3] as ArenaPile[]).map(pile => this.pileWinners.get(`${command.game}:${pile}`))
        if (!winners.every(winner => winner === command.winnerId)) throw new Error('SWEEP_REQUIRES_ALL_THREE_PILES')
        const amount = this.battleRewardsCrest
        if (amount <= 0) throw new Error('BATTLE_REWARDS_EMPTY')
        const entry = this.credit(command.winnerId, amount, 'sweepJackpot')
        this.breakdown(command.winnerId).battleRewards += amount
        this.battleRewardsCrest = 0
        return this.transaction(command.commandId, 'BATTLE_REWARD', [entry], {}, -amount, 0)
      }
      case 'END_MATCH': {
        if (Object.values(this.pots).some(value => value !== 0)) throw new Error('POTS_MUST_BE_SETTLED_BEFORE_MATCH_END')
        safeAmount(command.feeCrest, 'ENTRY_FEE')
        this.uniqueKnown(command.playerIds)
        this.ensureFunds(command.playerIds, command.feeCrest)
        const entries = command.playerIds.map(playerId => this.debit(playerId, command.feeCrest, 'entryFee'))
        const entryFeeSink = command.feeCrest * command.playerIds.length
        const sink = this.battleRewardsCrest
        this.battleRewardsCrest = 0
        this.crownSinkCrest += sink + entryFeeSink
        this.ended = true
        return this.transaction(command.commandId, 'ENTRY_FEE', entries, {}, -sink, sink + entryFeeSink)
      }
    }
  }

  private debit(playerId: string, amount: number, field: 'entryFee' | 'ante' | 'jokerExtraAnte' | 'auction' | 'call' | 'bossFee'): SettlementEntry {
    const current = this.balance(playerId)
    if (current < amount) throw new Error('INSUFFICIENT_CREST')
    this.wallets.set(playerId, current - amount)
    this.breakdown(playerId)[field] += amount
    return this.entry(playerId, -amount)
  }

  private credit(playerId: string, amount: number, field: 'winLoss' | 'sweepJackpot'): SettlementEntry {
    const current = this.balance(playerId)
    this.wallets.set(playerId, current + amount)
    this.breakdown(playerId)[field] += amount
    return this.entry(playerId, amount)
  }

  private balance(playerId: string): number { this.known(playerId); return this.wallets.get(playerId)! }
  private breakdown(playerId: string): MutableBreakdown { this.known(playerId); return this.breakdowns.get(playerId)! }
  private known(playerId: string): void { if (!this.wallets.has(playerId)) throw new Error('SETTLEMENT_PLAYER_NOT_FOUND') }
  private uniqueKnown(ids: string[]): void {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('SETTLEMENT_PLAYERS_MUST_BE_UNIQUE')
    ids.forEach(id => this.known(id))
  }
  private ensureFunds(ids: string[], amount: number): void {
    if (ids.some(id => this.balance(id) < amount)) throw new Error('INSUFFICIENT_CREST')
  }
  private entry(playerId: string, deltaCrest: number): SettlementEntry {
    return { userId: playerId, deltaCrest, persisted: this.breakdown(playerId).persisted }
  }

  private transaction(commandId: string, reason: SettlementReason, entries: SettlementEntry[], potDeltaCrest: Partial<Record<ArenaPile, number>>, battleRewardsDeltaCrest: number, crownSinkDeltaCrest: number): SettlementTransaction {
    return { commandId, reason, entries, potDeltaCrest, battleRewardsDeltaCrest, crownSinkDeltaCrest }
  }

  private assertConservation(): void {
    if (this.totals().conservedTotalCrest !== this.initialConservationTotal) throw new Error('ARENA_CREST_CONSERVATION_VIOLATION')
  }
}
