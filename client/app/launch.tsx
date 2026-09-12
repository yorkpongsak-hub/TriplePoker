import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Text } from '../src/launch/i18n/components';
import LanguagePicker from '../src/launch/i18n/LanguagePicker';
import { useLanguage } from '../src/launch/i18n/languageStore';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLaunchStore } from '../src/launch/store';
import { advancedUnlocked, practiceComplete, tierDUnlocked, LESSONS } from '../src/launch/progress';
import { Button, C, PlayingCard, SoundToggle, s } from '../src/launch/ui';
import { useAuthStore } from '../src/store/authStore';
import { shouldResumeTierDSolo } from '../src/game/tierDSoloResume';

export default function Launch() {
  const languageReady=useLanguage(state=>state.ready);
  const {progress,active,hydrated,storageError,passLessons}=useLaunchStore();
  const [lesson,setLesson]=useState<number|null>(null),[answer,setAnswer]=useState<number|null>(null);
  const user=useAuthStore(state=>state.user);
  const routedUserId=useRef<string|null>(null);
  useEffect(()=>{
    const userId=user?.is_anonymous ? undefined : user?.id;
    if(!userId||routedUserId.current===userId)return;
    routedUserId.current=userId;
    void shouldResumeTierDSolo(userId).then(resume=>{if(resume)router.replace('/game/tier-d');}).catch(()=>{});
  },[user?.id,user?.is_anonymous]);
  if(!hydrated||!languageReady)return <SafeAreaView style={s.page}><ActivityIndicator color={C.gold}/></SafeAreaView>;
  const unlocked=advancedUnlocked(progress);
  const soloUnlocked=tierDUnlocked(progress);
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <View style={s.row}><Text style={s.eyebrow}>TRIPLEPOKER / FIRST MOVES</Text><Text style={{color:C.mint}}>SOLO</Text></View>
    <LanguagePicker/>
    <View style={{paddingVertical:12,gap:14}}>
      <Text style={s.title}>Three piles.{'\n'}One clever plan.</Text>
      <Text style={s.body}>Outthink a rival in three hands. Pick your moment. Make your seal count.</Text>
      <View style={{flexDirection:'row',gap:8,paddingVertical:8}}>{['as','kh','qd'].map(card=><PlayingCard key={card} card={card}/>)}</View>
      <Button title={active&&active.phase!=='result'?'Continue your match':'Play Three Piles'} onPress={()=>router.push(active?.phase==='result'?'/duel?fresh=yes':'/duel')}/>
      {active?.phase==='result'&&<Button title="Review your last match" secondary onPress={()=>router.push('/duel')}/>}
      <Text style={[s.body,{fontSize:12,textAlign:'center'}]}>Free solo play with an AI rival. No account needed.</Text>
    </View>
    <View style={s.panel}>
      <Text style={s.eyebrow}>YOUR FIRST MATCH</Text>
      <Text style={s.subtitle}>Learn by making a move.</Text>
      <Text style={s.body}>1. Arrange 11 cards into piles of 3, 3 and 5.</Text>
      <Text style={s.body}>2. Each pile uses its two shared cards. Keep Pile 1 weakest and Pile 3 strongest.</Text>
      <Text style={s.body}>3. Win a pile for 1 point. Use your one seal for +1 on a win. Most points after three hands wins.</Text>
      <Text style={[s.body,{color:C.mint}]}>Take your time. A starter arrangement and free plan suggestions are always available.</Text>
      <Text style={s.body}>Matches 1 and 2 use the practice view. From match 3, take your seat at the TriplePoker table with the same rules. You can switch back to practice any time.</Text>
    </View>
    <View style={s.panel}>
      <Text style={s.eyebrow}>YOUR JOURNEY</Text>
      <View style={s.row}><Text style={s.subtitle}>{progress.matches} {progress.matches===1?'match':'matches'}</Text><Text style={{color:C.gold,fontWeight:'800'}}>{progress.wins} {progress.wins===1?'win':'wins'}</Text></View>
      <Text style={s.body}>Discover the deeper tables by practicing the basics.</Text>
      <Text style={[s.body,{fontSize:12}]}>Advanced tables currently use English. Your learning screens keep your chosen language.</Text>
      <Text style={s.body}>{Math.min(progress.matches,2)} / 2 onboarding matches finished</Text>
      {soloUnlocked&&<Button title="Play Tier D Solo" secondary onPress={()=>router.push('/game/tier-d')}/>} 
      <Text style={s.body}>{Math.min(progress.sealWins,2)} / 2 piles won with your seal</Text>
      <Text style={s.body}>{progress.lessonsPassed?'Complete':'Next'}: pass the four-question strategy check</Text>
      {practiceComplete(progress)&&!progress.lessonsPassed&&<Button title="Take the strategy check" secondary onPress={()=>{setLesson(0);setAnswer(null);}}/>}
      {unlocked&&<><Text style={[s.body,{color:C.mint}]}>Advanced tables unlocked. Learn auctions, token entry rules and Call/Fold at your own pace.</Text><Button title="Explore advanced tables" secondary onPress={()=>router.push('/(home)/classic-lobby')}/></>}
      {!unlocked&&<Text style={[s.body,{fontSize:12}]}>Auctions, tokens and multiplayer arrive after this foundation. Your existing account and collection are kept.</Text>}
    </View>
    {lesson!==null&&<View style={s.panel}>
      <Text style={s.eyebrow}>STRATEGY CHECK {lesson+1} / {LESSONS.length}</Text>
      <Text style={s.subtitle}>{LESSONS[lesson].question}</Text>
      {LESSONS[lesson].answers.map((a,i)=><Button key={a} title={a} secondary onPress={()=>setAnswer(i)}/>)}
      {answer!==null&&<Text accessibilityLiveRegion="polite" style={[s.body,{color:answer===LESSONS[lesson].correct?C.mint:C.red}]}>{answer===LESSONS[lesson].correct?'Correct. ':'Try again. '}{LESSONS[lesson].why}</Text>}
      {answer===LESSONS[lesson].correct&&<Button title={lesson===LESSONS.length-1?'Unlock advanced tables':'Next question'} onPress={()=>{if(lesson===LESSONS.length-1){passLessons();setLesson(null);}else setLesson(lesson+1);setAnswer(null);}}/>}
    </View>}
    <SoundToggle/>
    {storageError&&<Text style={{color:C.red}}>Your device could not save progress. Keep this session open and check available storage.</Text>}
    <Text style={[s.body,{fontSize:12,textAlign:'center'}]}>Solo progress stays on this device. No daily streak to maintain.{ '\n'}Play a match. Try a new plan. Come back when you want.</Text>
  </ScrollView></SafeAreaView>;
}
