import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './components/auth/LoginPage'
import AuthCallback from './components/auth/AuthCallback'
import ProtectedRoute from './components/auth/ProtectedRoute'
import OfficerRoute from './components/auth/OfficerRoute'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './components/dashboard/DashboardPage'
import MeetingsPage from './pages/MeetingsPage'
import MeetingForm from './pages/MeetingForm'
import MeetingDetailPage from './pages/MeetingDetailPage'
import CommitteesPage from './pages/CommitteesPage'
import DocumentsPage from './pages/DocumentsPage'
import ActionItemsPage from './pages/ActionItemsPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import AnnouncementForm from './pages/AnnouncementForm'
import BoardResourcesPage from './pages/BoardResourcesPage'
import DirectoryPage from './pages/DirectoryPage'
import AdminPage from './pages/AdminPage'
import MessagesPage from './pages/MessagesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected routes with sidebar layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="meetings/new" element={<MeetingForm />} />
            <Route path="meetings/:id" element={<MeetingDetailPage />} />
            <Route path="meetings/:id/edit" element={<MeetingForm />} />
            <Route path="committees" element={<CommitteesPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="action-items" element={<ActionItemsPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="announcements/new" element={<AnnouncementForm />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="resources" element={<BoardResourcesPage />} />
            <Route path="directory" element={<DirectoryPage />} />

            {/* Officers only */}
            <Route element={<OfficerRoute />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
