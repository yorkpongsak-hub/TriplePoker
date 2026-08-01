import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

export function useTableSkins() {
  const token = useAuthStore(s => s.session?.access_token ?? null)
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none')
  const [unlockedSkins, setUnlockedSkins] = useState<number[]>([])
  const [activeSkin, setActiveSkin] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!token || !isVip) {
      setUnlockedSkins([]); setActiveSkin(0); setLoading(false); return
    }
    setLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/profile/table-skins`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUnlockedSkins(data.unlockedSkins ?? [])
      setActiveSkin(data.activeSkin ?? 0)
    } catch (err) {
      console.error('[TABLE_SKINS] Load failed:', err)
      setUnlockedSkins([]); setActiveSkin(0)
    } finally { setLoading(false) }
  }, [token, isVip])

  useEffect(() => { reload() }, [reload])

  const selectSkin = useCallback(async (skinId: number) => {
    if (!token || !unlockedSkins.includes(skinId)) return false
    const res = await fetch(`${SERVER_URL}/profile/table-skins/select`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinId }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setActiveSkin(data.activeSkin)
    setUnlockedSkins(data.unlockedSkins ?? unlockedSkins)
    return true
  }, [token, unlockedSkins])

  return { unlockedSkins, activeSkin, loading, selectSkin, reload }
}
