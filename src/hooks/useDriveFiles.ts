import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listDriveFiles } from '../lib/drive'
import type { DriveFile } from '../types/database'

export function useDriveFiles(committeeId: string | null) {
  const { session } = useAuth()
  const [data, setData] = useState<DriveFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!committeeId || !session?.access_token) {
      setData([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    listDriveFiles(committeeId, session.access_token)
      .then((files) => {
        setData(files)
        setIsLoading(false)
      })
      .catch((err) => {
        setError((err as Error).message)
        setData([])
        setIsLoading(false)
      })
  }, [committeeId, session?.access_token])

  return { data, isLoading, error }
}
