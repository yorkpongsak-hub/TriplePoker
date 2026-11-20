import { matchesPublicRoomLane, type GameRoom } from '../../src/game/roomRegistry'

const room=(missionsEnabled?:boolean):GameRoom=>({
  roomId:'room',tier:'adept',seats:[],createdAt:1,timeoutAt:null,status:'waiting',
  isPrivate:false,missionsEnabled,liveMode:'STANDARD',
})

describe('multiplayer Mission preference lanes',()=>{
  test('public players match only rooms with the same Mission choice',()=>{
    expect(matchesPublicRoomLane(room(true),'adept','STANDARD',true)).toBe(true)
    expect(matchesPublicRoomLane(room(true),'adept','STANDARD',false)).toBe(false)
    expect(matchesPublicRoomLane(room(false),'adept','STANDARD',false)).toBe(true)
    expect(matchesPublicRoomLane(room(false),'adept','STANDARD',true)).toBe(false)
  })

  test('legacy rooms remain in the Missions-on lane and private rooms never enter public matching',()=>{
    expect(matchesPublicRoomLane(room(undefined),'adept','STANDARD',true)).toBe(true)
    expect(matchesPublicRoomLane({...room(true),isPrivate:true},'adept','STANDARD',true)).toBe(false)
  })

  test('live and tier boundaries remain independent from Mission preference',()=>{
    expect(matchesPublicRoomLane(room(true),'adept','LIVE',true)).toBe(false)
    expect(matchesPublicRoomLane(room(true),'highNoble','STANDARD',true)).toBe(false)
  })
})
