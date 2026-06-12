// Shared client-side download / print helpers.

/** Download arbitrary text content as a file via Blob → object URL → anchor click. */
export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Strip characters not allowed in filenames. */
export function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim()
}

// Shared print/document CSS so .doc and PDF look consistent.
const DOC_STYLES = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a2e; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 18pt; color: #2B2D6B; }
  h2 { font-family: Georgia, 'Times New Roman', serif; font-size: 14pt; color: #2B2D6B; }
  h3 { font-size: 12pt; color: #374151; }
  ul { list-style: disc; margin-left: 24px; }
  ol { list-style: decimal; margin-left: 24px; }
  li { margin: 2pt 0; }
  p { margin: 4pt 0; }
`

/** Download HTML as a Word-compatible .doc file (opens in Word/Google Docs/Pages). */
export function downloadDoc(filename: string, title: string, bodyHtml: string) {
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>${DOC_STYLES}</style></head>` +
    `<body>${bodyHtml || '<p></p>'}</body></html>`
  downloadBlob(filename, html, 'application/msword')
}

/** Open a print window with the given HTML and trigger the browser's print
 *  dialog (where the user can choose "Save as PDF"). Zero-dependency PDF path. */
export function openPrintWindow(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  win.document.write(
    `<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${DOC_STYLES}</style></head><body>${bodyHtml || '<p></p>'}</body></html>`
  )
  win.document.close()
  win.focus()
  // Give the new window a tick to render before invoking print.
  setTimeout(() => win.print(), 250)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
