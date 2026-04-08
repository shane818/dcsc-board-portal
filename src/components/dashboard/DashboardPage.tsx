import { useAuth } from '../../context/AuthContext'
import MyCommittees from './MyCommittees'
import UpcomingMeetings from './UpcomingMeetings'
import MyActionItems from './MyActionItems'
import RecentAnnouncements from './RecentAnnouncements'

export default function DashboardPage() {
  const { profile } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {profile?.full_name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's what's happening across your committees
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingMeetings />
        <MyActionItems />
        <MyCommittees />
        <RecentAnnouncements />
      </div>
    </div>
  )
}
