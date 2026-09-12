const mockMemory=new Map<string,string>();
jest.mock('../../../client/node_modules/@react-native-async-storage/async-storage',()=>({__esModule:true,default:{
  getItem:async(key:string)=>mockMemory.get(key)??null,
  setItem:async(key:string,value:string)=>{mockMemory.set(key,value);},
}}));
jest.mock('../../../client/node_modules/react-native',()=>({AppState:{addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
const flushLanguage=()=>new Promise(resolve=>setTimeout(resolve,10));
test('manual language persists across reloads without touching match progress',async()=>{
  const key='triplepoker.learning.language.v1';
  mockMemory.set(key,'th');mockMemory.set('triplepoker.launch.v1','saved-match');
  const first=require('../../../client/src/launch/i18n/languageStore');
  await flushLanguage();
  expect(first.useLanguage.getState().language).toBe('th');
  first.useLanguage.getState().select('ja');await flushLanguage();
  expect(mockMemory.get(key)).toBe('ja');
  jest.resetModules();
  const second=require('../../../client/src/launch/i18n/languageStore');
  await flushLanguage();
  expect(second.useLanguage.getState().language).toBe('ja');
  second.useLanguage.getState().refresh();
  expect(second.useLanguage.getState().language).toBe('ja');
  second.useLanguage.getState().select(null);await flushLanguage();
  expect(mockMemory.get(key)).toBe('auto');
  expect(second.useLanguage.getState().choice).toBeNull();
  expect(mockMemory.get('triplepoker.launch.v1')).toBe('saved-match');
});
