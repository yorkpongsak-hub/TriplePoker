const mockPlayers:any[]=[];
const mockAppState={currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))};
const mockActivate=jest.fn(async()=>{});
const mockPlatform={OS:'android'};
const mockLoadSettings=jest.fn(async()=>({muted:false,master:1,categories:{BGM:1,UI:1,CARD:1,BOSS:1,RESULT:1}}));
const mockCreate=jest.fn(()=>{
  const listeners=new Set<(s:any)=>void>();
  const p:any={playing:false,isLoaded:true,currentTime:0,duration:1,volume:1,loop:false,
    play:jest.fn(()=>{p.playing=true;}),pause:jest.fn(()=>{p.playing=false;}),remove:jest.fn(),
    seekTo:jest.fn(async(seconds:number)=>{p.currentTime=seconds;}),
    addListener:jest.fn((_name:string,fn:(s:any)=>void)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}),
    finish:()=>{p.playing=false;for(const fn of listeners)fn({didJustFinish:true,isLoaded:true});}};
  mockPlayers.push(p);return p;
});
jest.mock('../../../client/node_modules/react-native',()=>({AppState:mockAppState,Platform:mockPlatform}));
jest.mock('../../../client/node_modules/expo-audio',()=>({createAudioPlayer:mockCreate,setAudioModeAsync:async()=>{},setIsAudioActiveAsync:mockActivate}));
jest.mock('../../../client/src/audio/audioSettings',()=>({
  DEFAULT_AUDIO_SETTINGS:{muted:false,master:1,categories:{BGM:1,UI:1,CARD:1,BOSS:1,RESULT:1}},
  loadAudioSettings:mockLoadSettings,
  saveAudioSettings:async()=>{},clampVolume:(v:number)=>Math.min(1,Math.max(0,v)),
}));
jest.mock('../../../client/src/audio/audioRegistry',()=>({PRELOAD_AUDIO_EVENTS:['BUTTON_CONFIRM'],audioRegistry:{
  LOBBY_BGM:{source:1,category:'BGM',priority:1,volume:1,loop:true},
  PROFILE_BGM:{source:2,category:'BGM',priority:1,volume:1,loop:true},
  BUTTON_CONFIRM:{source:3,category:'UI',priority:1,volume:1},
  CARD_SELECT:{source:5,category:'CARD',priority:1,volume:1},
  CARD_MOVE:{source:6,category:'CARD',priority:1,volume:1},
  BOSS_REVEAL:{source:4,category:'BOSS',priority:5,volume:1,duckBgm:.25},
}}));
let audio:any;
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(async()=>{
  jest.useFakeTimers();jest.setSystemTime(100000);mockPlatform.OS='android';mockAppState.currentState='active';mockPlayers.length=0;mockAppState.addEventListener.mockClear();mockCreate.mockClear();mockActivate.mockClear();
  (globalThis as any).__DEV__=false;
  jest.resetModules();audio=require('../../../client/src/audio/AudioManager').audio;await audio.initialize();
});
afterEach(()=>{audio.dispose();jest.clearAllTimers();jest.useRealTimers();});
function state(next:string){mockAppState.currentState=next;(mockAppState.addEventListener.mock.calls as any)[0][1](next);}
test('critical effect ducks the music and restores it instead of retiring it',async()=>{
  audio.playBGM();await flush();const bgm=mockPlayers.at(-1);
  audio.play('BOSS_REVEAL');await flush();jest.advanceTimersByTime(400);
  expect(bgm.playing).toBe(true);expect(bgm.remove).not.toHaveBeenCalled();
  mockPlayers.at(-1).finish();jest.advanceTimersByTime(650);expect(bgm.volume).toBe(1);
});

test('arranging cards stays audible during a critical cue and recovers a stalled activation',async()=>{
  audio.play('BOSS_REVEAL');await flush();
  mockActivate.mockImplementationOnce(()=>new Promise<void>(()=>{}));
  expect(audio.play('CARD_SELECT')).toBe(true);await flush();
  const stale=mockPlayers.at(-1);
  audio.prepareArrangement();
  expect(audio.play('CARD_MOVE')).toBe(true);await flush();
  expect(stale.remove).not.toHaveBeenCalled();
  expect(mockPlayers.at(-1).playing).toBe(true);
  audio.mute();audio.prepareArrangement();
  expect(audio.play('CARD_SELECT')).toBe(false);
});

test('a stalled audio session cannot silence subsequent games indefinitely',async()=>{
  mockActivate.mockImplementationOnce(()=>new Promise<void>(()=>{}));
  audio.play('BOSS_REVEAL');await flush();
  // Session activation currently has a five-second timeout (Metro buffering).
  jest.advanceTimersByTime(5100);await flush();
  expect(audio.getDebugState().activeAudio).toEqual([]);
  expect(audio.play('BUTTON_CONFIRM')).toBe(true);await flush();
  expect(audio.getDebugState().players.find((p:any)=>p.event==='BUTTON_CONFIRM').playing).toBe(true);
});

test('a user gesture recovers pending SFX even on a table with no BGM',async()=>{
  audio.play('BUTTON_CONFIRM');await flush();const p=mockPlayers[0];
  p.playing=false;p.currentTime=0;
  audio.recoverOnInteraction();
  expect(p.playing).toBe(true);
});

test('web SFX starts inside the gesture without waiting for a native activation promise',()=>{
  mockPlatform.OS='web';mockActivate.mockClear();
  audio.play('BUTTON_CONFIRM');
  expect(mockPlayers[0].playing).toBe(true);
  expect(mockActivate).not.toHaveBeenCalled();
});
test('one-shot completion callback fires once after the sound finishes',async()=>{
  const complete=jest.fn();
  expect(audio.play('BUTTON_CONFIRM',{onComplete:complete})).toBe(true);await flush();
  mockPlayers[0].finish();mockPlayers[0].finish();
  expect(complete).toHaveBeenCalledTimes(1);
});
test('unmuting restores the current screen music without another navigation',async()=>{
  audio.playBGM();await flush();audio.mute();audio.unmute();await flush();
  expect(audio.getDebugState().currentBGM).toBe('LOBBY_BGM');expect(mockPlayers.at(-1).playing).toBe(true);
});
test('changing screens while muted remembers only the new screen music',async()=>{
  audio.playBGM();await flush();audio.mute();audio.playBGM('PROFILE_BGM');audio.unmute();await flush();
  expect(audio.getDebugState().currentBGM).toBe('PROFILE_BGM');
});
test('background cancels pending effects and only restores intended music',async()=>{
  audio.playBGM();await flush();audio.play('BUTTON_CONFIRM');state('background');await flush();
  expect(mockPlayers.filter(p=>p.playing)).toHaveLength(0);
  state('active');await flush();expect(audio.getDebugState().activeAudio).toEqual(['LOBBY_BGM']);
});
test('an explicit stop while backgrounded prevents stale music on return',async()=>{
  audio.playBGM();await flush();state('background');jest.advanceTimersByTime(200);audio.stopBGM();state('active');await flush();
  expect(audio.getDebugState().currentBGM).toBeNull();
});
test('a muted game stays silent across rapid foreground transitions',async()=>{
  audio.playBGM();await flush();state('background');state('active');audio.mute();await flush();
  expect(mockPlayers.filter(p=>p.playing)).toHaveLength(0);
});
test('a paused loop recovers without an AppState notification',async()=>{
  audio.playBGM();await flush();const bgm=mockPlayers.at(-1);bgm.playing=false;
  jest.advanceTimersByTime(2100);await flush();expect(bgm.playing).toBe(true);
});
test('a failed player is evicted even if its pause operation throws',async()=>{
  audio.play('BUTTON_CONFIRM');await flush();const button=mockPlayers[0];
  button.pause.mockImplementation(()=>{throw new Error('native released');});button.finish();
  jest.advanceTimersByTime(100);audio.play('BUTTON_CONFIRM');await flush();expect(mockPlayers.at(-1)).not.toBe(button);
  expect(mockPlayers.at(-1).playing).toBe(true);
});
test('loaded music can start while a critical cue is playing',async()=>{
  audio.play('BOSS_REVEAL');await flush();audio.playBGM('PROFILE_BGM');await flush();
  expect(audio.getDebugState().currentBGM).toBe('PROFILE_BGM');
});
test('100 rapid replay/finish cycles release every retired effect',async()=>{
  for(let i=0;i<100;i++){
    audio.play('BUTTON_CONFIRM');await flush();const p=mockPlayers.at(-1);p.finish();jest.advanceTimersByTime(100);
  }
  expect(audio.getDebugState().activeAudio).toEqual([]);
  expect(mockPlayers.filter(p=>p.remove.mock.calls.length===0)).toHaveLength(1);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockPlayers[0].seekTo).toHaveBeenCalledTimes(100);
});
test('slow preference loading cannot undo a mute made during startup',async()=>{
  audio.dispose();let resolveSettings:(v:any)=>void=()=>{};
  mockLoadSettings.mockImplementationOnce(()=>new Promise(resolve=>{resolveSettings=resolve;}));
  const init=audio.initialize();audio.mute();
  resolveSettings({muted:false,master:1,categories:{BGM:1,UI:1}});await init;
  expect(audio.getSettings().muted).toBe(true);
});
test('disposing during startup does not register a stale lifecycle listener',async()=>{
  audio.dispose();mockAppState.addEventListener.mockClear();let resolveSettings:(v:any)=>void=()=>{};
  mockLoadSettings.mockImplementationOnce(()=>new Promise(resolve=>{resolveSettings=resolve;}));
  const init=audio.initialize();audio.dispose();
  resolveSettings({muted:false,master:1,categories:{BGM:1,UI:1}});await init;
  expect(mockAppState.addEventListener).not.toHaveBeenCalled();
});
test('late blur from the previous screen cannot silence the new screen using the same track',async()=>{
  const oldScreen=audio.acquireBGM('LOBBY_BGM');await flush();
  const newScreen=audio.acquireBGM('LOBBY_BGM');await flush();oldScreen();
  jest.advanceTimersByTime(1000);await flush();expect(audio.getDebugState().currentBGM).toBe('LOBBY_BGM');
  newScreen();jest.advanceTimersByTime(1000);expect(audio.getDebugState().currentBGM).toBeNull();
});
