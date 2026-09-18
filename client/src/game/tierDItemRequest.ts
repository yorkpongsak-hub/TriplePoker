export type TierDItemRequest = {
  roomId: string; playerId: string; item: 'shuffle'|'swap'|'double_pile'|'freeze'|'auto_sort'|'undo'
  gameId: string; matchNumber: number; dealRevision: number; requestId: string
  selectedCardKey?: string; selectedPile?: 1|2|3
}
type ItemSocket = { timeout(ms: number): { emit(event: string, payload: TierDItemRequest, ack: (error: Error|null, ok?: boolean)=>void): unknown } }

// Retry ส่ง action เดิม เพื่อไม่หัก Auto Sort ซ้ำเมื่อ ACK สูญหาย
export function sendTierDItemRequest(socket: ItemSocket, payload: TierDItemRequest): Promise<boolean> {
  return new Promise((resolve,reject)=>{
    const send=(attempt:number)=>socket.timeout(10000).emit('tier_d_item_use',payload,(error,ok)=>{
      if(error){if(attempt===0)send(1);else reject(error);return}
      resolve(ok===true)
    })
    send(0)
  })
}
