import React, { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Button, C, s } from '../ui';
import { Text, Touch } from './components';
import { localeNames, supportedLocales } from '../../i18n';
import { useI18n } from '../../i18n/store';
export default function LanguagePicker() {
  const {locale:language,choice,select,saveError}=useI18n();
  const [open,setOpen]=useState(false);
  return <>
    <Touch accessibilityRole="button" accessibilityLabel="Choose your language" onPress={()=>setOpen(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={[s.link,{fontSize:13}]}>Language{' · '}{localeNames[language]}</Text></Touch>
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.8)',padding:20,alignItems:'center',justifyContent:'center'}}><View style={[s.panel,{width:'100%',maxWidth:420,maxHeight:'90%'}]}>
        <Text style={s.subtitle}>Choose your language</Text>
        <ScrollView><Touch accessibilityRole="radio" accessibilityState={{checked:choice===null}} onPress={()=>select(null)} style={{paddingVertical:12}}><Text style={s.body}>{choice===null?'✓ ':''}Use device language</Text></Touch>
          {supportedLocales.map(code=><Touch key={code} accessibilityRole="radio" accessibilityLabel={localeNames[code]} accessibilityState={{checked:choice===code}} onPress={()=>select(code)} style={{paddingVertical:12,borderTopWidth:1,borderColor:C.line}}><Text style={{color:choice===code?C.gold:C.text,fontSize:17}}>{choice===code?'✓ ':''}{localeNames[code]}</Text></Touch>)}
        </ScrollView>
        {saveError&&<Text style={{color:C.red}}>Could not save your language. It will apply for this session.</Text>}
        <Button title="Done" onPress={()=>setOpen(false)}/>
      </View></View>
    </Modal>
  </>;
}
