import { supabase } from './supabase'

// Candidate names for the portal folder that holds approved minutes.
// "Approved Meeting Minutes" is the canonical DCSC folder (manually curated);
// "Approved Minutes" was an earlier seeded name kept as a fallback (e.g. DC SCORES).
export const APPROVED_MINUTES_FOLDER_NAMES = [
  'Approved Meeting Minutes',
  'Approved Minutes',
]

/** Finds the Board Resources folder where approved minutes should be filed.
 *  Prefers "Approved Meeting Minutes"; falls back to "Approved Minutes".
 *  Returns null if neither exists (caller files at root). */
export async function findApprovedMinutesFolderId(): Promise<string | null> {
  const { data } = await supabase
    .from('board_resources')
    .select('id, title')
    .in('title', APPROVED_MINUTES_FOLDER_NAMES)
    .eq('is_folder', true)
    .is('parent_id', null)

  if (!data || data.length === 0) return null

  for (const name of APPROVED_MINUTES_FOLDER_NAMES) {
    const match = data.find((r) => r.title === name)
    if (match) return match.id
  }
  return data[0].id
}
