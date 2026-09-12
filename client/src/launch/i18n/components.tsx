import React from 'react';
import { StyleSheet, Text as NativeText, TextProps, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { useLanguage } from './languageStore';
import { translate, translateParts } from './translate';
export function Text({children,style,...props}:TextProps) {
  const language=useLanguage(state=>state.language);
  const parts=React.Children.toArray(children);
  const content=parts.every(child=>typeof child==='string'||typeof child==='number')
    ? translateParts(parts as (string|number)[],language)
    : parts.map(child=>typeof child==='string'?translate(child,language):child);
  const original=StyleSheet.flatten(style)??{};
  const typography=language==='th'?{letterSpacing:0,lineHeight:Math.max(original.lineHeight??0,(original.fontSize??14)*1.5)}
    : ['zh','ja','ko'].includes(language)?{letterSpacing:0,lineHeight:Math.max(original.lineHeight??0,(original.fontSize??14)*1.4)}:{};
  return <NativeText {...props} accessibilityLabel={props.accessibilityLabel?translate(props.accessibilityLabel,language):undefined} style={[{flexShrink:1},style,typography]}>{content}</NativeText>;
}
export function Touch({accessibilityLabel,...props}:TouchableOpacityProps) {
  const language=useLanguage(state=>state.language);
  return <TouchableOpacity {...props} accessibilityLabel={accessibilityLabel?translate(accessibilityLabel,language):undefined}/>;
}
