import type { CommitteeRole, CommitteeMembership } from '../types/database'

// Preset committee roles shown in the Admin dropdowns. 'other' reveals a free-text
// input whose value is stored in committee_memberships.role_label.
export const COMMITTEE_ROLE_OPTIONS: { value: CommitteeRole; label: string }[] = [
  { value: 'chair', label: 'Chair' },
  { value: 'vice_chair', label: 'Vice Chair' },
  { value: 'member', label: 'Member' },
  { value: 'ex_officio', label: 'Ex Officio' },
  { value: 'at_large', label: 'At Large' },
  { value: 'other', label: 'Other…' },
]

export const COMMITTEE_ROLE_LABELS: Record<CommitteeRole, string> = {
  chair: 'Chair',
  vice_chair: 'Vice Chair',
  member: 'Member',
  ex_officio: 'Ex Officio',
  at_large: 'At Large',
  other: 'Other',
}

export const COMMITTEE_ROLE_COLORS: Record<CommitteeRole, string> = {
  chair: 'bg-dcsc-red/10 text-dcsc-red',
  vice_chair: 'bg-amber-50 text-amber-700',
  member: 'bg-gray-100 text-gray-600',
  ex_officio: 'bg-purple-50 text-purple-700',
  at_large: 'bg-blue-50 text-blue-700',
  other: 'bg-gray-100 text-gray-600',
}

// Display label for a membership: the custom role_label when role is 'other',
// otherwise the preset label.
export function roleLabel(m: Pick<CommitteeMembership, 'role' | 'role_label'>): string {
  if (m.role === 'other') return m.role_label?.trim() || 'Other'
  return COMMITTEE_ROLE_LABELS[m.role] ?? m.role
}
