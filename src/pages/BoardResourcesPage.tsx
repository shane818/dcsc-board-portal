import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DriveViewer from '../components/DriveViewer'
import type { BoardResource } from '../types/database'

export default function BoardResourcesPage() {
  const { profile, isOfficer } = useAuth()
  const [resources, setResources] = useState<BoardResource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  // Add/edit form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [category, setCategory] = useState('General')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    setIsLoading(true)
    supabase
      .from('board_resources')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('title')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setResources((data as BoardResource[]) ?? [])
        setIsLoading(false)
      })
  }, [refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  // Group resources by category
  const grouped = resources.reduce<Record<string, BoardResource[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  function startEdit(resource: BoardResource) {
    setEditingId(resource.id)
    setTitle(resource.title)
    setDescription(resource.description ?? '')
    setDriveUrl(resource.drive_url)
    setCategory(resource.category)
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setDescription('')
    setDriveUrl('')
    setCategory('General')
    setShowForm(false)
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !driveUrl.trim()) return
    setSaving(true)
    setFormError(null)

    if (editingId) {
      const { error } = await supabase
        .from('board_resources')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          drive_url: driveUrl.trim(),
          category: category.trim(),
        })
        .eq('id', editingId)
      if (error) setFormError(error.message)
      else { resetForm(); refetch() }
    } else {
      const { error } = await supabase
        .from('board_resources')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          drive_url: driveUrl.trim(),
          category: category.trim(),
          created_by: profile?.id,
        })
      if (error) setFormError(error.message)
      else { resetForm(); refetch() }
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}" from board resources?`)) return
    await supabase.from('board_resources').delete().eq('id', id)
    refetch()
  }

  const CATEGORY_OPTIONS = ['General', 'Governance', 'Orientation', 'Financial', 'Policies']
  // Also include any custom categories already in use
  const existingCategories = [...new Set(resources.map((r) => r.category))]
  const allCategories = [...new Set([...CATEGORY_OPTIONS, ...existingCategories])].sort()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Board Resources</h1>
          <p className="mt-1 text-sm text-gray-500">
            Reference documents, bylaws, orientation materials, and key files.
          </p>
        </div>
        {isOfficer && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark"
          >
            {showForm && !editingId ? 'Cancel' : 'Add Resource'}
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 max-w-lg space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {editingId ? 'Edit Resource' : 'Add Resource'}
          </h3>

          {formError && (
            <div className="text-sm text-red-600">{formError}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Current Bylaws"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description (optional)"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Google Drive Link</label>
            <input
              type="url"
              required
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
            <p className="mt-1 text-xs text-gray-400">
              Paste the full Google Drive sharing link for the file.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Resource'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="border border-gray-300 bg-white rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Resource List */}
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading resources...</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-400">
          No board resources yet. {isOfficer ? 'Click "Add Resource" to get started.' : 'Check back later.'}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
                {cat}
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                {items.map((resource) => (
                  <div key={resource.id} className="flex items-center justify-between px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => setViewerFile({ url: resource.drive_url, title: resource.title })}
                        className="text-sm font-medium text-navy hover:text-navy-dark hover:underline text-left"
                      >
                        {resource.title}
                      </button>
                      {resource.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{resource.description}</p>
                      )}
                    </div>

                    {isOfficer && (
                      <div className="flex gap-2 ml-4 shrink-0">
                        <button
                          onClick={() => startEdit(resource)}
                          className="border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(resource.id, resource.title)}
                          className="border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
