import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCommittees } from '../hooks/useCommittees'
import { useAllCommittees } from '../hooks/useAllCommittees'
import { useDriveFiles } from '../hooks/useDriveFiles'
import { getDriveFileUrl } from '../lib/drive'
import DriveViewer from '../components/DriveViewer'
import type { DriveFile } from '../types/database'

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

function formatFileSize(bytes: string | undefined): string {
  if (!bytes) return ''
  const size = parseInt(bytes, 10)
  if (isNaN(size)) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DocumentsPage() {
  const { profile, session, isOfficer } = useAuth()
  const { data: memberships, isLoading: membershipsLoading } = useCommittees(profile?.id)
  const { data: allCommittees, isLoading: allCommitteesLoading } = useAllCommittees()

  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null)
  const { data: files, isLoading: filesLoading, error: filesError } = useDriveFiles(selectedCommitteeId)
  const [openingFileId, setOpeningFileId] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)

  // Officers see all active committees; members see only their own
  const committeesLoading = isOfficer ? allCommitteesLoading : membershipsLoading
  const committeeOptions = isOfficer
    ? allCommittees.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name, hasDrive: !!c.drive_folder_id }))
    : memberships.map((m) => ({ id: m.committee.id, name: m.committee.name, hasDrive: !!m.committee.drive_folder_id }))

  async function handleFileClick(file: DriveFile) {
    if (!selectedCommitteeId || !session?.access_token) return

    setOpeningFileId(file.id)
    setFileError(null)
    try {
      const result = await getDriveFileUrl(file.id, selectedCommitteeId, session.access_token)
      setViewerFile({ url: result.webViewLink, title: file.name })
    } catch (err) {
      setFileError(`Failed to open "${file.name}": ${(err as Error).message}`)
    } finally {
      setOpeningFileId(null)
    }
  }

  const selectedCommittee = committeeOptions.find((c) => c.id === selectedCommitteeId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse committee documents from Google Drive
        </p>
      </div>

      {/* Committee Selector */}
      <div className="max-w-xs">
        <label htmlFor="committee-select" className="block text-sm font-medium text-gray-700">
          Committee
        </label>
        <select
          id="committee-select"
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          value={selectedCommitteeId ?? ''}
          onChange={(e) => {
            setSelectedCommitteeId(e.target.value || null)
            setFileError(null)
          }}
          disabled={committeesLoading}
        >
          <option value="">Select a committee...</option>
          {committeeOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{!c.hasDrive ? ' (no folder linked)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* No Drive folder warning */}
      {selectedCommittee && !selectedCommittee.hasDrive && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          This committee doesn't have a Google Drive folder linked yet.
          {isOfficer && (
            <> Go to <a href="/admin" className="font-medium underline">Admin → Committees</a> to add a folder ID.</>
          )}
        </div>
      )}

      {/* File error banner */}
      {fileError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{fileError}</span>
          <button onClick={() => setFileError(null)} className="ml-4 font-medium hover:text-red-900">
            Dismiss
          </button>
        </div>
      )}

      {/* File List */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {!selectedCommitteeId ? (
          <div className="p-12 text-center text-sm text-gray-400">
            Select a committee to view its documents
          </div>
        ) : filesLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
            <span className="ml-3 text-sm text-gray-500">Loading files...</span>
          </div>
        ) : filesError ? (
          <div className="p-12 text-center text-sm text-red-500">
            {filesError}
          </div>
        ) : files.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {selectedCommittee?.hasDrive
              ? 'No documents found in this committee\'s Drive folder. Make sure the service account has been given access to the folder.'
              : 'No Drive folder linked for this committee.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Modified</th>
                <th className="px-6 py-3">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.map((file) => (
                <tr
                  key={file.id}
                  onClick={() => handleFileClick(file)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {file.iconLink && (
                        <img
                          src={file.iconLink}
                          alt=""
                          className="h-5 w-5"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {file.name}
                        {openingFileId === file.id && (
                          <span className="ml-2 text-xs text-gray-400">Opening...</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {getFileTypeLabel(file.mimeType)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(file.modifiedTime)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatFileSize(file.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewerFile && (
        <DriveViewer
          url={viewerFile.url}
          title={viewerFile.title}
          onClose={() => setViewerFile(null)}
        />
      )}
    </div>
  )
}
