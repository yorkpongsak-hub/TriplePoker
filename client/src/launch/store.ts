import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Match, Piles, clonePiles, lockHand } from './engine';
import { EMPTY_PROGRESS, Progress, recordMatch, practiceComplete } from './progress';
export type Session = {match:Match; phase:'arrange'|'reveal'|'result'; revealed:number; draft:Piles; seal:number|null; matchNumber?:number; view?:'practice'|'table'};
export const sessionNumber = (active:Session, completed:number) => active.matchNumber ?? Math.max(1,completed+(active.phase==='result'?0:1));
export const tableAvailable = (active:Session, completed:number) => sessionNumber(active,completed)>=3;
export const sessionView = (active:Session, completed:number) => active.view ?? (tableAvailable(active,completed)?'table':'practice');
type LaunchStore = {
  progress:Progress; active:Session|null; hydrated:boolean; storageError:boolean; tableGuideSeen:boolean;
  setView:(view:'practice'|'table')=>void; dismissTableGuide:()=>void;
  ready:(error?:boolean)=>void; start:(match:Match)=>void; draft:(piles:Piles)=>void;
  seal:(pile:number|null)=>void; lock:()=>void; advance:()=>void; passLessons:()=>void;
};
// เขียนเรียงตามลำดับ ป้องกัน snapshot เก่าเขียนทับผลแมตช์ใหม่
let writes = Promise.resolve();
const storage = {
  getItem:(name:string)=>AsyncStorage.getItem(name),
  removeItem:(name:string)=>AsyncStorage.removeItem(name),
  setItem:(name:string,value:string)=> {
    writes = writes.catch(()=>{}).then(()=>AsyncStorage.setItem(name,value));
    return writes.catch(()=> { if(!useLaunchStore.getState().storageError)useLaunchStore.setState({storageError:true}); });
  },
};
export const useLaunchStore = create<LaunchStore>()(persist((set,get)=>({
  progress:{...EMPTY_PROGRESS},active:null,hydrated:false,storageError:false,tableGuideSeen:false,
  setView:view=>{const a=get().active;if(a&&(view==='practice'||tableAvailable(a,get().progress.matches)))set({active:{...a,view}});},
  dismissTableGuide:()=>set({tableGuideSeen:true}),
  ready:(error=false)=>set({hydrated:true,storageError:error}),
  start:match=>set({active:{match,phase:'arrange',revealed:0,draft:clonePiles(match.hands[0].starter),seal:null,matchNumber:get().progress.matches+1,view:get().progress.matches>=2?'table':'practice'}}),
  draft:piles=> {const a=get().active;if(a?.phase==='arrange') set({active:{...a,draft:piles}});},
  seal:pile=> {const a=get().active;if(a?.phase==='arrange' && !a.match.results.some(r=>r.seal!==null)) set({active:{...a,seal:pile}});},
  lock:()=> {const a=get().active;if(a?.phase==='arrange') set({active:{...a,match:lockHand(a.match,a.draft,a.seal),phase:'reveal',revealed:0}});},
  advance:()=> {
    const a=get().active;if(!a || a.phase!=='reveal') return;
    if(a.revealed<3) {set({active:{...a,revealed:a.revealed+1}});return;}
    if(a.match.results.length===3) {set({active:{...a,phase:'result'},progress:recordMatch(get().progress,a.match)});return;}
    set({active:{...a,phase:'arrange',revealed:0,draft:clonePiles(a.match.hands[a.match.results.length].starter),seal:null}});
  },
  passLessons:()=> {if(practiceComplete(get().progress))set({progress:{...get().progress,lessonsPassed:true}});},
}),{
  name:'triplepoker.launch.v1',version:1,storage:createJSONStorage(()=>storage),
  partialize:s=>({progress:s.progress,active:s.active,tableGuideSeen:s.tableGuideSeen}),
  onRehydrateStorage:()=> (state,error)=> {if(state)state.ready(Boolean(error));else useLaunchStore.setState({hydrated:true,storageError:true});},
}));
