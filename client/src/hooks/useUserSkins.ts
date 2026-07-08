import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseService'
import { useUserStore } from '../store/userStore'

interface UseUserSkinsReturn {
  unlocked: number[]
  active: number
  loading: boolean
}

export const useUserSkins = (): UseUserSkinsReturn => {
  const [unlocked, setUnlocked] = useState<number[]>([1])
  const [active, setActive] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const userId = useUserStore(state => state.userId)
  const setSkins = useUserStore(state => state.setSkins)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const fetchSkins = async () => {
      try {
        const { data, error } = await supabase
          .from('user_table_skins')
          .select('unlocked_skins, active_skin')
          .eq('user_id', userId)
          .single()

        if (error) throw error

        const unlockedSkins = data?.unlocked_skins ?? [1]
        const activeSkin = data?.active_skin ?? 1

        setUnlocked(unlockedSkins)
        setActive(activeSkin)
        setSkins(unlockedSkins, activeSkin)
      } catch (err) {
        // Fallback to default
        console.error('Error fetching skins:', err)
        setUnlocked([1])
        setActive(1)
        setSkins([1], 1)
      } finally {
        setLoading(false)
      }
    }

    fetchSkins()
  }, [userId, setSkins])

  return { unlocked, active, loading }
}
