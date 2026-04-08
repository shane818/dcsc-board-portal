import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

export function useProfiles() {
  const [data, setData] = useState<Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]) ?? [])
        setIsLoading(false)
      })
  }, [])

  return { data, isLoading, error }
}
