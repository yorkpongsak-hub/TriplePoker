import type { Socket } from 'socket.io'

// ตรวจผู้ใช้ก่อนเข้าห้องและก่อนเรียก handler ของ Tier D ทุกตัว
export function tierDOwnerRegistrar(socket: Pick<Socket,'on'|'emit'|'handshake'>, verify: (token:string)=>Promise<string|undefined>) {
  let identity: Promise<string|undefined> | undefined
  return (event:string,handler:(...args:any[])=>unknown)=>{
    socket.on(event,async(data:any,ack?:any)=>{
      identity??=verify(socket.handshake.auth?.accessToken??'').catch(()=>undefined)
      const owner=await identity
      if(!owner||data?.playerId!==owner||data?.roomId!==`tier-d-${owner}`){
        if(typeof ack==='function')ack(false)
        socket.emit('tier_d_error',{message:'Unauthorized Tier D session. Please sign in again.'});return
      }
      try{await handler(data,ack)}catch{
        if(typeof ack==='function')ack(false)
        socket.emit('tier_d_error',{message:'Tier D action failed.'})
      }
    })
  }
}
