import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DriveViewer from '../components/DriveViewer'
import type { BoardResource } from '../types/database'

type FormMode = 'document' | 'folder'

export default function BoardResourcesPage() {
  const { profile, isOfficer } = useAuth()
  const [resources, setResources] = useState<BoardResource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  // Navigation: which folder we're inside (null = root)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Add/edit form state
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('document')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [category, setCategory] = useState('General')
  const [parentId, setParentId] = useState<string | null>(null)
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

  // All folders (for parent picker and breadcrumb)
  const allFolders = resources.filter((r) => r.is_folder)

  // Items at current level
  const currentItems = resources.filter((r) => r.parent_id === currentFolderId)

  // Group current items by category
  const grouped = currentItems.reduce<Record<string, BoardResource[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  // Breadcrumb trail
  function buildBreadcrumb(): { id: string | null; title: string }[] {
    const trail: { id: string | null; title: string }[] = [{ id: null, title: 'All Resources' }]
    let folderId = currentFolderId
    const visited = new Set<string>()
    while (folderId) {
      if (visited.has(folderId)) break
      visited.add(folderId)
      const folder = resources.find((r) => r.id === folderId)
      if (!folder) break
      trail.push({ id: folder.id, title: folder.title })
      folderId = folder.parent_id
    }
    // Reverse so root is first (we built it child→parent)
    return [trail[0], ...trail.slice(1).reverse()]
  }

  const breadcrumb = buildBreadcrumb()

  function startEdit(resource: BoardResource) {
    setEditingId(resource.id)
    setFormMode(resource.is_folder ? 'folder' : 'document')
    setTitle(resource.title)
    setDescription(resource.description ?? '')
    setDriveUrl(resource.drive_url ?? '')
    setCategory(resource.category)
    setParentId(resource.parent_id)
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setFormMode('document')
    setTitle('')
    setDescription('')
    setDriveUrl('')
    setCategory('General')
    setParentId(currentFolderId)
    setShowForm(false)
    setFormError(null)
  }

  function openAddForm(mode: FormMode) {
    resetForm()
    setFormMode(mode)
    setParentId(currentFolderId)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (formMode === 'document' && !driveUrl.trim()) return
    setSaving(true)
    setFormError(null)

    const record = {
      title: title.trim(),
      description: description.trim() || null,
      drive_url: formMode === 'folder' ? null : driveUrl.trim(),
      category: category.trim(),
      is_folder: formMode === 'folder',
      parent_id: parentId,
    }

    if (editingId) {
      const { error } = await supabase
        .from('board_resources')
        .update(record)
        .eq('id', editingId)
      if (error) setFormError(error.message)
      else { resetForm(); refetch() }
    } else {
      const { error } = await supabase
        .from('board_resources')
        .insert({ ...record, created_by: profile?.id })
      if (error) setFormError(error.message)
      else { resetForm(); refetch() }
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string, isFolder: boolean) {
    const childCount = resources.filter((r) => r.parent_id === id).length
    const msg = isFolder && childCount > 0
      ? `Delete folder "${name}" and move its ${childCount} item(s) out? Items will not be deleted.`
      : `Delete "${name}" from board resources?`
    if (!window.confirm(msg)) return

    // If deleting a folder, move children to the folder's parent (un-nest them)
    if (isFolder && childCount > 0) {
      const folder = resources.find((r) => r.id === id)
      await supabase
        .from('board_resources')
        .update({ parent_id: folder?.parent_id ?? null })
        .eq('parent_id', id)
    }

    await supabase.from('board_resources').delete().eq('id', id)
    refetch()
  }

  const CATEGORY_OPTIONS = ['General', 'Governance', 'Orientation', 'Financial', 'Policies']
  const existingCategories = [...new Set(resources.map((r) => r.category))]
  const allCategories = [...new Set([...CATEGORY_OPTIONS, ...existingCategories])].sort()

  // Available parent folders (exclude self and descendants when editing)
  function getAvailableFolders(): BoardResource[] {
    if (!editingId) return allFolders
    // Exclude self and any folder that is a descendant of editingId
    const descendants = new Set<string>()
    function collectDescendants(fid: string) {
      descendants.add(fid)
      for (const r of resources) {
        if (r.parent_id === fid && r.is_folder && !descendants.has(r.id)) {
          collectDescendants(r.id)
        }
      }
    }
    collectDescendants(editingId)
    return allFolders.filter((f) => !descendants.has(f.id))
  }

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
          <div className="flex gap-2">
            <button
              onClick={() => openAddForm('folder')}
              className="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              + Folder
            </button>
            <button
              onClick={() => openAddForm('document')}
              className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark"
            >
              + Document
            </button>
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      {currentFolderId && (
        <nav className="flex items-center gap-1 text-sm">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">/</span>}
              {i < breadcrumb.length - 1 ? (
                <button
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className="text-navy hover:text-navy-dark hover:underline"
                >
                  {crumb.title}
                </button>
              ) : (
                <span className="font-medium text-gray-700">{crumb.title}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 max-w-lg space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {editingId
              ? `Edit ${formMode === 'folder' ? 'Folder' : 'Document'}`
              : `Add ${formMode === 'folder' ? 'Folder' : 'Document'}`}
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
              placeholder={formMode === 'folder' ? 'e.g. Meeting Templates' : 'e.g. Current Bylaws'}
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

          {/* Drive URL — only for documents */}
          {formMode === 'document' && (
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
          )}

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

          {/* Parent folder picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="">Root (top level)</option>
              {getAvailableFolders().map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : formMode === 'folder' ? 'Create Folder' : 'Add Document'}
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
          {currentFolderId
            ? 'This folder is empty.'
            : `No board resources yet. ${isOfficer ? 'Click "+ Document" or "+ Folder" to get started.' : 'Check back later.'}`}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => {
            const folders = items.filter((r) => r.is_folder)
            const documents = items.filter((r) => !r.is_folder)

            return (
              <div key={cat}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
                  {cat}
                </h2>
                <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                  {/* Folders first */}
                  {folders.map((folder) => {
                    const childCount = resources.filter((r) => r.parent_id === folder.id).length
                    return (
                      <div key={folder.id} className="flex items-center justify-between px-6 py-4">
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => setCurrentFolderId(folder.id)}
                            className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-dark hover:underline text-left"
                          >
                            <span className="text-base">&#128193;</span>
                            {folder.title}
                            <span className="text-xs font-normal text-gray-400">
                              ({childCount} item{childCount !== 1 ? 's' : ''})
                            </span>
                          </button>
                          {folder.description && (
                            <p className="text-xs text-gray-500 mt-0.5 ml-7">{folder.description}</p>
                          )}
                        </div>

                        {isOfficer && (
                          <div className="flex gap-2 ml-4 shrink-0">
                            <button
                              onClick={() => startEdit(folder)}
                              className="border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(folder.id, folder.title, true)}
                              className="border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Documents */}
                  {documents.map((resource) => (
                    <div key={resource.id} className="flex items-center justify-between px-6 py-4">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => resource.drive_url && setViewerFile({ url: resource.drive_url, title: resource.title })}
                          className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-dark hover:underline text-left"
                        >
                          <span className="text-base">&#128196;</span>
                          {resource.title}
                        </button>
                        {resource.description && (
                          <p className="text-xs text-gray-500 mt-0.5 ml-7">{resource.description}</p>
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
                            onClick={() => handleDelete(resource.id, resource.title, false)}
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
            )
          })}
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
