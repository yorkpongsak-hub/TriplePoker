import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageBackground, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, Touch as TouchableOpacity } from './i18n/components';
import LanguagePicker from './i18n/LanguagePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CARD_IMG, CARD_BACK_IMG } from '../components/game/cardAssets';
import { Hand, Piles, rankName, Result, Strategy, strength } from './engine';
import { Button, C, s, SoundToggle } from './ui';

const tableImage=require('../../assets/images/table_default.png');
type Props={hand:Hand;piles:Piles;handNumber:number;score:[number,number];situation:string;editing:boolean;revealed:number;result?:Result;seal:number|null;spent:boolean;selected:[number,number]|null;invalid:string|null;guide:boolean;storageError:boolean;error:string;onGuide:()=>void;onPractice:()=>void;onExit:()=>void;onSwap:(p:number,c:number)=>void;onSeal:(p:number|null)=>void;onSuggest:(s:Strategy)=>void;onLock:()=>void;onAdvance:()=>void};
function TableCard({card,hidden=false,small=false,selected=false,onPress}:{card?:string;hidden?:boolean;small?:boolean;selected?:boolean;onPress?:()=>void}) {
  // ไพ่คู่แข่งที่ยังไม่เปิดจะไม่ส่งรหัสหรือชื่อไพ่เข้าต้นไม้ accessibility
  const label=hidden?'Face-down rival card':card?`${card.slice(0,-1).toUpperCase()} of ${({s:'spades',h:'hearts',d:'diamonds',c:'clubs'} as Record<string,string>)[card.slice(-1)]}`:'Card';
  return <TouchableOpacity accessibilityRole={onPress?'button':'image'} accessibilityLabel={label} accessibilityState={{selected}} disabled={!onPress} onPress={onPress} style={[t.card,small&&t.smallCard,selected&&t.selected]}><Image accessible={false} source={hidden?CARD_BACK_IMG:CARD_IMG[card!]} style={t.face} resizeMode="contain"/></TouchableOpacity>;
}
export default function TableDuel(p:Props) {
  const [rules,setRules]=useState(false);
  const scroll=useRef<ScrollView>(null);
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false});},[p.editing,p.revealed,p.handNumber]);
  return <SafeAreaView style={s.page}>
    <View style={t.nav}><TouchableOpacity accessibilityRole="button" onPress={p.onExit}><Text style={s.link}>Save & exit</Text></TouchableOpacity><Text style={s.eyebrow}>HAND {p.handNumber} / 3</Text><TouchableOpacity accessibilityRole="button" onPress={()=>setRules(true)}><Text style={s.link}>Guide</Text></TouchableOpacity><LanguagePicker/></View>
    <View style={t.score}><View style={s.row}><Text style={s.subtitle}>You {p.score[0]}</Text><Text style={s.subtitle}>{p.score[1]} Robin</Text></View><Text accessibilityLiveRegion="polite" style={[s.body,{color:C.gold}]}>{p.situation}</Text></View>
    <ScrollView ref={scroll} contentContainerStyle={{flexGrow:1}}>
      <ImageBackground source={tableImage} resizeMode="stretch" style={t.table}>
        <View style={t.seat}><Text style={t.seatName}>ROBIN / AI RIVAL</Text><Text style={t.note}>Across the table. One seal per match.</Text></View>
        <View style={t.columns}>{p.hand.rival.map((cards,i)=>{
          const open=p.revealed>i;
          return <View key={i} style={t.column}><Text style={t.label}>PILE {i+1}{open&&p.hand.rivalSeal===i?' / SEAL':''}</Text><View style={t.miniCards}>{(open?cards:cards.map(()=>null)).map((c,j)=><TableCard key={j} card={open?c!:undefined} hidden={!open} small/>)}</View><Text style={t.note}>{open?rankName(strength(cards,p.hand.community[i])):'Hidden'}</Text></View>;
        })}</View>
        <View style={t.shared}><Text style={t.seatName}>SHARED CARDS</Text><View style={t.columns}>{p.hand.community.map((cards,i)=><View key={i} style={t.column}><Text style={t.label}>PILE {i+1}</Text><View style={t.miniCards}>{cards.map(c=><TableCard key={c} card={c}/>)}</View>{p.revealed>i&&<Text accessibilityLiveRegion="polite" style={t.outcome}>{p.result!.points[i][0]===0.5?'Tie +0.5 each':p.result!.points[i][0]>0?`You +${p.result!.points[i][0]}`:`Robin +${p.result!.points[i][1]}`}</Text>}</View>)}</View></View>
        <View style={t.seat}><Text style={t.seatName}>YOUR SIDE</Text><Text style={t.note}>{p.editing?(p.selected?'Tap a second card to swap.':'Tap two cards to swap across piles.'):'Your plan is locked.'}</Text></View>
        {p.piles.map((cards,i)=><View key={i} style={[t.pile,p.seal===i&&{borderColor:C.gold}]}>
          <View style={s.row}><Text style={t.label}>PILE {i+1} / {rankName(strength(cards,p.hand.community[i]))}</Text>{p.seal===i&&<Text style={t.outcome}>SEALED</Text>}</View>
          <View style={t.playerCards}>{cards.map((c,j)=><TableCard key={c} card={c} selected={p.selected?.[0]===i&&p.selected?.[1]===j} onPress={p.editing?()=>p.onSwap(i,j):undefined}/>)}</View>
          {p.editing&&!p.spent&&<TouchableOpacity accessibilityRole="button" accessibilityLabel={`${p.seal===i?'Remove seal from':'Place seal on'} Pile ${i+1}`} accessibilityState={{selected:p.seal===i}} onPress={()=>p.onSeal(p.seal===i?null:i)} style={t.sealButton}><Text style={t.outcome}>{p.seal===i?'Remove seal':`Seal Pile ${i+1} (+1 on a win)`}</Text></TouchableOpacity>}
        </View>)}
        {p.editing&&<View style={t.columns}>{(['balanced','front','finish'] as Strategy[]).map((plan,i)=><TouchableOpacity accessibilityRole="button" key={plan} style={t.plan} onPress={()=>p.onSuggest(plan)}><Text style={t.label}>{['Balanced','Front focus','Finish focus'][i]}</Text></TouchableOpacity>)}</View>}
        <TouchableOpacity accessibilityRole="button" onPress={p.onPractice} style={t.practice}><Text style={t.outcome}>Switch to practice view</Text><Text style={t.note}>Keep this hand, score and seal.</Text></TouchableOpacity>
      </ImageBackground>
    </ScrollView>
    <View style={t.footer}>
      {p.storageError&&<Text style={{color:C.red}}>Progress could not be saved. Check device storage.</Text>}
      {!!p.error&&<Text style={{color:C.red}}>{p.error}</Text>}
      {p.editing?<><Text accessibilityLiveRegion="polite" style={[t.note,{color:p.invalid?C.red:C.muted}]}>{p.invalid??(p.spent?'Seal already used':p.seal!==null?`Seal committed to Pile ${p.seal+1}`:p.handNumber===3?'Last hand: use your seal before locking':'Seal available: choose a pile or save it')}</Text><Button title="Lock my plan" disabled={!!p.invalid} onPress={p.onLock}/></>:<Button title={p.revealed<3?`Reveal Pile ${p.revealed+1}`:p.handNumber===3?'See match results':'Deal next hand'} onPress={p.onAdvance}/>}
    </View>
    <Modal visible={p.guide||rules} transparent animationType="fade" onRequestClose={()=>{if(p.guide)p.onGuide();setRules(false);}}>
      <View style={t.scrim}><View style={t.guide}><ScrollView><Text style={s.eyebrow}>WELCOME TO YOUR TABLE</Text><Text style={[s.subtitle,{marginVertical:12}]}>Same rules. Your seat awaits.</Text><Text style={s.body}>1. Your cards are at the bottom. Robin sits opposite you. Tap two of your cards to swap.</Text><Text style={[s.body,{marginVertical:12}]}>2. Scores stay at the top. Each pile wins 1 point; ties give 0.5 each. Play three hands.</Text><Text style={s.body}>3. Choose a seal under your pile for +1 on a win. You have one seal for the whole match.</Text><Text style={[s.body,{marginVertical:12}]}>Use each pile's two shared cards. Keep Pile 1 &lt;= Pile 2 &lt;= Pile 3. Pile 3 uses the best three of your five cards.</Text><SoundToggle/><Button title="Take my seat" onPress={()=>{p.onGuide();setRules(false);}}/><View style={{height:8}}/><Button secondary title="Use practice view" onPress={()=>{p.onGuide();setRules(false);p.onPractice();}}/></ScrollView></View></View>
    </Modal>
  </SafeAreaView>;
}
const t=StyleSheet.create({
  nav:{...s.row,paddingHorizontal:16},score:{paddingHorizontal:16,paddingBottom:10,backgroundColor:C.bg},
  table:{flex:1,paddingHorizontal:20,paddingTop:24,paddingBottom:24,gap:12},
  seat:{alignItems:'center',gap:3},seatName:{color:C.gold,fontSize:12,fontWeight:'800',letterSpacing:1},
  note:{color:'#D0DFC9',fontSize:11,lineHeight:16,textAlign:'center'},label:{color:C.text,fontSize:11,fontWeight:'700'},
  columns:{flexDirection:'row',gap:6},column:{flex:1,alignItems:'center',gap:5},miniCards:{flexDirection:'row',justifyContent:'center',flexWrap:'wrap',gap:2},
  card:{width:44,height:62,borderWidth:1,borderColor:'#D6C27F',borderRadius:4,backgroundColor:'#F7F1DF',overflow:'hidden'},smallCard:{width:26,height:37},face:{width:'100%',height:'100%'},selected:{borderWidth:3,borderColor:'#FFE18D',transform:[{translateY:-4}]},
  shared:{paddingVertical:12,gap:10,borderTopWidth:1,borderBottomWidth:1,borderColor:'#577449'},
  pile:{padding:9,gap:7,borderRadius:10,borderWidth:1,borderColor:'#69805A',backgroundColor:'rgba(3,24,15,0.72)'},playerCards:{flexDirection:'row',gap:4,flexWrap:'wrap'},
  sealButton:{minHeight:44,justifyContent:'center'},outcome:{color:C.gold,fontSize:12,fontWeight:'700',textAlign:'center'},plan:{flex:1,paddingVertical:13,alignItems:'center',borderRadius:8,backgroundColor:'rgba(3,24,15,0.88)'},practice:{padding:12,gap:4},
  footer:{padding:12,gap:6,borderTopWidth:1,borderColor:C.line},scrim:{flex:1,justifyContent:'center',alignItems:'center',padding:24,backgroundColor:'rgba(0,0,0,0.8)'},guide:{...s.panel,width:'100%',maxWidth:420,maxHeight:'90%'},
});
