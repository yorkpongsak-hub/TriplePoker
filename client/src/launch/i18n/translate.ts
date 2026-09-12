import { RAW_MESSAGES } from './catalog';
import { RULE_MESSAGES } from './lessons';
export const LANGUAGES = ['en','th','zh','ja','ko','vi','id','es','pt','fr'] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_NAMES: Record<Language,string> = {en:'English',th:'ไทย',zh:'简体中文',ja:'日本語',ko:'한국어',vi:'Tiếng Việt',id:'Bahasa Indonesia',es:'Español',pt:'Português',fr:'Français'};
export const normalize = (value:string) => value.replace(/\s+/g,' ').trim();
export const MESSAGE_ROWS = (RAW_MESSAGES+'\n'+RULE_MESSAGES).trim().split('\n').filter(line=>line.trim()).map(line=>line.split('|'));
const messages = new Map(MESSAGE_ROWS.map(row=>[normalize(row[0]),row]));
// ข้อความซ้ำที่มีความหมายเดียวกันใช้คำแปลเดียวกัน ลดการแก้กติกาไม่ตรงกัน
const aliases:Record<string,string> = {
  'Progress could not be saved. Check device storage.':'Your device could not save progress. Keep this session open and check available storage.',
  'Progress could not be saved. Check device storage before closing the app.':'Your device could not save progress. Keep this session open and check available storage.',
};
const templates = MESSAGE_ROWS.filter(row=>/\{\w+\}/.test(row[0])).map(row=>{
  const keys:string[]=[];
  const pattern=normalize(row[0]).split(/(\{\w+\})/).map(part=>{
    if(/^\{\w+\}$/.test(part)){keys.push(part.slice(1,-1));return '(.+?)';}
    return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('');
  return {row,keys,regex:new RegExp('^'+pattern+'$')};
});
export function resolveLanguage(locales:readonly string[]):Language {
  // ใช้ลำดับภาษาที่ผู้ใช้ต้องการ ไม่ใช้ประเทศ/IP และไม่สลับจีนตัวเต็มเป็นตัวย่อโดยเงียบ ๆ
  for(const locale of locales){
    const tag=locale.toLowerCase().replace(/_/g,'-');
    if(/^zh-(hant|tw|hk|mo)(-|$)/.test(tag)||tag.includes('-hant'))continue;
    const base=tag.split('-')[0]==='in'?'id':tag.split('-')[0];
    if(LANGUAGES.includes(base as Language))return base as Language;
  }
  return 'en';
}
export function lookupTranslation(source:string,language:Language):string|undefined {
  const key=normalize(source),index=LANGUAGES.indexOf(language);
  if(index<0)return undefined;
  const row=messages.get(aliases[key]??key);
  if(row)return row[index]||row[0];
  for(const template of templates){
    const match=key.match(template.regex);
    if(!match)continue;
    const params=Object.fromEntries(template.keys.map((name,i)=>[name, messages.get(match[i+1])?.[index]??match[i+1]]));
    return (template.row[index]||template.row[0]).replace(/\{(\w+)\}/g,(_,name)=>params[name]);
  }
  return undefined;
}
export function translate(source:string,language:Language):string {
  if(language==='en')return source;
  const text=lookupTranslation(source,language);
  return text===undefined?source:(source.match(/^\s*/)?.[0]??'')+text+(source.match(/\s*$/)?.[0]??'');
}
// รวมประโยคก่อนแปลเพื่อให้ตัวแปรย้ายตำแหน่งได้ แล้วจึงแปลส่วนย่อยสำหรับข้อความประกอบ เช่น ชื่อผู้เล่น+คะแนน
export function translateParts(parts:readonly (string|number)[],language:Language):string {
  const whole=parts.join('');
  if(language==='en')return whole;
  return lookupTranslation(whole,language)??parts.map(part=>typeof part==='number'?String(part):translate(part,language)).join('');
}
