const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/invite-member`

export interface InviteMemberParams {
  email: string
  full_name: string
  role: string
  phone?: string | null
  term_start_date?: string | null
  job_title?: string | null
}

export interface InviteMemberResult {
  success: boolean
  user_id?: string
  email: string
}

/** Pre-creates a pending board member (Option A). The person becomes referenceable
 *  across the portal immediately and their profile is waiting when they first log in. */
export async function inviteMember(
  params: InviteMemberParams,
  accessToken: string
): Promise<InviteMemberResult> {
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
    throw new Error(data.error ?? `Invite failed with status ${res.status}`)
  }
  return data as InviteMemberResult
}
