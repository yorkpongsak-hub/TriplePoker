/// <reference lib="dom" />
import { Asset } from 'expo-asset'
import type { AudioSource } from 'expo-audio'
import type { ManagedPlayer } from './playerFactory'

// expo-audio's installed web player reports playing=true before media.play() resolves
// and drops its rejection. Autoplay denial then disables the manager's recovery check.
// Own the small HTMLAudio lifecycle on web; native continues to use expo-audio.
export function createManagedPlayer(source:AudioSource):ManagedPlayer {
  const uri=typeof source==='number'?Asset.fromModule(source).uri:typeof source==='string'?source:source?.uri
  if(!uri)throw new Error('Missing audio source')
  const media=new Audio(uri)
  media.preload='auto'
  let removed=false,version=0
  const listeners=new Set<(status:{isLoaded:boolean;didJustFinish:boolean})=>void>()
  const emit=()=>{for(const listener of listeners)listener({isLoaded:media.readyState>=2,didJustFinish:media.ended})}
  for(const name of ['loadeddata','timeupdate','ended','error'])media.addEventListener(name,emit)
  media.load()
  return {
    get isLoaded(){return !removed&&media.readyState>=2},
    get playing(){return !removed&&!media.paused&&!media.ended},
    get currentTime(){return media.currentTime},get duration(){return media.duration},
    get volume(){return media.volume},set volume(value){media.volume=value},
    get loop(){return media.loop},set loop(value){media.loop=value},
    play(){
      if(removed)return
      const attempt=version
      // A blocked play remains paused and retryable on the next user gesture.
      void media.play().then(()=>{if(removed||attempt!==version)media.pause()}).catch(()=>{})
    },
    pause(){version++;media.pause()},
    remove(){removed=true;version++;listeners.clear();for(const name of ['loadeddata','timeupdate','ended','error'])media.removeEventListener(name,emit);media.pause();media.removeAttribute('src');media.load()},
    addListener(_event,listener){listeners.add(listener);return{remove:()=>listeners.delete(listener)}},
  }
}
