// กติกา Launch แยกจากเศรษฐกิจเดิมทั้งหมด ใช้ทดสอบซ้ำด้วย seed ได้
export type Piles = [string[], string[], string[]];
export type Strategy = 'balanced' | 'front' | 'finish';
export type Hand = { cards: string[]; community: Piles; rival: Piles; starter: Piles; rivalSeal: number | null };
export type Match = { version: 1; id: string; seed: number; hands: Hand[]; results: Result[] };
export type Result = { piles: Piles; seal: number | null; points: [number, number][]; scores: [number, number]; sealWon: boolean };
export const RANKS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const values = ['2','3','4','5','6','7','8','9','10','j','q','k','a'];
export const DECK = ['s','h','d','c'].flatMap(s => values.map(v => v + s));
const BASE = 15 ** 5;
export function evaluate(cards: string[]): number {
  if (cards.length !== 5 || new Set(cards).size !== 5 || cards.some(c => !DECK.includes(c))) throw new Error('Invalid five-card hand');
  const vs = cards.map(c => values.indexOf(c.slice(0,-1)) + 2).sort((a,b) => b-a);
  const counts = new Map<number,number>();
  vs.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));
  const groups = [...counts].sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const flush = cards.every(c => c.slice(-1) === cards[0].slice(-1));
  const straight = counts.size === 5 ? (vs[0]-vs[4] === 4 ? vs[0] : vs.join(',') === '14,5,4,3,2' ? 5 : 0) : 0;
  const cat = flush && straight ? 8 : groups[0][1] === 4 ? 7 : groups[0][1] === 3 && groups[1][1] === 2 ? 6 : flush ? 5 : straight ? 4 : groups[0][1] === 3 ? 3 : groups[0][1] === 2 && groups[1][1] === 2 ? 2 : groups[0][1] === 2 ? 1 : 0;
  const kickers = straight ? [straight] : groups.flatMap(([v,n]) => Array(n).fill(v));
  return cat * BASE + kickers.reduce((sum,v,i) => sum + v * 15 ** (4-i), 0);
}
export function strength(cards: string[], community: string[]): number {
  let best = -1;
  for (let i=0;i<cards.length-2;i++) for (let j=i+1;j<cards.length-1;j++) for (let k=j+1;k<cards.length;k++) best = Math.max(best, evaluate([cards[i],cards[j],cards[k],...community]));
  return best;
}
export const rankName = (score: number) => RANKS[Math.floor(score / BASE)];
export function validation(piles: Piles, cards: string[], community: Piles): string | null {
  if (piles[0].length !== 3 || piles[1].length !== 3 || piles[2].length !== 5) return 'Use 3 cards, 3 cards and 5 cards.';
  const flat = piles.flat();
  if (new Set(flat).size !== 11 || flat.some(c => !cards.includes(c))) return 'Use each of your 11 cards exactly once.';
  const scores = piles.map((p,i) => strength(p,community[i]));
  if (scores[0] > scores[1]) return 'Pile 2 must be at least as strong as Pile 1.';
  if (scores[1] > scores[2]) return 'Pile 3 must be at least as strong as Pile 2.';
  return null;
}
export function arrange(cards: string[], community: Piles, strategy: Strategy = 'balanced'): Piles | null {
  const triples: {mask:number; cards:string[]; scores:number[]}[] = [];
  for(let i=0;i<9;i++) for(let j=i+1;j<10;j++) for(let k=j+1;k<11;k++) {
    const chosen = [cards[i],cards[j],cards[k]];
    triples.push({mask:(1<<i)|(1<<j)|(1<<k),cards:chosen,scores:community.map(c => evaluate([...chosen,...c]))});
  }
  const weights = strategy === 'front' ? [2.2,1.5,0.7] : strategy === 'finish' ? [0.8,1.2,2.2] : [1,1,1];
  const thirdScores = new Map<number,number>();
  let best: Piles | null = null, bestValue = -Infinity;
  for(const first of triples) for(const second of triples) {
    if(first.mask & second.mask || first.scores[0] > second.scores[1]) continue;
    const mask = 2047 ^ (first.mask | second.mask);
    let third = thirdScores.get(mask);
    if(third === undefined) {
      third = Math.max(...triples.filter(t => (t.mask & mask) === t.mask).map(t => t.scores[2]));
      thirdScores.set(mask,third);
    }
    if(second.scores[1] > third) continue;
    const scores = [first.scores[0],second.scores[1],third];
    const utility = scores.reduce((sum,s,i) => sum + Math.sqrt(1+s/BASE)*weights[i],0);
    if(utility > bestValue) { bestValue = utility; best = [first.cards,second.cards,cards.filter((_,i) => mask & (1<<i))]; }
  }
  return best;
}
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15,t | 1); t ^= t + Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createMatch(seed: number): Match {
  const random = seeded(seed), hands: Hand[] = [];
  // คู่แข่งเลือกมือที่จะใช้ตราก่อนแจก และไม่ดูไพ่ของผู้เล่น
  const sealHand = Math.floor(random()*3);
  for(let h=0;h<3;h++) {
    let hand: Hand | null = null;
    for(let attempt=0;attempt<60 && !hand;attempt++) {
      const deck = [...DECK];
      for(let i=51;i>0;i--) { const j = Math.floor(random()*(i+1)); [deck[i],deck[j]] = [deck[j],deck[i]]; }
      const community: Piles = [deck.slice(22,24),deck.slice(24,26),deck.slice(26,28)];
      const cards = deck.slice(0,11), rivalCards = deck.slice(11,22);
      const starter = arrange(cards,community), rival = arrange(rivalCards,community,h === 1 ? 'front' : 'balanced');
      if(starter && rival) hand = {cards,community,starter,rival,rivalSeal:h === sealHand ? Math.floor(random()*3) : null};
    }
    if(!hand) throw new Error('Unable to deal a valid hand. Please try again.');
    hands.push(hand);
  }
  return {version:1,id:`duel-${seed}`,seed,hands,results:[]};
}
export function scoreHand(hand: Hand, piles: Piles, seal: number | null): Result {
  const error = validation(piles,hand.cards,hand.community);
  if(error) throw new Error(error);
  if(seal !== null && ![0,1,2].includes(seal)) throw new Error('Invalid seal');
  const points: [number,number][] = piles.map((p,i) => {
    const a = strength(p,hand.community[i]), b = strength(hand.rival[i],hand.community[i]);
    return a === b ? [0.5,0.5] : a > b ? [1 + Number(seal === i),0] : [0,1 + Number(hand.rivalSeal === i)];
  });
  return {piles:piles.map(p => [...p]) as Piles,seal,points,scores:points.reduce<[number,number]>((s,p) => [s[0]+p[0],s[1]+p[1]],[0,0]),sealWon:seal !== null && points[seal][0] === 2};
}
export function lockHand(match: Match, piles: Piles, seal: number | null): Match {
  if(match.results.length >= 3) throw new Error('Match already complete');
  if(seal !== null && match.results.some(r => r.seal !== null)) throw new Error('Seal already spent');
  return {...match,results:[...match.results,scoreHand(match.hands[match.results.length],piles,seal)]};
}
export const totals = (results: Result[]) => results.reduce<[number,number]>((a,r) => [a[0]+r.scores[0],a[1]+r.scores[1]],[0,0]);
export const clonePiles = (piles: Piles) => piles.map(p => [...p]) as Piles;
