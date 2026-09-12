import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { Language, LANGUAGES, resolveLanguage } from './translate';
export const LANGUAGE_STORAGE_KEY='triplepoker.learning.language.v1';
export function deviceLanguage():Language {
  try {
    const browserLocales=(globalThis as {navigator?:{languages?:readonly string[]}}).navigator?.languages;
    return resolveLanguage(browserLocales?.length?browserLocales:[Intl.DateTimeFormat().resolvedOptions().locale]);
  }catch{return 'en';}
}
type State={language:Language;choice:Language|null;ready:boolean;saveError:boolean;select:(choice:Language|null)=>void;refresh:()=>void};
let revision=0;
let saves=Promise.resolve();
export const useLanguage=create<State>((set,get)=>({
  language:deviceLanguage(),choice:null,ready:false,saveError:false,
  select:choice=>{
    const selectedRevision=++revision;
    set({choice,language:choice??deviceLanguage(),saveError:false});
    saves=saves.catch(()=>{}).then(()=>AsyncStorage.setItem(LANGUAGE_STORAGE_KEY,choice??'auto')).catch(()=>{if(selectedRevision===revision)set({saveError:true});});
  },
  refresh:()=>{if(get().choice===null)set({language:deviceLanguage()});},
}));
const initialRevision=revision;
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then(saved=>{
  if(revision!==initialRevision){useLanguage.setState({ready:true});return;}
  const choice=LANGUAGES.includes(saved as Language)?saved as Language:null;
  useLanguage.setState({choice,language:choice??deviceLanguage(),ready:true});
}).catch(()=>useLanguage.setState({ready:true,saveError:true}));
// ติดตามการเปลี่ยนภาษาเครื่องเมื่อกลับเข้าแอป แต่ไม่ทับภาษาที่ผู้ใช้เลือกเอง
AppState.addEventListener('change',state=>{if(state==='active')useLanguage.getState().refresh();});
