/**
 * FogOfWar.tsx — Mastermind Phase Component (placeholder)
 * รอเติม logic จริงใน Patch ถัดไปตามลำดับ Sprint 7C
 * The Sage Unicorn Studio Co., Ltd.
 */
import React from 'react'
import { View, Text } from 'react-native'

interface FogOfWarProps {
  // TODO: เติม props ที่ต้องใช้จริง (เช่น socket, tokenBalance, onPhaseComplete) ตอนเขียน logic
  onPhaseComplete?: () => void
}

const FogOfWar: React.FC<FogOfWarProps> = (props) => {
  return (
    <View style={{ padding: 20, alignItems: 'center' }}>
      <Text style={{ color: '#FFD76A', fontSize: 14 }}>
        [PLACEHOLDER] FogOfWar — รอเขียน logic จริง
      </Text>
    </View>
  )
}

export default FogOfWar
