import React from 'react';
import { Image, Text, View } from 'react-native';
import { COUNTRIES } from './countries';
export function CountryBadge({code}:{code?:string|null}){
  const country=COUNTRIES.find(c=>c.code===code);
  if(!country)return null;
  return <View accessibilityLabel={`Representing ${country.name}`} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:4,flexWrap:'wrap'}}>
    <Image source={country.image} accessibilityLabel={`${country.name} flag`} style={{width:24,height:18,borderRadius:2}}/>
    <Text style={{color:'#C8C4B0',fontSize:11,flexShrink:1}}>{country.name}</Text>
  </View>;
}
