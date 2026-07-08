import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import GameTable from '../screens/GameTable'
import GameTable1 from '../screens/GameTable1'
import GameTableLive from '../screens/GameTableLive'

export type RootStackParamList = {
  GameTable: { roomId: string; tier: string }
  GameTable1: undefined
  GameTableLive: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="GameTable" component={GameTable} />
        <Stack.Screen name="GameTable1" component={GameTable1} options={{ headerShown: false }} />
        <Stack.Screen name="GameTableLive" component={GameTableLive} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
