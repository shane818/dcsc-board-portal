const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/delete-member`

export interface DeleteMemberResult {
  success: boolean
  deleted: string
}

/** Permanently deletes a member account (officer-only). Cascades to remove the
 *  profile and all FK-referenced records. Use Deactivate for real departures. */
export async function deleteMember(
  profileId: string,
  accessToken: string
): Promise<DeleteMemberResult> {
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profileId }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? `Delete failed with status ${res.status}`)
  }
  return data as DeleteMemberResult
}
