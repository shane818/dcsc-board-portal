import { useEffect } from 'react'

interface DriveViewerProps {
  /** The Google Drive file URL (any format — sharing link, webViewLink, etc.) */
  url: string
  /** Display title shown in the viewer header */
  title?: string
  /** Called when the viewer is closed */
  onClose: () => void
}

/**
 * Extracts a Google Drive file ID from various URL formats:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - https://docs.google.com/document/d/FILE_ID/edit
 * - https://docs.google.com/spreadsheets/d/FILE_ID/edit
 * - https://docs.google.com/presentation/d/FILE_ID/edit
 * - Just a raw file ID string
 */
function extractFileId(url: string): string | null {
  // Already a raw ID (no slashes, no dots besides in domain)
  if (/^[a-zA-Z0-9_-]+$/.test(url)) return url

  // /d/FILE_ID/ pattern (covers file, document, spreadsheet, presentation)
  const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (dMatch) return dMatch[1]

  // ?id=FILE_ID pattern
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idMatch) return idMatch[1]

  // /folders/FOLDER_ID pattern
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) return folderMatch[1]

  return null
}

function getPreviewUrl(url: string): string {
  const fileId = extractFileId(url)
  if (!fileId) return url

  // Google Drive preview URL — works for all file types Google can preview
  return `https://drive.google.com/file/d/${fileId}/preview`
}

export default function DriveViewer({ url, title, onClose }: DriveViewerProps) {
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll while viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const previewUrl = getPreviewUrl(url)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      {/* Header */}
      <div
        className="flex items-center justify-between bg-white px-6 py-3 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {title ?? 'Document Viewer'}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Open in Drive
          </a>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1 p-1 sm:p-4" onClick={(e) => e.stopPropagation()}>
        <iframe
          src={previewUrl}
          className="h-full w-full rounded-lg bg-white"
          allow="autoplay"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          title={title ?? 'Document preview'}
        />
      </div>
    </div>
  )
}
