// app/(tabs)/index.tsx
// Redirect root URL ไป Lobby (auth guard ใน (home) จะตรวจ session ต่อ)
import { Redirect } from 'expo-router'

export default function RootIndex() {
  return <Redirect href="/(home)/lobby" />
}
