import { GameRoom, isValidRoomPin, toPublicRoom } from '../../src/game/roomRegistry'

describe('private multiplayer PIN validation', () => {
  test.each(['0000', '0123', '9999'])('accepts exactly four numeric digits: %s', pin => {
    expect(isValidRoomPin(pin)).toBe(true)
  })

  test.each(['', '123', '12345', '12a4', '12 4', undefined])('rejects invalid PIN: %s', pin => {
    expect(isValidRoomPin(pin)).toBe(false)
  })

  test('never exposes the PIN in a client room payload', () => {
    const room = {
      roomId: 'private-1', tier: 'adept', seats: [
        { type: 'empty', name: '', joinedAt: 0 }, { type: 'empty', name: '', joinedAt: 0 },
        { type: 'empty', name: '', joinedAt: 0 }, { type: 'empty', name: '', joinedAt: 0 },
      ], createdAt: 1, timeoutAt: null, status: 'waiting', isPrivate: true, pin: '0123',
    } as GameRoom
    expect(toPublicRoom(room)).not.toHaveProperty('pin')
  })
})
