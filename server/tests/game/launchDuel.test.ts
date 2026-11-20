import { arrange, clonePiles, createMatch, evaluate, lockHand, scoreHand, seeded, strength, totals, validation, DECK, Hand, Piles } from '../../../client/src/launch/engine';
import { advancedUnlocked, EMPTY_PROGRESS, recordMatch } from '../../../client/src/launch/progress';

describe('Launch: Three Piles',()=>{
  test('poker ordering includes wheel, kickers and full house comparison',()=>{
    expect(evaluate(['as','2s','3s','4s','5s'])).toBeLessThan(evaluate(['2h','3h','4h','5h','6h']));
    expect(evaluate(['as','2h','3d','4c','5s'])).toBeLessThan(evaluate(['2s','3h','4d','5c','6s']));
    expect(evaluate(['as','ah','ks','qd','jc'])).toBeGreaterThan(evaluate(['ad','ac','qs','jd','10c']));
    expect(evaluate(['ks','kh','kd','2s','2h'])).toBeGreaterThan(evaluate(['qs','qh','qd','as','ah']));
    expect(()=>evaluate(['as','as','2h','3d','4c'])).toThrow();
  });
  test('Pile 3 must use both shared cards, not any five from seven',()=>{
    const score=strength(['as','ks','qs','js','10s'],['2h','3d']);
    expect(score).toBeLessThan(evaluate(['2s','2c','5h','6d','8s']));
  });
  test('seeded dealing is reproducible, distinct and both players have legal plans',()=>{
    for(let seed=1;seed<=12;seed++){
      const match=createMatch(seed);
      for(const h of match.hands){
        expect(new Set([...h.cards,...h.rival.flat(),...h.community.flat()]).size).toBe(28);
        expect(validation(h.starter,h.cards,h.community)).toBeNull();
        expect(validation(h.rival,h.rival.flat(),h.community)).toBeNull();
      }
      expect(match.hands.filter(h=>h.rivalSeal!==null)).toHaveLength(1);
    }
    expect(createMatch(777)).toEqual(createMatch(777));
  });
  test('ties share points and consume the seal without bonus',()=>{
    const piles:Piles=[['2s','4h','6d'],['8s','8h','3d'],['ks','kh','qc','qd','9s']];
    const hand:Hand={cards:piles.flat(),starter:piles,community:[['7c','js'],['10c','5d'],['ac','2c']],rival:[['2h','4d','6s'],['8d','8c','3s'],['kd','kc','qh','qs','9d']],rivalSeal:2};
    const result=scoreHand(hand,piles,0);
    expect(result.points).toEqual([[0.5,0.5],[0.5,0.5],[0.5,0.5]]);
    expect(result.sealWon).toBe(false);
    expect(result.scores).toEqual([1.5,1.5]);
  });
  test('seal adds exactly one point on an outright win; invalid/reused moves rejected',()=>{
    let match=createMatch(2026);
    const h=match.hands[0];
    const base=scoreHand(h,h.starter,null);
    for(let i=0;i<3;i++){
      const withSeal=scoreHand(h,h.starter,i);
      expect(withSeal.scores[0]-base.scores[0]).toBe(base.points[i][0]===1?1:0);
    }
    const bad=clonePiles(h.starter);bad[0][0]=bad[1][0];
    expect(()=>lockHand(match,bad,null)).toThrow();
    expect(()=>lockHand(match,h.starter,3)).toThrow();
    match=lockHand(match,h.starter,0);
    expect(()=>lockHand(match,match.hands[1].starter,1)).toThrow('Seal already spent');
    match=lockHand(match,match.hands[1].starter,null);
    match=lockHand(match,match.hands[2].starter,null);
    expect(()=>lockHand(match,h.starter,null)).toThrow('Match already complete');
    const score=totals(match.results);
    expect(score[0]+score[1]).toBeGreaterThanOrEqual(9);
    expect(score[0]+score[1]).toBeLessThanOrEqual(11);
  });
  test('all suggested plans preserve ownership and ordering',()=>{
    const h=createMatch(92).hands[0];
    for(const strategy of ['front','balanced','finish'] as const){
      const p=arrange(h.cards,h.community,strategy);
      expect(p).not.toBeNull();
      expect(validation(p!,h.cards,h.community)).toBeNull();
    }
  });
  test('progress only counts completed matches once; unlock requires practice AND lessons',()=>{
    let match=createMatch(58);
    expect(recordMatch(EMPTY_PROGRESS,match)).toBe(EMPTY_PROGRESS);
    for(let i=0;i<3;i++)match=lockHand(match,match.hands[i].starter,i===0?0:null);
    const p=recordMatch(EMPTY_PROGRESS,match);
    expect(p.matches).toBe(1);
    expect(recordMatch(p,match)).toBe(p);
    expect(advancedUnlocked({...p,matches:5,sealWins:2})).toBe(false);
    expect(advancedUnlocked({...p,matches:5,sealWins:2,lessonsPassed:true})).toBe(true);
    expect(advancedUnlocked({...p,matches:4,sealWins:2,lessonsPassed:true})).toBe(false);
  });
  test('evaluation is suit independent for equivalent non-flush hands',()=>{
    const random=seeded(200);
    for(let i=0;i<100;i++){
      const cards=[...DECK].sort(()=>random()-0.5).slice(0,5);
      const rotated=cards.map(c=>c.slice(0,-1)+'hdcs'['shdc'.indexOf(c.slice(-1))]);
      expect(evaluate(cards)).toBe(evaluate(rotated));
    }
  });
});
