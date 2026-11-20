const mockMemory = new Map<string,string>();
jest.mock('../../../client/node_modules/@react-native-async-storage/async-storage',()=>({
  __esModule:true,default:{
    getItem:jest.fn(async(key:string)=>mockMemory.get(key)??null),
    setItem:jest.fn(async(key:string,value:string)=>{mockMemory.set(key,value);}),
    removeItem:jest.fn(async(key:string)=>{mockMemory.delete(key);}),
  },
}));
import { useLaunchStore, sessionView, tableAvailable } from '../../../client/src/launch/store';
import { createMatch, clonePiles } from '../../../client/src/launch/engine';
import { EMPTY_PROGRESS } from '../../../client/src/launch/progress';
const flush=()=>new Promise(resolve=>setTimeout(resolve,20));
test('draft, spent seal and reveal position survive hydration; completion cannot be repeated',async()=>{
  await flush();
  useLaunchStore.setState({progress:{...EMPTY_PROGRESS},active:null});
  const store=()=>useLaunchStore.getState();
  const match=createMatch(9001);
  store().start(match);
  const changed=clonePiles(match.hands[0].starter);
  [changed[0][0],changed[0][1]]=[changed[0][1],changed[0][0]];
  store().draft(changed);store().seal(1);
  await flush();
  await useLaunchStore.persist.rehydrate();
  expect(store().active?.draft).toEqual(changed);
  expect(store().active?.seal).toBe(1);
  store().lock();store().advance();
  await flush();
  await useLaunchStore.persist.rehydrate();
  expect(store().active?.revealed).toBe(1);
  expect(store().active?.phase).toBe('reveal');
  store().advance();store().advance();store().advance();
  expect(store().active?.phase).toBe('arrange');
  store().seal(2);
  expect(store().active?.seal).toBeNull();
  for(let h=1;h<3;h++) {store().lock();for(let r=0;r<4;r++)store().advance();}
  expect(store().progress.matches).toBe(1);
  expect(store().active?.phase).toBe('result');
  await flush();await useLaunchStore.persist.rehydrate();store().advance();
  expect(store().progress.matches).toBe(1);
});
test('table starts on match three, never hand three; view switches preserve the live hand',async()=>{
  const store=()=>useLaunchStore.getState();
  useLaunchStore.setState({progress:{...EMPTY_PROGRESS,matches:1},active:null,tableGuideSeen:false});
  store().start(createMatch(99));
  expect(store().active?.matchNumber).toBe(2);
  expect(sessionView(store().active!,1)).toBe('practice');
  store().setView('table');
  expect(store().active?.view).toBe('practice');
  for(let h=0;h<2;h++){store().lock();for(let r=0;r<4;r++)store().advance();}
  expect(store().active?.match.results).toHaveLength(2);
  expect(tableAvailable(store().active!,1)).toBe(false);
  store().lock();for(let r=0;r<4;r++)store().advance();
  expect(tableAvailable(store().active!,2)).toBe(false);
  store().start(createMatch(100));
  expect(store().active?.matchNumber).toBe(3);
  expect(sessionView(store().active!,2)).toBe('table');
  store().seal(1);store().lock();store().advance();
  const before=store().active!;
  store().dismissTableGuide();store().setView('practice');
  expect(store().active).toEqual({...before,view:'practice'});
  await flush();await useLaunchStore.persist.rehydrate();
  expect(store().tableGuideSeen).toBe(true);
  expect(store().active?.view).toBe('practice');
  store().setView('table');
  expect(store().active).toEqual(before);
});
