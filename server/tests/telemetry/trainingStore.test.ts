const mockMemory=new Map<string,string>()
const mockStart=jest.fn(()=>({gameId:'00000000-0000-4000-8000-000000000010',startedAt:1000}))
const mockEnd=jest.fn()
jest.mock('../../../client/node_modules/@react-native-async-storage/async-storage',()=>({__esModule:true,default:{getItem:async(key:string)=>mockMemory.get(key)??null,setItem:async(key:string,value:string)=>{mockMemory.set(key,value)},removeItem:async(key:string)=>{mockMemory.delete(key)}}}))
jest.mock('../../../client/src/telemetry/launch',()=>({launchTelemetry:{trainingStart:mockStart,trainingEnd:mockEnd}}))
// Load the real store at runtime without pulling Expo/RN ambient globals into
// the server Jest compiler's shared TypeScript program.
const { useLaunchStore } = require('../../../client/src/launch/store')
import { EMPTY_PROGRESS } from '../../../client/src/launch/progress'
import type { Match } from '../../../client/src/launch/engine'
const match:Match={version:1,id:'duel-existing-id',seed:1,hands:[{cards:[],community:[[],[],[]],rival:[[],[],[]],starter:[[],[],[]],rivalSeal:null}],results:Array.from({length:3},()=>({piles:[[],[],[]],seal:null,points:[[1,0],[1,0],[1,0]],scores:[3,0],sealWon:false}))}
test('actual launch-store result transition emits once, preserves score/progress, and review/rehydration never emits game_end',async()=>{
  await new Promise(done=>setTimeout(done,20));useLaunchStore.setState({progress:{...EMPTY_PROGRESS},active:null})
  useLaunchStore.getState().start(match)
  expect(mockStart).toHaveBeenCalledWith(0)
  const active=useLaunchStore.getState().active!;useLaunchStore.setState({active:{...active,phase:'reveal',revealed:3}})
  useLaunchStore.getState().advance();for(let i=0;i<4;i++)useLaunchStore.getState().advance()
  expect(mockEnd).toHaveBeenCalledTimes(1);expect(mockEnd).toHaveBeenCalledWith(active.telemetryTrace,9,0,0)
  expect(useLaunchStore.getState().progress.matches).toBe(1);expect(useLaunchStore.getState().active?.phase).toBe('result')
  await new Promise(done=>setTimeout(done,20));await useLaunchStore.persist.rehydrate();useLaunchStore.getState().advance()
  expect(mockEnd).toHaveBeenCalledTimes(1);expect(useLaunchStore.getState().progress.matches).toBe(1)
})
