import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Touch as TouchableOpacity } from './i18n/components';
import { audio } from '../audio';
export const C={bg:'#091D19',panel:'#123029',line:'#2A4C40',gold:'#F4CE7C',text:'#F6F0E2',muted:'#ACC5B9',mint:'#86DEB0',red:'#FFACA0'};
export function SoundToggle() {
  const [muted,setMuted]=useState(audio.getSettings().muted);
  useEffect(()=>audio.subscribe(settings=>setMuted(settings.muted)),[]);
  return <TouchableOpacity accessibilityRole="switch" accessibilityLabel="Game sound" accessibilityState={{checked:!muted}} onPress={()=>audio.setMuted(!muted)} style={{minHeight:44,justifyContent:'center'}}><Text style={s.link}>{muted?'Sound off':'Sound on'}</Text></TouchableOpacity>;
}
export function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:0.4}]}><Text style={[s.buttonText,secondary&&{color:C.text}]}>{title}</Text></TouchableOpacity>;
}
export function PlayingCard({card,selected=false,onPress,small=false}:{card:string;selected?:boolean;onPress?:()=>void;small?:boolean}) {
  const suit=card.slice(-1),red=suit==='h'||suit==='d';
  const label=card.slice(0,-1).toUpperCase(),symbol=({s:'♠',h:'♥',d:'♦',c:'♣'} as Record<string,string>)[suit];
  const body=<><Text style={{color:red?'#A73537':'#18342D',fontSize:small?13:17,fontWeight:'800'}}>{label}</Text><Text style={{color:red?'#A73537':'#18342D',fontSize:small?17:23}}>{symbol}</Text></>;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} of ${({s:'spades',h:'hearts',d:'diamonds',c:'clubs'} as Record<string,string>)[suit]}`} accessibilityState={{selected,disabled:!onPress}} disabled={!onPress} onPress={onPress} style={[s.card,small&&{width:32,height:45},selected&&{borderColor:C.gold,backgroundColor:'#FFE2A4',transform:[{translateY:-4}]}]}>{body}</TouchableOpacity>;
}
export const s=StyleSheet.create({
  page:{flex:1,backgroundColor:C.bg},content:{padding:20,gap:16,paddingBottom:32,width:'100%',maxWidth:560,alignSelf:'center'},
  eyebrow:{color:C.gold,fontSize:11,letterSpacing:2,fontWeight:'800'},title:{color:C.text,fontSize:36,fontWeight:'800',lineHeight:40},
  subtitle:{color:C.text,fontSize:22,fontWeight:'700'},body:{color:C.muted,fontSize:14,lineHeight:21},
  panel:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:18,padding:16,gap:10},
  row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8},
  button:{backgroundColor:C.gold,borderRadius:12,paddingHorizontal:16,minHeight:48,alignItems:'center',justifyContent:'center',paddingVertical:12},
  secondary:{backgroundColor:'transparent',borderWidth:1,borderColor:C.line},buttonText:{color:C.bg,fontSize:14,fontWeight:'800',textAlign:'center'},
  card:{width:44,height:61,borderRadius:6,backgroundColor:'#F8F1DF',borderWidth:2,borderColor:'#D8DDCC',alignItems:'center',justifyContent:'center'},
  link:{color:C.gold,fontWeight:'700',fontSize:14,paddingVertical:10},
});
