const mockMemory=new Map<string,string>();
jest.mock('../../../client/node_modules/@react-native-async-storage/async-storage',()=>({__esModule:true,default:{
  getItem:async(key:string)=>mockMemory.get(key)??null,
  setItem:async(key:string,value:string)=>{mockMemory.set(key,value);},
}}));
jest.mock('../../../client/node_modules/react-native',()=>({AppState:{addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
const flushLanguage=()=>new Promise(resolve=>setTimeout(resolve,10));
test('manual language persists across reloads without touching match progress',async()=>{
  const legacyKey='triplepoker.learning.language.v1';
  mockMemory.set(legacyKey,'th');mockMemory.set('triplepoker.launch.v1','saved-match');
  const first=require('../../../client/src/launch/i18n/languageStore');
  const key=first.LANGUAGE_STORAGE_KEY;
  await flushLanguage();
  expect(first.useLanguage.getState().language).toBe('th');
  first.useLanguage.getState().select('zh-CN');await flushLanguage();
  expect(mockMemory.get(key)).toBe('zh-CN');
  jest.resetModules();
  const second=require('../../../client/src/launch/i18n/languageStore');
  await flushLanguage();
  expect(second.useLanguage.getState().language).toBe('zh-CN');
  second.useLanguage.getState().refresh();
  expect(second.useLanguage.getState().language).toBe('zh-CN');
  second.useLanguage.getState().select(null);await flushLanguage();
  expect(mockMemory.get(key)).toBe('auto');
  expect(second.useLanguage.getState().choice).toBeNull();
  expect(mockMemory.get('triplepoker.launch.v1')).toBe('saved-match');
});
