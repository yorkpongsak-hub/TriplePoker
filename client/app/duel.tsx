import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, View } from 'react-native';
import { Text, Touch as TouchableOpacity } from '../src/launch/i18n/components';
import LanguagePicker from '../src/launch/i18n/LanguagePicker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arrange, clonePiles, createMatch, Piles, rankName, scoreHand, Strategy, strength, totals, validation } from '../src/launch/engine';
import { useLaunchStore, sessionView, tableAvailable } from '../src/launch/store';
import TableDuel from '../src/launch/TableDuel';
import { Button, C, PlayingCard, SoundToggle, s } from '../src/launch/ui';

export default function Duel() {
  const {fresh}=useLocalSearchParams<{fresh?:string}>();
  const {active,hydrated,start,draft,seal,lock,advance,storageError,progress,setView,tableGuideSeen,dismissTableGuide}=useLaunchStore();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<[number,number]|null>(null);
  const [help,setHelp]=useState(false),[review,setReview]=useState<number|null>(null),[reviewPiles,setReviewPiles]=useState<Piles|null>(null);
  const [reviewScore,setReviewScore]=useState<string|null>(null);
  const creating=useRef(false),mounted=useRef(true);
  const tierDTransitioned=useRef(false);
  const scroll=useRef<ScrollView>(null);
  const pilePositions=useRef<number[]>([]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(active?.phase==='arrange'||active?.phase==='result')scroll.current?.scrollTo({y:0,animated:false});
    if(active?.phase==='reveal'&&active.revealed>0)scroll.current?.scrollTo({y:Math.max(0,(pilePositions.current[active.revealed-1]??0)-130),animated:true});
  },[active?.phase,active?.match.results.length,active?.revealed]);
  const newMatch=()=> {
    if(creating.current)return;creating.current=true;setBusy(true);setError('');
    setTimeout(()=>{
      try {const match=createMatch((Date.now() ^ Math.floor(Math.random()*0xFFFFFFFF))>>>0);if(mounted.current){start(match);setReview(null);setSelected(null);if(fresh)router.setParams({fresh:undefined});}}
      catch(e){if(mounted.current)setError((e as Error).message);}
      finally {creating.current=false;if(mounted.current)setBusy(false);}
    },60);
  };
  useEffect(()=>{if(hydrated&&(!active||(fresh==='yes'&&active.phase==='result')))newMatch();},[hydrated,fresh]);
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{router.replace('/launch');return true;});return()=>sub.remove();},[]);
  useEffect(()=>{
    if(!hydrated||active?.phase!=='result'||progress.matches!==2||tierDTransitioned.current)return;
    tierDTransitioned.current=true;
    router.replace('/game/tier-d/entry');
  },[hydrated,active?.phase,progress.matches]);
  const index=active ? active.phase==='arrange'?active.match.results.length:active.match.results.length-1:0;
  const hand=active?.match.hands[review??index];
  const shown=reviewPiles&&review!==null?reviewPiles:active?.draft;
  const invalid=useMemo(()=>hand&&shown?validation(shown,hand.cards,hand.community):null,[hand,shown]);
  if(!hydrated||busy||!active||!hand||!shown)return <SafeAreaView style={s.page}><View style={[s.content,{paddingTop:80}]}><Text style={s.subtitle}>Setting the table...</Text>{error?<><Text style={{color:C.red}}>{error}</Text><Button title="Try again" onPress={newMatch}/></>:<ActivityIndicator color={C.gold}/>}<Button title="Back home" secondary onPress={()=>router.replace('/launch')}/></View></SafeAreaView>;
  const isReview=review!==null,editing=active.phase==='arrange'||isReview,spent=active.match.results.some(r=>r.seal!==null);
  const currentResult=active.match.results[index];
  const visibleScore=active.phase==='reveal' ? totals(active.match.results.slice(0,-1)) : totals(active.match.results);
  if(active.phase==='reveal')currentResult.points.slice(0,active.revealed).forEach(p=>{visibleScore[0]+=p[0];visibleScore[1]+=p[1];});
  const swap=(pile:number,card:number)=>{
    if(!selected){setSelected([pile,card]);return;}
    const next=clonePiles(shown),[p,c]=selected;[next[p][c],next[pile][card]]=[next[pile][card],next[p][c]];
    if(isReview){setReviewPiles(next);setReviewScore(null);}else draft(next);setSelected(null);
  };
  const suggest=(strategy:Strategy)=> {
    setBusy(true);
    setTimeout(()=>{try{const next=arrange(hand.cards,hand.community,strategy);if(next){if(isReview){setReviewPiles(next);setReviewScore(null);}else draft(next);setSelected(null);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}},40);
  };
  const finished=active.phase==='result';
  const remaining=9-(active.phase==='arrange'?active.match.results.length*3:active.phase==='result'?9:(active.match.results.length-1)*3+active.revealed);
  const gap=visibleScore[0]-visibleScore[1];
  const situation=finished ? gap>0?'You are the champion.':gap<0?'Robin takes this match.':'An even match.' : gap===0?'All square. Every pile matters.':gap>0?`You lead by ${gap}. ${remaining} piles left.`:`You trail by ${-gap}. ${remaining} piles left.`;
  if(!finished&&!isReview&&sessionView(active,progress.matches)==='table')return <TableDuel
    hand={hand} piles={shown} handNumber={index+1} score={visibleScore} situation={situation}
    editing={editing} revealed={active.phase==='reveal'?active.revealed:0} result={currentResult}
    seal={active.seal} spent={spent} selected={selected} invalid={invalid} guide={!tableGuideSeen}
    storageError={storageError} error={error} onGuide={dismissTableGuide}
    onPractice={()=>{setSelected(null);setView('practice');}} onExit={()=>router.replace('/launch')}
    onSwap={swap} onSeal={seal} onSuggest={suggest} onAdvance={advance}
    onLock={()=>{setSelected(null);try{lock();}catch(e){setError((e as Error).message);}}}
  />;
  return <SafeAreaView style={s.page}><ScrollView ref={scroll} stickyHeaderIndices={[1]} contentContainerStyle={[s.content,{padding:16,gap:12}]}>
    <View style={s.row}><TouchableOpacity accessibilityRole="button" onPress={()=>router.replace('/launch')}><Text style={s.link}>Save & exit</Text></TouchableOpacity><Text style={s.eyebrow}>{isReview?'PRACTICE REPLAY':finished?'MATCH COMPLETE':`HAND ${index+1} / 3`}</Text><TouchableOpacity accessibilityRole="button" onPress={()=>setHelp(!help)}><Text style={s.link}>Rules</Text></TouchableOpacity><LanguagePicker/></View>

    <View style={s.panel}><View style={s.row}><Text style={s.subtitle}>You  {visibleScore[0]}</Text><Text style={s.subtitle}>{visibleScore[1]}  Robin</Text></View><Text accessibilityLiveRegion="polite" style={[s.body,{color:C.gold}]}>{situation}</Text><Text style={[s.body,{fontSize:12}]}>Robin is your AI practice rival.</Text></View>
    {!finished&&!isReview&&tableAvailable(active,progress.matches)&&<Button title="Return to table view" secondary onPress={()=>{setSelected(null);setView('table');}}/>}
    {help&&<View style={s.panel}><SoundToggle/><Text style={s.subtitle}>Three piles, one plan</Text><Text style={s.body}>Tap two private cards to swap them. Each pile combines your cards with its own two shared cards. Pile 3 uses the best three of your five.</Text><Text style={s.body}>Keep Pile 1 &lt;= Pile 2 &lt;= Pile 3. Equal hands are legal. Win a pile: 1 point. Tie: 0.5 each. The seal adds 1 only on an outright win and is spent even on a loss or tie.</Text><Text style={s.body}>Poker ranks, low to high: high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush. A royal flush is the highest straight flush.</Text><Text style={s.body}>Both players have one seal per match. Robin locks its plan without seeing your hand. Tied final scores share the match.</Text></View>}
    {finished&&!isReview?<>
      <Text style={s.title}>{gap>0?'Well played.':gap<0?'Your next move?':'Honours shared.'}</Text>
      <Text style={s.body}>{active.match.results.some(r=>r.sealWon)?'Your seal converted a pile win into two points. Timing made a difference.':spent?'Your seal was spent without a bonus. Try choosing a different pile in a practice replay.':'You kept your seal to the end. Next time, look for a pile worth committing to.'}</Text>
      <Text style={s.eyebrow}>YOUR MATCH, HAND BY HAND</Text>
      {active.match.results.map((r,i)=><View style={s.panel} key={i}><View style={s.row}><Text style={s.subtitle}>Hand {i+1}</Text><Text style={{color:C.gold}}>{r.scores[0]} : {r.scores[1]}</Text></View><Text style={s.body}>{r.seal===null?'No seal played this hand':`Seal on Pile ${r.seal+1}: ${r.sealWon?'bonus won':'no bonus'}`}</Text><Button secondary title={`Try another plan for Hand ${i+1}`} onPress={()=>{setReview(i);setReviewPiles(clonePiles(r.piles));setReviewScore(null);setSelected(null);}}/></View>)}
      <Button title="Play a fresh match" onPress={newMatch}/><Button title="Back to your journey" secondary onPress={()=>router.replace('/launch')}/>
    </>:<>
      {editing&&<><Text style={s.subtitle}>{isReview?'What would you change?':'Build your plan.'}</Text><Text style={s.body}>{selected?'Now tap another private card to swap.':'Tap two private cards to swap, or try a suggested plan.'}</Text><View style={s.row}>{(['balanced','front','finish'] as Strategy[]).map((plan,i)=><TouchableOpacity accessibilityRole="button" key={plan} onPress={()=>suggest(plan)} style={{flex:1,borderWidth:1,borderColor:C.line,borderRadius:10,padding:12}}><Text style={{color:C.gold,textAlign:'center',fontSize:12}}>{['Balanced','Front focus','Finish focus'][i]}</Text></TouchableOpacity>)}</View><Text style={[s.body,{fontSize:12}]}>{isReview?'Practice only. Rival cards are now known; this does not change your result.':'Suggestions are starting points, not guaranteed wins. Robin may prefer different piles.'}</Text></>}
      {shown.map((pile,i)=>{
        const revealed=isReview||(active.phase==='reveal'&&active.revealed>i);
        const sealHere=isReview?active.match.results[review!].seal===i:active.seal===i;
        return <View key={i} onLayout={event=>{pilePositions.current[i]=event.nativeEvent.layout.y;}} style={[s.panel,sealHere&&{borderColor:C.gold}]}>
          <View style={s.row}><Text style={s.eyebrow}>PILE {i+1}{sealHere?' / YOUR SEAL':''}</Text><Text style={{color:C.text,fontSize:12}}>{rankName(strength(pile,hand.community[i]))}</Text></View>
          <View style={s.row}><View style={{flexDirection:'row',gap:4}}>{pile.map((c,j)=><PlayingCard key={c} card={c} selected={selected?.[0]===i&&selected?.[1]===j} onPress={editing?()=>swap(i,j):undefined}/>)}</View></View>
          <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Text style={[s.body,{fontSize:12,marginRight:6}]}>Shared</Text>{hand.community[i].map(c=><PlayingCard key={c} card={c}/>)}</View>
          {editing&&!isReview&&!spent&&<TouchableOpacity accessibilityRole="button" accessibilityState={{selected:sealHere}} onPress={()=>seal(sealHere?null:i)} style={{paddingVertical:8}}><Text style={{color:C.gold,fontWeight:'700'}}>{sealHere?'Remove seal':'Place seal here (+1 if you win)'}</Text></TouchableOpacity>}
          {revealed&&<View style={{gap:8,borderTopWidth:1,borderColor:C.line,paddingTop:10}}><Text style={s.body}>Robin: {rankName(strength(hand.rival[i],hand.community[i]))}{hand.rivalSeal===i?' / SEAL':''}</Text><View style={{flexDirection:'row',gap:4}}>{hand.rival[i].map(c=><PlayingCard key={c} card={c} small/>)}</View>{!isReview&&<Text accessibilityLiveRegion="polite" style={{color:currentResult.points[i][0]>0?C.mint:C.red,fontWeight:'800'}}>{currentResult.points[i][0]===0.5?'Tie. Half a point each.':currentResult.points[i][0]>0?`You win! +${currentResult.points[i][0]}`:`Robin wins. +${currentResult.points[i][1]}`}</Text>}</View>}
        </View>;
      })}
      {editing&&<Text accessibilityLiveRegion="polite" style={{color:invalid?C.red:C.mint,fontSize:13,lineHeight:20}}>{invalid??'Legal arrangement. Your plan is ready.'}</Text>}
      {active.phase==='arrange'&&!isReview&&<Text style={s.body}>{spent?'Your seal has been used this match.':active.seal===null?index===2?'Last hand: your unused seal will expire. Pick a pile if you want to use it.':'Seal available. Use it now or save it for another hand.':`You will spend your seal on Pile ${active.seal+1}.`}</Text>}
      {isReview&&<><Button title="Compare this plan" disabled={Boolean(invalid)} onPress={()=>{const r=scoreHand(hand,shown,active.match.results[review!].seal);setReviewScore(`With the same rival plan and seal: You ${r.scores[0]} : Robin ${r.scores[1]}. Original: ${active.match.results[review!].scores.join(' : ')}.`);}}/>{reviewScore&&<Text accessibilityLiveRegion="polite" style={[s.body,{color:C.gold}]}>{reviewScore}</Text>}<Button title="Back to match results" secondary onPress={()=>{setReview(null);setReviewPiles(null);setSelected(null);}}/></>}
    </>}
    {!!error&&<Text style={{color:C.red}}>{error}</Text>}
    {storageError&&<Text style={{color:C.red}}>Progress could not be saved. Check device storage before closing the app.</Text>}
  </ScrollView>{!isReview&&!finished&&<View style={{padding:12,borderTopWidth:1,borderColor:C.line,gap:6}}>
    {active.phase==='arrange'?<><Text style={{color:invalid?C.red:C.muted,fontSize:12,textAlign:'center'}}>{invalid??(active.seal===null?spent?'Seal already used':index===2?'Last hand: use your seal before locking':'Seal saved for later':`Seal committed to Pile ${active.seal+1}`)}</Text><Button title="Lock my plan" disabled={Boolean(invalid)} onPress={()=>{setSelected(null);try{lock();}catch(e){setError((e as Error).message);}}}/></>:<Button title={active.revealed<3?`Reveal Pile ${active.revealed+1}`:index===2?'See match results':'Deal next hand'} onPress={advance}/>}
  </View>}</SafeAreaView>;
}
