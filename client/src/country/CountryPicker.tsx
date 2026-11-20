import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,Modal,ScrollView,TextInput,ActivityIndicator} from 'react-native';
import {useAuthStore} from '../store/authStore';
import {COUNTRIES} from './countries';
import {CountryBadge} from './CountryBadge';
import {CountryState,saveCountry} from './api';

export function CountryPicker({onChange}:{onChange:()=>void}){
  const token=useAuthStore(s=>s.session?.access_token);
  const [country,setCountry]=useState<CountryState>({country_code:null,source:null});
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;setCountry({country_code:null,source:null});setError('');
    if(token)saveCountry(token).then(value=>{if(active)setCountry(value);}).catch(()=>{if(active)setError('Country settings are unavailable. Please try again.');});
    return()=>{active=false;};
  },[token]);
  async function choose(code:string|null){
    if(!token||busy)return;
    setBusy(true);setError('');
    try{const value=await saveCountry(token,code?'manual':'hidden',code??undefined);
      if(useAuthStore.getState().session?.access_token!==token)return;
      setCountry(value);setOpen(false);onChange();
    }catch{setError('Could not save your country. Please try again.');}finally{setBusy(false);}
  }
  if(!token)return null;
  return <View style={{padding:12,borderColor:'#3A5A44',borderWidth:1,borderRadius:12,margin:12}}>
    <Text style={{color:'#FFD76A',fontWeight:'700'}}>YOUR COUNTRY / REGION</Text>
    <CountryBadge code={country.country_code}/>
    <Text style={{color:'#C8C4B0',fontSize:12,marginVertical:6}}>{country.source==='network'?'Suggested from your connection. Change it to the country you represent.':country.source==='hidden'?'Your flag is hidden.':country.country_code?'Represent your country on the ranking.':'Choose the country you represent. Automatic detection may be unavailable.'}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={()=>{setQuery('');setOpen(true);}} style={{paddingVertical:10}}><Text style={{color:'#FFD76A'}}>Choose or change flag</Text></TouchableOpacity>
    {!!error&&!open&&<Text style={{color:'#FF9999'}}>{error}</Text>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>{if(!busy)setOpen(false);}}>
      <View style={{flex:1,justifyContent:'center',alignItems:'center',padding:20,backgroundColor:'#000B'}}><View style={{backgroundColor:'#163A25',padding:18,borderRadius:16,width:'100%',maxWidth:420,maxHeight:'85%'}}>
        <Text style={{color:'#FFD76A',fontSize:20,fontWeight:'700'}}>Which country do you represent?</Text>
        <Text style={{color:'#C8C4B0',marginVertical:8}}>Your flag and country name appear publicly below your name. This does not affect your score.</Text>
        <TextInput accessibilityLabel="Search country or country code" placeholder="Search country or code" placeholderTextColor="#C8C4B0" value={query} onChangeText={setQuery} style={{color:'white',padding:12,borderColor:'#3A5A44',borderWidth:1,marginBottom:8}}/>
        {busy&&<ActivityIndicator color="#FFD76A"/>}
        {!!error&&<Text accessibilityRole="alert" style={{color:'#FF9999'}}>{error}</Text>}
        <ScrollView>{COUNTRIES.filter(c=>`${c.name} ${c.code}`.toLowerCase().includes(query.trim().toLowerCase())).map(c=><TouchableOpacity key={c.code} accessibilityRole="button" accessibilityLabel={`Represent ${c.name}`} disabled={busy} onPress={()=>choose(c.code)} style={{paddingVertical:10,borderBottomWidth:1,borderColor:'#2A4A34'}}><CountryBadge code={c.code}/></TouchableOpacity>)}</ScrollView>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>choose(null)} style={{paddingVertical:14}}><Text style={{color:'#FFD76A'}}>Hide my flag</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>setOpen(false)} style={{paddingVertical:10}}><Text style={{color:'#C8C4B0'}}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </View>;
}
