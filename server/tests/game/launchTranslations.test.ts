import { LANGUAGE_NAMES, LANGUAGES, MESSAGE_ROWS, lookupTranslation, normalize, resolveLanguage, translate, translateParts } from '../../../client/src/launch/i18n/translate';
import { LESSONS } from '../../../client/src/launch/progress';
import { RANKS } from '../../../client/src/launch/engine';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import ts from 'typescript';

test('all ten catalogs have complete rows, unique sources and matching placeholders',()=>{
  expect(LANGUAGES).toHaveLength(10);
  expect(Object.keys(LANGUAGE_NAMES)).toHaveLength(10);
  expect(new Set(MESSAGE_ROWS.map(row=>normalize(row[0]))).size).toBe(MESSAGE_ROWS.length);
  for(const row of MESSAGE_ROWS){
    expect({key:row[0],columns:row.length}).toEqual({key:row[0],columns:10});
    const keys=(row[0].match(/\{\w+\}/g)??[]).sort();
    for(const translation of row){
      expect(translation.trim()).not.toBe('');
      expect({key:row[0],parameters:(translation.match(/\{\w+\}/g)??[]).sort()}).toEqual({key:row[0],parameters:keys});
    }
  }
});
test('device language honors ordered preferences, variants and unsupported fallback',()=>{
  for(const locale of ['th-TH','th_TH'])expect(resolveLanguage([locale])).toBe('th');
  expect(resolveLanguage(['pt-BR'])).toBe('pt');
  expect(resolveLanguage(['es-MX'])).toBe('es');
  expect(resolveLanguage(['zh-Hans-CN'])).toBe('zh');
  expect(resolveLanguage(['zh-TW'])).toBe('en');
  expect(resolveLanguage(['zh-Hant-HK','fr-CA'])).toBe('fr');
  expect(resolveLanguage(['de-DE','ja-JP'])).toBe('ja');
  expect(resolveLanguage(['in-ID'])).toBe('id');
  expect(resolveLanguage(['ar-SA'])).toBe('en');
  expect(resolveLanguage([])).toBe('en');
});
test('dynamic scores, rank names and replay results preserve values in every language',()=>{
  const samples=['HAND 2 / 3','You lead by 1.5. 4 piles left.','Reveal Pile 3','Seal on Pile 2: bonus won','With the same rival plan and seal: You 2.5 : Robin 1.5. Original: 1 : 3.','A of hearts'];
  for(const lang of LANGUAGES){
    for(const value of samples){expect(lookupTranslation(value,lang)).toBeDefined();expect(translate(value,lang)).not.toMatch(/\{\w+\}/);}
    expect(translate(samples[1],lang)).toContain('1.5');
    expect(translate(samples[1],lang)).toContain('4');
    for(const rank of RANKS)expect(lookupTranslation(rank,lang)).toBeDefined();
    for(const lesson of LESSONS)for(const text of [lesson.question,...lesson.answers,lesson.why])expect(lookupTranslation(text,lang)).toBeDefined();
  }
  expect(translateParts(['PILE ',3,' / ', 'Full house'],'th')).toBe('กอง 3 / ฟูลเฮาส์');
  expect(translateParts(['HAND ',2,' / 3'],'ja')).toBe('ハンド 2 / 3');
  expect(translateParts(['Hand ',1],'th')).toBe(translate('Hand 1','th'));
  expect(translate('Unknown future text','th')).toBe('Unknown future text');
});
test('literal explanation text in learning screens has catalog coverage',()=>{
  const files=['client/app/launch.tsx','client/app/duel.tsx','client/src/launch/TableDuel.tsx'];
  const missing:string[]=[];
  for(const file of files){
    const source=ts.createSourceFile(file,readFileSync(resolve(__dirname,'../../..',file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const walk=(node:ts.Node)=>{
      if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='Text'){
        const staticParts=node.children.map(child=>ts.isJsxText(child)?child.text:ts.isJsxExpression(child)&&child.expression&&ts.isStringLiteral(child.expression)?child.expression.text:null);
        if(staticParts.every(part=>part!==null)&&lookupTranslation(staticParts.join(''),'th')!==undefined)return;
      }
      if(ts.isJsxText(node)&&ts.isJsxElement(node.parent)&&node.parent.openingElement.tagName.getText(source)==='Text'){
        const value=normalize(node.text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
        if(/[a-z]/i.test(value)&&!['HAND','Hand','Robin','Robin:'].includes(value)&&lookupTranslation(value,'th')===undefined)missing.push(value);
      }
      ts.forEachChild(node,walk);
    };
    walk(source);
  }
  expect(missing).toEqual([]);
});
