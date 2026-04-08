import type { DriveFile, DriveFileUrl } from '../types/database'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/drive`

async function driveRequest<T>(
  path: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`)
  }

  return data as T
}

/** List files in a committee's Google Drive folder */
export async function listDriveFiles(
  committeeId: string,
  accessToken: string
): Promise<DriveFile[]> {
  const result = await driveRequest<{ files: DriveFile[] }>(
    `?action=list&committee_id=${committeeId}`,
    accessToken
  )
  return result.files
}

/** Get a view URL for a specific Drive file */
export async function getDriveFileUrl(
  fileId: string,
  committeeId: string,
  accessToken: string
): Promise<DriveFileUrl> {
  return driveRequest<DriveFileUrl>(
    `?action=url&file_id=${fileId}&committee_id=${committeeId}`,
    accessToken
  )
}

