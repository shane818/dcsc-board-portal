import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DocumentReference } from '../types/database'

export function useDocumentReferences(committeeId: string | null) {
  const [data, setData] = useState<DocumentReference[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!committeeId) {
      setData([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    supabase
      .from('document_references')
      .select('*')
      .eq('committee_id', committeeId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as DocumentReference[]) ?? [])
        setIsLoading(false)
      })
  }, [committeeId])

  return { data, isLoading, error }
}
