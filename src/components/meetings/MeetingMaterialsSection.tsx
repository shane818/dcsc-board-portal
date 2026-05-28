import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import DriveViewer from '../DriveViewer'

interface MaterialEntry {
  id: string
  drive_file_id: string         // Used to store the Drive URL (we'll put the full URL here)
  filename: string              // Display label
  description: string | null
  uploaded_by: string
  uploader_name: string | null
  created_at: string
}

interface Props {
  meetingId: string
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MeetingMaterialsSection({ meetingId }: Props) {
  const { profile, isOfficer } = useAuth()
  const [materials, setMaterials] = useState<MaterialEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    setIsLoading(true)
    supabase
      .from('document_references')
      .select(`
        id, drive_file_id, filename, description, uploaded_by, created_at,
        uploader:profiles!uploaded_by(full_name)
      `)
      .eq('meeting_id', meetingId)
      .is('committee_id', null) // Board-meeting materials (no committee scope)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else {
          setMaterials(
            (data ?? []).map((r: any) => ({
              id: r.id,
              drive_file_id: r.drive_file_id,
              filename: r.filename,
              description: r.description,
              uploaded_by: r.uploaded_by,
              uploader_name: r.uploader?.full_name ?? null,
              created_at: r.created_at,
            }))
          )
        }
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  function resetForm() {
    setLabel('')
    setUrl('')
    setDescription('')
    setShowForm(false)
    setError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!label.trim() || !url.trim()) {
      setError('Label and URL are required.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('document_references').insert({
      meeting_id: meetingId,
      committee_id: null,
      drive_file_id: url.trim(), // Store the full URL here (table was designed for IDs but URL works fine)
      filename: label.trim(),
      mime_type: null,
      description: description.trim() || null,
      uploaded_by: profile.id,
    })
    if (err) setError(err.message)
    else {
      resetForm()
      refetch()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Remove "${name}" from this meeting's materials?`)) return
    const { error: err } = await supabase
      .from('document_references')
      .delete()
      .eq('id', id)
    if (err) setError(err.message)
    else refetch()
  }

  function canDelete(m: MaterialEntry): boolean {
    return isOfficer || m.uploaded_by === profile?.id
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Meeting Materials</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Pre-reads, financial reports, presentations, and other documents for this meeting.
            Anyone can add. Visible to all board members before, during, and after the meeting.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
          >
            + Add Material
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Label
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Q2 Financial Report"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Google Drive URL
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Description <span className="font-normal lowercase text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief note for the board"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : materials.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          No materials attached yet. {showForm ? '' : 'Click "+ Add Material" to share something with the board.'}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {materials.map((m) => (
            <li key={m.id} className="flex items-start justify-between py-3">
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => setViewerFile({ url: m.drive_file_id, title: m.filename })}
                  className="text-sm font-medium text-navy hover:text-navy-dark hover:underline text-left"
                >
                  📄 {m.filename}
                </button>
                {m.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Added by {m.uploader_name ?? 'Unknown'} · {formatRelative(m.created_at)}
                </p>
              </div>
              {canDelete(m) && (
                <button
                  onClick={() => handleDelete(m.id, m.filename)}
                  className="ml-3 text-xs text-gray-300 hover:text-red-500"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

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
