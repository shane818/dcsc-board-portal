import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AnnouncementWithAuthor } from '../types/database'

export function useAnnouncements(limit = 5) {
  const [data, setData] = useState<AnnouncementWithAuthor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('announcements')
      .select('*, author:profiles(full_name, avatar_url)')
      .order('published_at', { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as AnnouncementWithAuthor[]) ?? [])
        setIsLoading(false)
      })
  }, [limit])

  return { data, isLoading, error }
}

export function useAllAnnouncements() {
  const [data, setData] = useState<AnnouncementWithAuthor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    supabase
      .from('announcements')
      .select('*, author:profiles(full_name, avatar_url)')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as AnnouncementWithAuthor[]) ?? [])
        setIsLoading(false)
      })
  }, [refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
