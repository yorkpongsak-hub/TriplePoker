import { AudioSource, createAudioPlayer } from 'expo-audio'
export type ManagedPlayer = {
  readonly isLoaded: boolean; readonly playing: boolean; readonly currentTime: number; readonly duration: number
  loop: boolean; volume: number
  play(): void; pause(): void; remove(): void
  seekTo(seconds: number): Promise<void>
  addListener(event: 'playbackStatusUpdate', listener: (status: {isLoaded:boolean;didJustFinish:boolean}) => void): {remove():void}
}
export function createManagedPlayer(source:AudioSource):ManagedPlayer {
  // Static require() assets are already packaged by Metro. On Android/Expo Go,
  // downloadFirst can leave short local SFX on a null source indefinitely,
  // producing repeated load timeouts. Let the native player resolve them directly.
  return createAudioPlayer(source,{downloadFirst:false,keepAudioSessionActive:true,updateInterval:250})
}
