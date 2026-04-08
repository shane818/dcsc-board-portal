// ---- Enum types matching SQL enums ----

export type BoardRole =
  | 'chair'
  | 'vice_chair'
  | 'secretary'
  | 'treasurer'
  | 'board_member'
  | 'staff'
  | 'guest'

export type OfficerRole = Extract<BoardRole, 'chair' | 'vice_chair' | 'secretary' | 'treasurer'>

export type CommitteeRole = 'chair' | 'member' | 'ex_officio'

export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export type AgendaItemStatus = 'pending' | 'discussed' | 'tabled' | 'approved'

export type ActionItemStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export type ActionItemPriority = 'low' | 'medium' | 'high'

export type AnnouncementAudience = 'all_board' | 'committee' | 'executives'

export type AuditAction = 'view' | 'create' | 'update' | 'delete' | 'download' | 'login'

export type MeetingMinutesStatus = 'draft' | 'approved'

// ---- Row types ----

export interface Profile {
  id: string
  email: string
  full_name: string
  role: BoardRole
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  term_start_date: string | null
  job_title: string | null
  is_standard_attendee: boolean
  created_at: string
  updated_at: string
}

export type ServiceEntryType = 'board_officer' | 'committee'

export interface ServiceHistoryEntry {
  id: string
  profile_id: string
  fiscal_year: string
  entry_type: ServiceEntryType
  board_role: BoardRole | null
  committee_id: string | null
  committee_role: CommitteeRole | null
  notes: string | null
  created_at: string
  committee?: { name: string } | null
}

export interface Committee {
  id: string
  name: string
  description: string | null
  drive_folder_id: string | null
  chair_id: string | null
  is_active: boolean
  created_at: string
}

export interface CommitteeMembership {
  id: string
  profile_id: string
  committee_id: string
  role: CommitteeRole
  joined_at: string
}

export interface Meeting {
  id: string
  committee_id: string | null
  title: string
  description: string | null
  meeting_date: string
  location: string | null
  gcal_event_id: string | null
  status: MeetingStatus
  created_by: string
  created_at: string
}

export type VoteType = 'voice' | 'roll_call'
export type VoteResult = 'carried' | 'failed' | 'tabled'
export type VoteChoice = 'yes' | 'no' | 'abstain'
export type AttendanceMode = 'in_person' | 'virtual' | 'absent'
export type AttendeeCategory = 'board_member' | 'staff' | 'guest'

export interface AgendaItem {
  id: string
  meeting_id: string
  title: string
  description: string | null
  presenter_id: string | null
  order_position: number
  duration_minutes: number | null
  status: AgendaItemStatus
  drive_file_url: string | null
  requires_approval: boolean
  created_at: string
}

export interface AgendaItemMotion {
  id: string
  agenda_item_id: string
  motion_by: string | null
  seconded_by: string | null
  vote_type: VoteType
  yes_count: number | null
  no_count: number | null
  abstain_count: number | null
  result: VoteResult | null
  notes: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export interface AgendaItemRollCall {
  id: string
  agenda_item_id: string
  profile_id: string
  vote: VoteChoice
}

export interface MeetingAttendee {
  id: string
  meeting_id: string
  profile_id: string | null
  attendance_mode: AttendanceMode
  attendee_category: AttendeeCategory
  guest_name: string | null
  guest_organization: string | null
  created_at: string
  updated_at: string
}

export interface MeetingAttendeeWithProfile extends MeetingAttendee {
  profile: { full_name: string; role: BoardRole; job_title: string | null } | null
}

export interface ActionItem {
  id: string
  meeting_id: string | null
  agenda_item_id: string | null
  title: string
  description: string | null
  assignee_id: string
  due_date: string | null
  status: ActionItemStatus
  priority: ActionItemPriority
  created_by: string
  created_at: string
  completed_at: string | null
}

export interface Announcement {
  id: string
  title: string
  body: string
  author_id: string
  target_audience: AnnouncementAudience
  target_committee_id: string | null
  is_pinned: boolean
  published_at: string
  expires_at: string | null
  created_at: string
}

export interface DocumentReference {
  id: string
  drive_file_id: string
  drive_folder_id: string | null
  filename: string
  mime_type: string | null
  committee_id: string | null
  meeting_id: string | null
  uploaded_by: string
  description: string | null
  created_at: string
}

export interface AuditLogEntry {
  id: string
  profile_id: string | null
  action: AuditAction
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface MeetingMinutes {
  id: string
  meeting_id: string
  content: string
  status: MeetingMinutesStatus
  drive_file_id: string | null
  drive_file_url: string | null
  drafted_by: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

// ---- Utility types ----

/** Membership with joined committee data */
export interface CommitteeMembershipWithCommittee extends CommitteeMembership {
  committee: Committee
}

/** Meeting with committee name */
export interface MeetingWithCommittee extends Meeting {
  committee: { name: string } | null
}

/** Announcement with author info */
export interface AnnouncementWithAuthor extends Announcement {
  author: { full_name: string; avatar_url: string | null }
}

/** Meeting with committee name and creator */
export interface MeetingWithDetails extends Meeting {
  committee: { name: string } | null
  creator: { full_name: string }
}

/** Action item with assignee and creator names */
export interface ActionItemWithAssignee extends ActionItem {
  assignee: { full_name: string }
  creator: { full_name: string }
}

/** Agenda item with presenter name and motion data */
export interface AgendaItemWithPresenter extends AgendaItem {
  presenter: { full_name: string } | null
}

export interface AgendaItemMotionWithNames extends AgendaItemMotion {
  motion_by_profile: { full_name: string } | null
  seconded_by_profile: { full_name: string } | null
}

/** Meeting minutes with drafter and approver names */
export interface MeetingMinutesWithDrafter extends MeetingMinutes {
  drafter: { full_name: string }
  approver: { full_name: string } | null
}

export interface BoardResource {
  id: string
  title: string
  description: string | null
  drive_url: string
  category: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// ---- Google Drive types ----

/** File metadata returned from Google Drive API via the Edge Function */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: string
  modifiedTime: string
  webViewLink: string
  iconLink: string
  thumbnailLink?: string
}

/** File view URL returned by the Edge Function url endpoint */
export interface DriveFileUrl {
  webViewLink: string
  name: string
  mimeType: string
}

// ---- Messaging ----

export interface Conversation {
  id: string
  name: string | null
  committee_id: string | null
  auto_created: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface ConversationMember {
  id: string
  conversation_id: string
  profile_id: string
  last_read_at: string
  joined_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface ConversationWithDetails extends Conversation {
  members: (ConversationMember & {
    profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
  })[]
  last_message: Pick<Message, 'body' | 'created_at' | 'sender_id'> | null
  my_last_read_at?: string
}

export interface MessageWithSender extends Message {
  sender: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
}

// ---- Helpers ----

const OFFICER_ROLES: ReadonlySet<string> = new Set<string>([
  'chair',
  'vice_chair',
  'secretary',
  'treasurer',
])

export function isOfficerRole(role: BoardRole): role is OfficerRole {
  return OFFICER_ROLES.has(role)
}

/** Officers + staff (Executive Director) get admin panel access */
export function hasAdminAccess(role: BoardRole): boolean {
  return OFFICER_ROLES.has(role) || role === 'staff'
}
