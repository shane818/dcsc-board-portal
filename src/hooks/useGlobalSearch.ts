import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface SearchResults {
  people: { id: string; full_name: string; email: string; role: string }[]
  meetings: { id: string; title: string; meeting_date: string; status: string }[]
  actionItems: { id: string; title: string; status: string; due_date: string | null }[]
  announcements: { id: string; title: string; published_at: string }[]
  committees: { id: string; name: string }[]
}

const EMPTY: SearchResults = {
  people: [],
  meetings: [],
  actionItems: [],
  announcements: [],
  committees: [],
}

export function useGlobalSearch(query: string) {
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (query.length < 2) {
      setResults(EMPTY)
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    const timer = setTimeout(async () => {
      const q = query.trim()

      const [people, meetings, actionItems, announcements, committees] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('is_active', true)
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(4),

        supabase
          .from('meetings')
          .select('id, title, meeting_date, status')
          .ilike('title', `%${q}%`)
          .limit(4),

        supabase
          .from('action_items')
          .select('id, title, status, due_date')
          .ilike('title', `%${q}%`)
          .limit(4),

        supabase
          .from('announcements')
          .select('id, title, published_at')
          .ilike('title', `%${q}%`)
          .limit(4),

        supabase
          .from('committees')
          .select('id, name')
          .eq('is_active', true)
          .ilike('name', `%${q}%`)
          .limit(4),
      ])

      setResults({
        people: (people.data ?? []) as SearchResults['people'],
        meetings: (meetings.data ?? []) as SearchResults['meetings'],
        actionItems: (actionItems.data ?? []) as SearchResults['actionItems'],
        announcements: (announcements.data ?? []) as SearchResults['announcements'],
        committees: (committees.data ?? []) as SearchResults['committees'],
      })
      setIsLoading(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return { results, isLoading }
}
