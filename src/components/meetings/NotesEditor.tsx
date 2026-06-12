import { useEffect, useRef } from 'react'

interface Props {
  /** Current HTML content. */
  value: string
  /** When false, the editor renders read-only (no toolbar). */
  editable: boolean
  /** Called with the latest HTML whenever the user edits. */
  onChange?: (html: string) => void
}

/** Minimal allow-list sanitizer: strip <script>/<style> and inline event handlers
 *  before rendering trusted-but-stored HTML. Content is authored in-app by
 *  officers, so this is defense-in-depth rather than a hard security boundary. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

// document.execCommand is deprecated but universally supported and the
// zero-dependency path for a simple WYSIWYG. Good enough for informal notes.
function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

const TOOLBAR: { label: string; title: string; run: () => void }[] = [
  { label: 'B', title: 'Bold', run: () => exec('bold') },
  { label: 'I', title: 'Italic', run: () => exec('italic') },
  { label: 'H2', title: 'Heading', run: () => exec('formatBlock', 'h2') },
  { label: 'H3', title: 'Subheading', run: () => exec('formatBlock', 'h3') },
  { label: '• List', title: 'Bullet list', run: () => exec('insertUnorderedList') },
  { label: '1. List', title: 'Numbered list', run: () => exec('insertOrderedList') },
  { label: '¶', title: 'Normal text', run: () => exec('formatBlock', 'p') },
  { label: 'Clear', title: 'Clear formatting', run: () => exec('removeFormat') },
]

export default function NotesEditor({ value, editable, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Initialize / sync external value into the contentEditable div without
  // clobbering the caret while the user is actively typing (only set when the
  // DOM differs from the incoming value, e.g. first load or after refetch).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const incoming = sanitizeHtml(value || '')
    if (el.innerHTML !== incoming) {
      el.innerHTML = incoming
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleInput() {
    if (ref.current && onChange) onChange(ref.current.innerHTML)
  }

  if (!editable) {
    return (
      <div
        className="notes-content rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value || '<p class="text-gray-400">No notes yet.</p>') }}
      />
    )
  }

  return (
    <div className="rounded-lg border border-gray-300">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        {TOOLBAR.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            // onMouseDown + preventDefault keeps the editor's selection intact
            onMouseDown={(e) => {
              e.preventDefault()
              b.run()
              handleInput()
            }}
            className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            {b.label}
          </button>
        ))}
      </div>
      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="notes-content min-h-[180px] px-3 py-2 text-sm text-gray-900 focus:outline-none"
      />
    </div>
  )
}
