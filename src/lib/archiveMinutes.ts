const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/archive-minutes`

export interface ArchiveMinutesParams {
  meetingTitle: string
  meetingDate: string // ISO string
  markdown: string
}

export interface ArchiveMinutesResult {
  fileId: string
  webViewLink: string
  filename: string
}

/** Calls the archive-minutes Edge Function which:
 *    1. Converts markdown -> Google Doc -> PDF
 *    2. Uploads PDF to the Approved Minutes Drive folder
 *    3. Returns the PDF's file ID and shareable webViewLink */
export async function archiveMinutes(
  params: ArchiveMinutesParams,
  accessToken: string
): Promise<ArchiveMinutesResult> {
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? `Archive failed with status ${res.status}`)
  }
  return data as ArchiveMinutesResult
}
