import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAllCommittees } from '../hooks/useAllCommittees'
import { useCommitteeMembers } from '../hooks/useCommitteeMembers'
import { useDriveFiles } from '../hooks/useDriveFiles'
import { getDriveFileUrl } from '../lib/drive'
import DriveViewer from '../components/DriveViewer'
import type { CommitteeRole, DriveFile } from '../types/database'

type CommitteeTab = 'members' | 'documents'

const mimeTypeLabels: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.folder': 'Folder',
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
}

function getFileTypeLabel(mimeType: string): string {
  return mimeTypeLabels[mimeType] ?? mimeType.split('/').pop() ?? 'File'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function CommitteesPage() {
  const { isOfficer } = useAuth()
  const { data: committees, isLoading, error } = useAllCommittees()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, CommitteeTab>>({})

  const activeCommittees = committees.filter((c) => c.is_active)

  function getTab(committeeId: string): CommitteeTab {
    return activeTab[committeeId] ?? 'members'
  }

  function setTab(committeeId: string, tab: CommitteeTab) {
    setActiveTab((prev) => ({ ...prev, [committeeId]: tab }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Committees</h1>
          <p className="mt-1 text-sm text-gray-500">
            Board committees, members, and documents.
          </p>
        </div>
        {isOfficer && (
          <a
            href="/admin"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Manage in Admin
          </a>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading committees...</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : activeCommittees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-400">
          No committees have been created yet.
        </div>
      ) : (
        <div className="space-y-3">
          {activeCommittees.map((committee) => {
            const memberCount = committee.memberships?.[0]?.count ?? 0
            const isExpanded = expandedId === committee.id
            const tab = getTab(committee.id)

            return (
              <div key={committee.id} className="rounded-xl border border-gray-200 bg-white">
                <div
                  className="flex cursor-pointer items-center justify-between px-6 py-5 transition-colors hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : committee.id)}
                >
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{committee.name}</h3>
                    {committee.description && (
                      <p className="mt-0.5 text-sm text-gray-500">{committee.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      {memberCount} {memberCount === 1 ? 'member' : 'members'}
                    </span>
                    <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* Tab bar */}
                    <div className="flex border-b border-gray-100 px-6">
                      {(['members', 'documents'] as CommitteeTab[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(committee.id, t)}
                          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                            tab === t
                              ? 'border-navy text-navy'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    <div className="px-6 py-4">
                      {tab === 'members' ? (
                        <CommitteeMembersList committeeId={committee.id} />
                      ) : (
                        <CommitteeDocuments
                          committeeId={committee.id}
                          hasDriveFolder={!!committee.drive_folder_id}
                          isOfficer={isOfficer}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Members sub-component ----

function CommitteeMembersList({ committeeId }: { committeeId: string }) {
  const { data: members, isLoading } = useCommitteeMembers(committeeId)

  if (isLoading) return <p className="py-2 text-sm text-gray-500">Loading members...</p>
  if (members.length === 0) return <p className="py-2 text-sm text-gray-400">No members assigned yet.</p>

  const sorted = [...members].sort((a, b) => {
    if (a.role === 'chair' && b.role !== 'chair') return -1
    if (a.role !== 'chair' && b.role === 'chair') return 1
    return a.profile.full_name.localeCompare(b.profile.full_name)
  })

  const roleLabel: Record<CommitteeRole, string> = {
    chair: 'Chair', member: 'Member', ex_officio: 'Ex Officio',
  }
  const roleColors: Record<CommitteeRole, string> = {
    chair: 'bg-dcsc-red/10 text-dcsc-red',
    member: 'bg-gray-100 text-gray-600',
    ex_officio: 'bg-purple-50 text-purple-700',
  }

  return (
    <div className="space-y-2">
      {sorted.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-gray-900">{m.profile.full_name}</span>
            <span className="block truncate text-xs text-gray-400">{m.profile.email}</span>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[m.role]}`}>
            {roleLabel[m.role]}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---- Documents sub-component ----

function CommitteeDocuments({
  committeeId,
  hasDriveFolder,
  isOfficer,
}: {
  committeeId: string
  hasDriveFolder: boolean
  isOfficer: boolean
}) {
  const { session } = useAuth()
  const { data: files, isLoading, error } = useDriveFiles(committeeId)
  const [openingFileId, setOpeningFileId] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)

  async function handleFileClick(file: DriveFile) {
    if (!session?.access_token) return
    setOpeningFileId(file.id)
    setFileError(null)
    try {
      const result = await getDriveFileUrl(file.id, committeeId, session.access_token)
      setViewerFile({ url: result.webViewLink, title: file.name })
    } catch (err) {
      setFileError(`Failed to open "${file.name}": ${(err as Error).message}`)
    } finally {
      setOpeningFileId(null)
    }
  }

  if (!hasDriveFolder) {
    return (
      <p className="py-2 text-sm text-gray-400">
        No Google Drive folder linked for this committee.
        {isOfficer && (
          <> <a href="/admin" className="text-navy underline hover:text-navy-dark">Add one in Admin →</a></>
        )}
      </p>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        <span className="text-sm text-gray-500">Loading files...</span>
      </div>
    )
  }

  if (error) return <p className="py-2 text-sm text-red-500">{error}</p>

  if (files.length === 0) {
    return (
      <p className="py-2 text-sm text-gray-400">
        No files found. Make sure the service account has access to this folder.
      </p>
    )
  }

  return (
    <>
      {fileError && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{fileError}</span>
          <button onClick={() => setFileError(null)} className="ml-3 font-medium hover:text-red-900">✕</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2">Modified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {files.map((file) => (
              <tr
                key={file.id}
                onClick={() => handleFileClick(file)}
                className="cursor-pointer transition-colors hover:bg-gray-50"
              >
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {file.iconLink && (
                      <img src={file.iconLink} alt="" className="h-4 w-4 shrink-0" referrerPolicy="no-referrer" />
                    )}
                    <span className="font-medium text-gray-900">
                      {file.name}
                      {openingFileId === file.id && (
                        <span className="ml-2 text-xs text-gray-400">Opening...</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {getFileTypeLabel(file.mimeType)}
                  </span>
                </td>
                <td className="py-2 text-gray-500">{formatDate(file.modifiedTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewerFile && (
        <DriveViewer
          url={viewerFile.url}
          title={viewerFile.title}
          onClose={() => setViewerFile(null)}
        />
      )}
    </>
  )
}
