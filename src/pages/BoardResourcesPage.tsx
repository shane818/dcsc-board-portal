import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DriveViewer from '../components/DriveViewer'
import ActionItemForm from '../components/ActionItemForm'
import type { BoardResource, ResourceActionTag } from '../types/database'

type FormMode = 'document' | 'folder'

const TAG_META: Record<ResourceActionTag, { label: string; cls: string }> = {
  to_do: { label: 'To Do', cls: 'bg-blue-100 text-blue-800' },
  to_review: { label: 'To Review', cls: 'bg-amber-100 text-amber-800' },
  to_vote: { label: 'To Vote', cls: 'bg-purple-100 text-purple-800' },
}

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
  const [actionTag, setActionTag] = useState<ResourceActionTag | ''>('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)

  // Action-tag filter
  const [tagFilter, setTagFilter] = useState<ResourceActionTag | 'all'>('all')
  // Create-action modal: the resource being turned into an action item
  const [actionForResource, setActionForResource] = useState<BoardResource | null>(null)
  // resource ids that already have an action item created from them
  const [resourcesWithActions, setResourcesWithActions] = useState<Set<string>>(new Set())
  const [needsVoteOpen, setNeedsVoteOpen] = useState(true)

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
    // Which resources already have an action item created from them
    supabase
      .from('action_items')
      .select('source_resource_id')
      .not('source_resource_id', 'is', null)
      .then(({ data }) => {
        if (data) setResourcesWithActions(new Set(data.map((r: any) => r.source_resource_id)))
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
    setActionTag(resource.action_tag ?? '')
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
    setActionTag('')
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
      action_tag: formMode === 'folder' ? null : (actionTag || null),
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

      {/* Needs a Vote panel (documents tagged To Vote, across all folders) */}
      {(() => {
        const toVote = resources.filter((r) => !r.is_folder && r.action_tag === 'to_vote')
        if (toVote.length === 0) return null
        return (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <button
              onClick={() => setNeedsVoteOpen((o) => !o)}
              className="flex w-full items-center justify-between text-sm font-semibold text-purple-800"
            >
              <span>🗳 Needs a Vote ({toVote.length})</span>
              <span>{needsVoteOpen ? '▲' : '▼'}</span>
            </button>
            {needsVoteOpen && (
              <ul className="mt-2 space-y-1">
                {toVote.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => r.drive_url && setViewerFile({ url: r.drive_url, title: r.title })}
                      className="text-sm text-purple-900 hover:underline"
                    >
                      📄 {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })()}

      {/* Action-tag filter */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-400">Filter:</span>
        {(['all', 'to_do', 'to_review', 'to_vote'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTagFilter(t)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              tagFilter === t ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'all' ? 'All' : TAG_META[t].label}
          </button>
        ))}
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

          {/* Action tag (documents only) */}
          {formMode === 'document' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Action tag</label>
              <select
                value={actionTag}
                onChange={(e) => setActionTag(e.target.value as ResourceActionTag | '')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              >
                <option value="">None</option>
                <option value="to_do">To Do</option>
                <option value="to_review">To Review</option>
                <option value="to_vote">To Vote</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">
                "To Do" / "To Review" can be turned into an action item. "To Vote" appears in the Needs a Vote list.
              </p>
            </div>
          )}

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
            const documents = items
              .filter((r) => !r.is_folder)
              .filter((r) => tagFilter === 'all' || r.action_tag === tagFilter)

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
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => resource.drive_url && setViewerFile({ url: resource.drive_url, title: resource.title })}
                            className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-dark hover:underline text-left"
                          >
                            <span className="text-base">&#128196;</span>
                            {resource.title}
                          </button>
                          {resource.action_tag && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_META[resource.action_tag].cls}`}>
                              {TAG_META[resource.action_tag].label}
                            </span>
                          )}
                        </div>
                        {resource.description && (
                          <p className="text-xs text-gray-500 mt-0.5 ml-7">{resource.description}</p>
                        )}
                      </div>

                      {isOfficer && (
                        <div className="flex flex-wrap gap-2 ml-4 shrink-0">
                          {/* Create action item for to_do / to_review */}
                          {(resource.action_tag === 'to_do' || resource.action_tag === 'to_review') && (
                            resourcesWithActions.has(resource.id) ? (
                              <span className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                                ✓ Action created
                              </span>
                            ) : (
                              <button
                                onClick={() => setActionForResource(resource)}
                                className="border border-navy/30 bg-navy/5 rounded-lg px-2.5 py-1 text-xs font-medium text-navy hover:bg-navy/10"
                              >
                                + Create action item
                              </button>
                            )
                          )}
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

      {/* Create action item from a tagged resource */}
      {actionForResource && (
        <ActionItemForm
          initialTitle={actionForResource.title}
          initialDescription={
            (actionForResource.description ? actionForResource.description + '\n\n' : '') +
            (actionForResource.drive_url ? `Document: ${actionForResource.drive_url}` : '')
          }
          sourceResourceId={actionForResource.id}
          onSave={() => {
            setActionForResource(null)
            refetch()
          }}
          onCancel={() => setActionForResource(null)}
        />
      )}
    </div>
  )
}
