import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function AuthCallback() {
  const { session, isLoading } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!isLoading && session) {
      navigate('/', { replace: true })
    }
  }, [session, isLoading, navigate])

  // Redirect to login after 10 seconds if auth doesn't complete
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!session) {
        setTimedOut(true)
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [session])

  if (timedOut) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500">Sign-in failed or timed out.</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-navy border-t-transparent" />
        <p className="mt-4 text-sm text-gray-500">Completing sign-in...</p>
      </div>
    </div>
  )
}
