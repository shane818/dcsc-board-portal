# Board Portal — Engineering Reference

**Version:** 1.0
**Last Updated:** April 2026
**Maintained by:** Shane Kim
**Applies to:** DCSC Board Portal · DC SCORES Board Portal

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Environment Variables](#5-environment-variables)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Role System](#7-role-system)
8. [Database Schema](#8-database-schema)
9. [Row-Level Security (RLS)](#9-row-level-security-rls)
10. [Database Migrations](#10-database-migrations)
11. [Edge Functions](#11-edge-functions)
12. [Frontend — Pages & Routing](#12-frontend--pages--routing)
13. [Frontend — Custom Hooks](#13-frontend--custom-hooks)
14. [Multi-Org Configuration](#14-multi-org-configuration)
15. [Build & Deployment](#15-build--deployment)
16. [Troubleshooting Playbook](#16-troubleshooting-playbook)
17. [Runbook — Common Operations](#17-runbook--common-operations)

---

## 1. System Overview

The Board Portal is a private, role-gated web application that gives nonprofit board members a single place to manage meetings, committees, documents, action items, and announcements. It integrates with Google Drive for document storage and Google OAuth for authentication.

The same codebase powers two independent deployments — one per organization — each with completely isolated data:

| Deployment | URL | Supabase Project |
|---|---|---|
| DC Soccer Club (DCSC) | https://dcsc-board-portal.vercel.app | `vimlfzadxqjgzguwtbia` |
| DC SCORES | https://dc-scores-board-portal.vercel.app | `pgrgprjwfpvddufipelm` |

Org-specific branding (name, logo, colors) is driven by `VITE_ORG_*` environment variables set per Vercel project. The DCSC deployment uses hardcoded defaults and requires no extra env vars.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Repository                     │
│              dcsc-board-portal (single repo)            │
└────────────────────┬────────────────────────────────────┘
                     │ git push triggers builds
          ┌──────────┴──────────┐
          │                     │
   ┌──────▼──────┐       ┌──────▼──────┐
   │  Vercel     │       │  Vercel     │
   │  DCSC       │       │  DC SCORES  │
   │  (static)   │       │  (static)   │
   └──────┬──────┘       └──────┬──────┘
          │                     │
   ┌──────▼──────┐       ┌──────▼──────┐
   │  Supabase   │       │  Supabase   │
   │  DCSC       │       │  DC SCORES  │
   │  Postgres   │       │  Postgres   │
   │  Auth       │       │  Auth       │
   │  Edge Fns   │       │  Edge Fns   │
   └──────┬──────┘       └──────┬──────┘
          │                     │
          └─────────┬───────────┘
                    │
            ┌───────▼────────┐
            │  Google APIs   │
            │  OAuth 2.0     │
            │  Drive API     │
            └────────────────┘
```

**Key design decisions:**

- **Single repo, two Vercel projects** — any feature ships to both portals on the same `git push`. No code duplication.
- **Two Supabase projects** — fully isolated databases. RLS enforced at the Postgres layer, not the application layer. A bug in the app cannot leak data across orgs.
- **No server** — the app is fully static (Vite-built SPA). Business logic lives in Supabase RLS policies and Edge Functions. Vercel is purely a CDN.
- **Google Drive as document storage** — files are never uploaded to Supabase. The Edge Function acts as a secure proxy to the Drive API using a service account, meaning users only need a Supabase session (not individual Drive access) to browse files.

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 19.2.4 |
| Build Tool | Vite | 8.0.1 |
| Language | TypeScript | 5.9.3 |
| Styling | Tailwind CSS | 4.2.2 |
| Routing | React Router | 7.13.2 |
| Backend / Auth / DB | Supabase | 2.100.0 (client) |
| Database | PostgreSQL | Managed by Supabase |
| Edge Functions | Deno (Supabase) | Latest |
| Hosting | Vercel | — |
| Auth Provider | Google OAuth 2.0 | — |
| Document Storage | Google Drive API v3 | — |

**Runtime environment:** The frontend is a fully static SPA served from Vercel's CDN. There is no Node.js server. All dynamic logic runs in Supabase (PostgreSQL + Edge Functions on Deno).

---

## 4. Repository Structure

```
dcsc-board-portal/
├── public/                      # Static assets (served as-is)
│   ├── dcsc-logo.png            # DCSC logo
│   ├── dc-scores-logo.png       # DC SCORES logo
│   ├── favicon.svg              # Default favicon
│   └── icons.svg                # SVG icon sprite
│
├── supabase/
│   ├── config.toml              # Supabase CLI config (project_id = dcsc-board-portal)
│   ├── functions/
│   │   └── drive/
│   │       └── index.ts         # Edge Function: Google Drive proxy
│   └── migrations/              # 16 SQL migrations (append-only, chronological)
│       └── YYYYMMDDHHMMSS_*.sql
│
├── src/
│   ├── main.tsx                 # App entry point — injects CSS vars, sets title/favicon
│   ├── App.tsx                  # React Router route tree
│   ├── app.css                  # Global styles, Tailwind theme, CSS custom properties
│   ├── vite-env.d.ts            # Vite env type declarations
│   │
│   ├── config/
│   │   └── org.ts               # Multi-org config — reads VITE_ORG_* env vars
│   │
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client (singleton)
│   │   ├── auth.ts              # signInWithGoogle(), signOut()
│   │   └── drive.ts             # Drive API client helpers
│   │
│   ├── context/
│   │   └── AuthContext.tsx      # Global auth state: session, profile, isOfficer
│   │
│   ├── types/
│   │   └── database.ts          # All TypeScript types + hasAdminAccess() helper
│   │
│   ├── hooks/                   # 18 data-fetching hooks (see Section 13)
│   │
│   ├── components/
│   │   ├── auth/                # LoginPage, AuthCallback, ProtectedRoute, OfficerRoute
│   │   ├── layout/              # AppLayout, Sidebar, Header
│   │   ├── dashboard/           # DashboardPage widgets
│   │   └── meetings/            # AttendanceSection, VotePanel
│   │
│   └── pages/                   # 12 full-page components (see Section 12)
│
├── .vercel/
│   └── project.json             # Links repo to DCSC Vercel project
├── vercel.json                  # SPA rewrite: all routes → index.html
├── vite.config.ts               # Vite + React + Tailwind plugins, dev port 3000
├── tsconfig.json                # TypeScript project references
├── tsconfig.app.json            # App TS config (ES2023, strict, bundler moduleResolution)
├── package.json                 # Dependencies + build scripts
└── ENGINEERING.md               # This document
```

---

## 5. Environment Variables

All variables are injected at **build time** by Vercel. They must be set in the Vercel project dashboard before deploying.

### Required (both deployments)

| Variable | Description | Example |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project REST/Auth base URL | `https://vimlfzadxqjgzguwtbia.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key (safe to expose) | `eyJhbG...` |

### Org Branding (optional — DCSC defaults used if unset)

| Variable | DCSC Default | DC SCORES Value |
|---|---|---|
| `VITE_ORG_NAME` | `DC Soccer Club` | `DC SCORES` |
| `VITE_ORG_SHORT_NAME` | `DCSC` | `DC SCORES` |
| `VITE_ORG_TAGLINE` | `Developing Character, Strengthening Community` | `Transforming communities through the power of poet-athletes.` |
| `VITE_ORG_FOUNDED` | `1977` | `1994` |
| `VITE_ORG_LOCATION` | `Washington, DC` | `Washington, DC` |
| `VITE_ORG_LOGO_PATH` | `/dcsc-logo.png` | `/dc-scores-logo.png` |
| `VITE_ORG_FAVICON_PATH` | `/favicon.svg` | `/dc-scores-logo.png` |
| `VITE_ORG_ACCENT_COLOR` | `#C41E3A` | `#D92314` |

### Supabase Edge Function Secrets

These are set in the Supabase dashboard under **Project → Edge Functions → Secrets**, not in Vercel.

| Secret | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Full JSON of the Google service account key used to call Drive API |
| `SUPABASE_URL` | Auto-injected by Supabase |
| `SUPABASE_ANON_KEY` | Auto-injected by Supabase |

> **Note:** `VITE_` prefix variables are embedded into the compiled JS bundle and visible to anyone who inspects the source. They are intentionally non-secret. The Supabase anon key is safe to expose — RLS enforces access control at the database level.

---

## 6. Authentication & Authorization

### Flow

```
1. User clicks "Sign in with Google" (LoginPage.tsx)
        │
        ▼
2. supabase.auth.signInWithOAuth({ provider: 'google' })
        │  redirects to Google consent screen
        ▼
3. Google redirects → /auth/callback?code=...
        │
        ▼
4. AuthCallback.tsx — waits for AuthContext to hydrate session
        │
        ▼
5. Supabase exchanges code → creates auth.users row (if new)
        │
        ▼
6. on_auth_user_created trigger fires → handle_new_user()
   ├── Checks board_invites for email match
   │   ├── FOUND: uses role, phone, term_start_date, job_title from invite
   │   │         then deletes invite (one-time use)
   │   └── NOT FOUND: defaults to role = 'board_member'
   └── Inserts row into public.profiles
        │
        ▼
7. AuthContext.fetchProfile() queries profiles table
   (retries once after 500ms to handle trigger latency)
        │
        ▼
8. AuthContext stores { session, profile, isOfficer }
   isOfficer = hasAdminAccess(profile.role)
        │
        ▼
9. ProtectedRoute → Dashboard
   OfficerRoute → Admin page (requires isOfficer = true)
```

### Key Files

| File | Purpose |
|---|---|
| `src/lib/auth.ts` | `signInWithGoogle()`, `signOut()` |
| `src/lib/supabase.ts` | Supabase singleton client |
| `src/context/AuthContext.tsx` | Session state, profile fetch with retry, `useAuth()` hook |
| `src/components/auth/LoginPage.tsx` | Login UI |
| `src/components/auth/AuthCallback.tsx` | OAuth redirect handler |
| `src/components/auth/ProtectedRoute.tsx` | Requires active session |
| `src/components/auth/OfficerRoute.tsx` | Requires `isOfficer = true` |

### Pre-Invite Pattern

Users cannot self-register. An officer must create a `board_invites` row first. On the user's first Google sign-in, the `handle_new_user()` trigger reads and deletes the invite, creating a profile with the pre-assigned role. Without an invite, new users default to `board_member`.

**To add a new admin before they've logged in:**
```sql
INSERT INTO public.board_invites (email, full_name, role)
VALUES ('user@email.com', 'Full Name', 'staff')
ON CONFLICT (email) DO NOTHING;
```

### Google OAuth Configuration

- **Google Cloud Console project:** Shared across both deployments
- **Authorized redirect URIs:** One per Supabase project:
  - `https://vimlfzadxqjgzguwtbia.supabase.co/auth/v1/callback` (DCSC)
  - `https://pgrgprjwfpvddufipelm.supabase.co/auth/v1/callback` (DC SCORES)
- **Site URL** (in Supabase Auth settings):
  - DCSC: `https://dcsc-board-portal.vercel.app`
  - DC SCORES: `https://dc-scores-board-portal.vercel.app`

---

## 7. Role System

### Board Roles

| Role | Description | Admin Access |
|---|---|---|
| `chair` | Board Chair | Yes (officer) |
| `vice_chair` | Vice Chair | Yes (officer) |
| `secretary` | Secretary | Yes (officer) |
| `treasurer` | Treasurer | Yes (officer) |
| `staff` | Executive Director / portal admin | Yes (treated as officer) |
| `board_member` | Regular board member | No |
| `guest` | Non-member attendee | No |

### Committee Roles

| Role | Description |
|---|---|
| `chair` | Committee chair |
| `member` | Regular committee member |
| `ex_officio` | Non-voting ex officio member |

### Access Control Logic

**TypeScript** (`src/types/database.ts`):
```typescript
const OFFICER_ROLES = new Set(['chair', 'vice_chair', 'secretary', 'treasurer'])

export function hasAdminAccess(role: BoardRole): boolean {
  return OFFICER_ROLES.has(role) || role === 'staff'
}
```

**SQL** (`supabase/migrations/20260401400000_staff_is_officer.sql`):
```sql
CREATE OR REPLACE FUNCTION public.is_officer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
      AND is_active = true
  );
$$;
```

> **Critical:** The TypeScript `hasAdminAccess()` and the SQL `is_officer()` function must always be kept in sync. If you add a new role that should have admin access, update both.

---

## 8. Database Schema

### Enums

```sql
board_role:             chair | vice_chair | secretary | treasurer | board_member | staff | guest
committee_role:         chair | member | ex_officio
meeting_status:         scheduled | in_progress | completed | cancelled
agenda_item_status:     pending | discussed | tabled | approved
action_item_status:     pending | in_progress | completed | overdue
action_item_priority:   low | medium | high
announcement_audience:  all_board | committee | executives
audit_action:           view | create | update | delete | download | login
meeting_minutes_status: draft | approved
attendance_mode:        in_person | virtual | absent
attendee_category:      board_member | staff | guest
vote_type:              voice | roll_call
vote_result:            carried | failed | tabled
vote_choice:            yes | no | abstain
```

### Tables

#### `profiles` — Board member identity (1:1 with `auth.users`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | FK → auth.users, CASCADE DELETE |
| `email` | text | NOT NULL | UNIQUE |
| `full_name` | text | NOT NULL | |
| `role` | board_role | NOT NULL | DEFAULT 'board_member' |
| `phone` | text | YES | |
| `avatar_url` | text | YES | From Google OAuth |
| `is_active` | boolean | NOT NULL | DEFAULT true |
| `term_start_date` | date | YES | |
| `job_title` | text | YES | |
| `is_standard_attendee` | boolean | NOT NULL | DEFAULT false — pre-populate attendance |
| `created_at` | timestamptz | NOT NULL | |
| `updated_at` | timestamptz | NOT NULL | Auto-updated by trigger |

#### `committees`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `name` | text | NOT NULL | UNIQUE |
| `description` | text | YES | |
| `drive_folder_id` | text | YES | Google Drive folder ID (10+ alphanumeric chars) |
| `chair_id` | uuid | YES | FK → profiles, SET NULL on delete |
| `is_active` | boolean | NOT NULL | DEFAULT true |
| `created_at` | timestamptz | NOT NULL | |

**Seed data:** Audit, Risk, Nominating and Governance, Strategic Planning, Compensation

#### `committee_memberships`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `profile_id` | uuid | NOT NULL | FK → profiles |
| `committee_id` | uuid | NOT NULL | FK → committees |
| `role` | committee_role | NOT NULL | DEFAULT 'member' |
| `joined_at` | timestamptz | NOT NULL | |

UNIQUE(`profile_id`, `committee_id`)

#### `meetings`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `committee_id` | uuid | YES | NULL = full board meeting |
| `title` | text | NOT NULL | |
| `description` | text | YES | |
| `meeting_date` | timestamptz | NOT NULL | |
| `location` | text | YES | |
| `gcal_event_id` | text | YES | Google Calendar event ID (future use) |
| `status` | meeting_status | NOT NULL | DEFAULT 'scheduled' |
| `created_by` | uuid | NOT NULL | FK → profiles |
| `created_at` | timestamptz | NOT NULL | |

#### `agenda_items`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `meeting_id` | uuid | NOT NULL | FK → meetings |
| `title` | text | NOT NULL | |
| `description` | text | YES | |
| `presenter_id` | uuid | YES | FK → profiles |
| `order_position` | integer | NOT NULL | DEFAULT 0 — sort order |
| `duration_minutes` | integer | YES | |
| `status` | agenda_item_status | NOT NULL | DEFAULT 'pending' |
| `drive_file_url` | text | YES | Supporting document URL |
| `requires_approval` | boolean | NOT NULL | DEFAULT false |
| `created_at` | timestamptz | NOT NULL | |

#### `agenda_item_motions` (1:1 per agenda_item)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `agenda_item_id` | uuid | NOT NULL | UNIQUE FK → agenda_items |
| `motion_by` | uuid | YES | FK → profiles |
| `seconded_by` | uuid | YES | FK → profiles |
| `vote_type` | vote_type | NOT NULL | DEFAULT 'voice' |
| `yes_count` | integer | YES | For voice votes |
| `no_count` | integer | YES | |
| `abstain_count` | integer | YES | |
| `result` | vote_result | YES | carried/failed/tabled |
| `notes` | text | YES | |
| `recorded_by` | uuid | YES | FK → profiles |
| `created_at` | timestamptz | NOT NULL | |
| `updated_at` | timestamptz | NOT NULL | Auto-updated |

#### `agenda_item_roll_calls` (per-member vote records)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `agenda_item_id` | uuid | NOT NULL | FK → agenda_items |
| `profile_id` | uuid | NOT NULL | FK → profiles |
| `vote` | vote_choice | NOT NULL | yes/no/abstain |

UNIQUE(`agenda_item_id`, `profile_id`)

#### `action_items`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `meeting_id` | uuid | YES | FK → meetings |
| `agenda_item_id` | uuid | YES | FK → agenda_items |
| `title` | text | NOT NULL | |
| `description` | text | YES | |
| `assignee_id` | uuid | NOT NULL | FK → profiles |
| `due_date` | date | YES | |
| `status` | action_item_status | NOT NULL | DEFAULT 'pending' |
| `priority` | action_item_priority | NOT NULL | DEFAULT 'medium' |
| `created_by` | uuid | NOT NULL | FK → profiles |
| `created_at` | timestamptz | NOT NULL | |
| `completed_at` | timestamptz | YES | |

#### `announcements`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `title` | text | NOT NULL | |
| `body` | text | NOT NULL | |
| `author_id` | uuid | NOT NULL | FK → profiles |
| `target_audience` | announcement_audience | NOT NULL | DEFAULT 'all_board' |
| `target_committee_id` | uuid | YES | FK → committees (when audience = 'committee') |
| `is_pinned` | boolean | NOT NULL | DEFAULT false |
| `published_at` | timestamptz | NOT NULL | DEFAULT now() |
| `expires_at` | timestamptz | YES | |
| `created_at` | timestamptz | NOT NULL | |

#### `document_references`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `drive_file_id` | text | NOT NULL | Google Drive file ID |
| `drive_folder_id` | text | YES | Parent folder ID |
| `filename` | text | NOT NULL | |
| `mime_type` | text | YES | |
| `committee_id` | uuid | YES | FK → committees |
| `meeting_id` | uuid | YES | FK → meetings |
| `uploaded_by` | uuid | NOT NULL | FK → profiles |
| `description` | text | YES | |
| `created_at` | timestamptz | NOT NULL | |

#### `meeting_minutes` (1:1 per meeting)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `meeting_id` | uuid | NOT NULL | UNIQUE FK → meetings |
| `content` | text | NOT NULL | DEFAULT '' — markdown/rich text |
| `status` | meeting_minutes_status | NOT NULL | DEFAULT 'draft' |
| `drive_file_id` | text | YES | Exported copy in Drive |
| `drive_file_url` | text | YES | |
| `drafted_by` | uuid | NOT NULL | FK → profiles |
| `approved_by` | uuid | YES | FK → profiles |
| `approved_at` | timestamptz | YES | |
| `created_at` | timestamptz | NOT NULL | |
| `updated_at` | timestamptz | NOT NULL | Auto-updated |

#### `meeting_attendees`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `meeting_id` | uuid | NOT NULL | FK → meetings |
| `profile_id` | uuid | YES | FK → profiles (null for guests) |
| `attendance_mode` | attendance_mode | NOT NULL | DEFAULT 'absent' |
| `attendee_category` | attendee_category | NOT NULL | board_member/staff/guest |
| `guest_name` | text | YES | When profile_id is null |
| `guest_organization` | text | YES | |
| `created_at` | timestamptz | NOT NULL | |
| `updated_at` | timestamptz | NOT NULL | Auto-updated |

UNIQUE(`meeting_id`, `profile_id`)

#### `board_invites` (pre-registration queue)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `email` | text | NOT NULL | UNIQUE |
| `full_name` | text | NOT NULL | |
| `role` | board_role | NOT NULL | DEFAULT 'board_member' |
| `phone` | text | YES | |
| `term_start_date` | date | YES | |
| `job_title` | text | YES | |
| `invited_by` | uuid | YES | FK → profiles |
| `created_at` | timestamptz | NOT NULL | |

> Rows are **deleted** after use. If a user's profile exists but invite was never consumed, the invite row may still exist.

#### `board_resources`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `title` | text | NOT NULL | |
| `description` | text | YES | |
| `drive_url` | text | NOT NULL | Direct link to Drive file/folder |
| `category` | text | NOT NULL | DEFAULT 'General' |
| `sort_order` | integer | NOT NULL | DEFAULT 0 |
| `created_by` | uuid | YES | FK → profiles |
| `created_at` | timestamptz | NOT NULL | |
| `updated_at` | timestamptz | NOT NULL | Auto-updated |

#### `board_service_history`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `profile_id` | uuid | NOT NULL | FK → profiles |
| `fiscal_year` | text | NOT NULL | e.g., "2025-26" |
| `entry_type` | text | NOT NULL | 'board_officer' or 'committee' |
| `board_role` | board_role | YES | |
| `committee_id` | uuid | YES | FK → committees |
| `committee_role` | committee_role | YES | |
| `notes` | text | YES | |
| `created_at` | timestamptz | NOT NULL | |

#### `audit_log` (append-only)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `profile_id` | uuid | YES | FK → profiles (null if unauthenticated) |
| `action` | audit_action | NOT NULL | view/create/update/delete/download/login |
| `resource_type` | text | NOT NULL | Table or resource name |
| `resource_id` | text | NOT NULL | Changed from uuid → text in migration 2 |
| `metadata` | jsonb | NOT NULL | DEFAULT '{}' — contextual data |
| `ip_address` | inet | YES | |
| `created_at` | timestamptz | NOT NULL | |

No UPDATE or DELETE policy — immutable by design.

---

## 9. Row-Level Security (RLS)

RLS is enabled on all tables. The Supabase anon key grants no access without a valid session. The core access patterns are:

| Pattern | Who | Tables |
|---|---|---|
| All authenticated users read | Any logged-in user | committees, committee_memberships, profiles (active), board_invites, board_resources, announcements (audience check) |
| Own row only | auth.uid() match | profiles (update own), action_items (own or assigned), audit_log (insert own) |
| Committee members | `is_committee_member(id)` | meetings (committee), agenda_items, documents (committee) |
| Officers + staff | `is_officer()` | Nearly everything — insert/update/delete on all management tables |
| Audit log read | Officers only | audit_log SELECT |
| Append-only | All authenticated | audit_log INSERT (no UPDATE/DELETE) |

### Helper Functions

```sql
-- True if current user is an active officer or staff member
is_officer() → boolean

-- True if current user is a member of the given committee
is_committee_member(p_committee_id uuid) → boolean

-- Auto-updates updated_at column on row update
set_updated_at() → trigger function

-- Creates profile on first login, checks board_invites for role
handle_new_user() → trigger on auth.users INSERT
```

---

## 10. Database Migrations

Migrations live in `supabase/migrations/` and are applied in timestamp order. **Never edit an existing migration.** Always create a new file.

| Migration | Description |
|---|---|
| `20260325000000_initial_schema.sql` | All base tables, enums, RLS policies, triggers, indexes, seed committees |
| `20260326000000_fix_audit_log_resource_id.sql` | Changed `resource_id` from uuid → text for Drive file IDs |
| `20260327000000_meeting_minutes.sql` | `meeting_minutes` table + RLS |
| `20260327100000_admin_policies.sql` | Officers can update any profile |
| `20260327200000_profile_insert_policy.sql` | Officers can insert profiles |
| `20260327300000_board_invites.sql` | `board_invites` table + updated `handle_new_user()` trigger |
| `20260327400000_board_resources.sql` | `board_resources` table + RLS |
| `20260327500000_add_ex_officio_role.sql` | Added `ex_officio` to committee_role enum |
| `20260327600000_clean_invalid_folder_ids.sql` | Null-ified malformed Drive folder IDs |
| `20260327700000_director_profiles.sql` | Added `term_start_date` to profiles; `board_service_history` table |
| `20260327800000_job_title.sql` | Added `job_title` to profiles |
| `20260401000000_meeting_attendance.sql` | `meeting_attendees` table; attendance enums; `is_standard_attendee` flag |
| `20260401100000_agenda_voting.sql` | `agenda_item_motions` + `agenda_item_roll_calls` tables; vote enums |
| `20260401200000_meeting_delete_policy.sql` | Officers and creators can delete meetings |
| `20260401300000_invite_profile_fields.sql` | Added phone, term_start_date, job_title to invites; updated `handle_new_user()` |
| `20260401400000_staff_is_officer.sql` | Extended `is_officer()` to include `staff` role |

### Applying a New Migration

```bash
# 1. Create migration file
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_description.sql

# 2. Write SQL

# 3. Push to DCSC
npx supabase link --project-ref vimlfzadxqjgzguwtbia
npx supabase db push --yes

# 4. Push to DC SCORES
npx supabase link --project-ref pgrgprjwfpvddufipelm
npx supabase db push --yes

# 5. Re-link to DCSC (default)
npx supabase link --project-ref vimlfzadxqjgzguwtbia
```

---

## 11. Edge Functions

### `drive` — Google Drive Proxy

**Location:** `supabase/functions/drive/index.ts`
**Runtime:** Deno (Supabase managed)
**Required secret:** `GOOGLE_SERVICE_ACCOUNT_KEY` (full service account JSON)

The Drive Edge Function acts as a secure server-side proxy. It signs requests to the Google Drive API using a service account, so end users only need a Supabase session — no individual Drive permissions required. Tokens are cached in-memory and refreshed 60 seconds before expiry.

**Endpoints:**

```
GET  ?action=list&committee_id=<uuid>
     → Lists files in the committee's Drive folder
     → Returns: { files: DriveFile[], message?: string }

GET  ?action=url&file_id=<id>&committee_id=<uuid>
     → Gets web view link for a file; logs to audit_log
     → Returns: { webViewLink, name, mimeType }

POST ?action=register
     Body: { drive_file_id, filename, mime_type?, committee_id,
             meeting_id?, description?, drive_folder_id? }
     → Creates a document_references row
     → Returns: 201 + inserted row
```

**Auth check:** All requests require a `Authorization: Bearer <supabase_session_token>` header. The function validates the token, extracts `auth.uid()`, and verifies the user is either an officer or a member of the target committee.

**Deploying:**
```bash
npx supabase functions deploy drive --project-ref vimlfzadxqjgzguwtbia
npx supabase functions deploy drive --project-ref pgrgprjwfpvddufipelm
```

**Setting the service account secret:**
```bash
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY='<json>' \
  --project-ref vimlfzadxqjgzguwtbia
```

---

## 12. Frontend — Pages & Routing

### Route Tree (`src/App.tsx`)

```
/login                      LoginPage           (public)
/auth/callback              AuthCallback        (public)
/                           ProtectedRoute
  /                         DashboardPage
  /meetings                 MeetingsPage
  /meetings/new             MeetingForm
  /meetings/:id             MeetingDetailPage
  /meetings/:id/edit        MeetingForm
  /committees               CommitteesPage
  /documents                DocumentsPage
  /action-items             ActionItemsPage
  /announcements            AnnouncementsPage
  /announcements/new        AnnouncementForm
  /resources                BoardResourcesPage
  /directory                DirectoryPage
  /admin                    OfficerRoute → AdminPage
```

### Pages Summary

| Page | File | Access | Description |
|---|---|---|---|
| Dashboard | `components/dashboard/DashboardPage.tsx` | All | My committees, upcoming meetings, action items, announcements |
| Meetings | `pages/MeetingsPage.tsx` | All | List/filter meetings by committee & status |
| Meeting Detail | `pages/MeetingDetailPage.tsx` | All (scoped) | Agenda, voting, attendance, minutes, action items |
| Meeting Form | `pages/MeetingForm.tsx` | Officers | Create/edit meeting |
| Committees | `pages/CommitteesPage.tsx` | All | Browse committees; manage memberships |
| Documents | `pages/DocumentsPage.tsx` | All (scoped) | Browse Drive files per committee |
| Action Items | `pages/ActionItemsPage.tsx` | All | Assigned tasks; filter by status |
| Announcements | `pages/AnnouncementsPage.tsx` | All | Board-wide + committee announcements |
| Announcement Form | `pages/AnnouncementForm.tsx` | Officers / Committee chairs | Create/edit announcement |
| Board Resources | `pages/BoardResourcesPage.tsx` | All | Key document links (bylaws, etc.) |
| Directory | `pages/DirectoryPage.tsx` | All | Board member profiles |
| Admin | `pages/AdminPage.tsx` | Officers + Staff only | Roster, invites, committees |

### Admin Page Tabs

1. **Roster** — View/edit all profiles; set role, is_active, term_start_date, job_title; invite new members
2. **Committees** — Create/edit committees; assign Drive folder IDs; manage memberships

---

## 13. Frontend — Custom Hooks

All hooks in `src/hooks/` follow the pattern:
```typescript
{ data: T | null, isLoading: boolean, error: string | null, refetch?: () => void }
```

They fetch data from Supabase on mount and when dependencies change. None use real-time subscriptions — data refreshes on navigation or explicit `refetch()`.

| Hook | Data Returned | Key Deps |
|---|---|---|
| `useProfiles()` | Active profiles (id, name, email, role) | — |
| `useAllProfiles()` | All active profiles (full detail) | — |
| `useMeetings(limit)` | Next N upcoming meetings + committee | — |
| `useFilteredMeetings(filter)` | Meetings filtered by committeeId/status/upcoming | filter |
| `useMeeting(id)` | Single meeting + committee + creator | meetingId |
| `useCommittees(userId)` | User's committee memberships + committee detail | userId |
| `useAllCommittees()` | All active committees | — |
| `useCommitteeMembers(committeeId)` | Members of a committee + profile data | committeeId |
| `useAgendaItems(meetingId)` | Agenda items ordered by position | meetingId |
| `useAgendaItemMotion(agendaItemId)` | Motion + roll call votes | agendaItemId |
| `useActionItems(userId)` | User's pending/in-progress action items | userId |
| `useAllActionItems(filter)` | All action items with filters | filter |
| `useMeetingAttendees(meetingId)` | Attendees with profile relations | meetingId |
| `useMeetingMinutes(meetingId)` | Minutes record (draft or approved) | meetingId |
| `useAnnouncements(filter)` | Announcements (audience + expiry filtered) | filter |
| `useDriveFiles(committeeId)` | Files in committee's Drive folder (via Edge Fn) | committeeId |
| `useDocumentReferences(filter)` | Document references by committee/meeting | filter |
| `useServiceHistory(profileId)` | Board service records by fiscal year | profileId |

---

## 14. Multi-Org Configuration

### How It Works

`src/config/org.ts` reads `VITE_ORG_*` env vars at build time. Unset vars fall back to DCSC defaults, so the original deployment needs no changes.

At runtime, `src/main.tsx` injects the accent color as a CSS custom property:
```typescript
document.documentElement.style.setProperty('--org-accent', org.accentColor)
```

In `src/app.css`, Tailwind's `dcsc-red` color class resolves to this CSS variable:
```css
--color-dcsc-red: var(--org-accent, #C41E3A);
```

This means `bg-dcsc-red` and `text-dcsc-red` classes render the org's brand color at runtime — no rebuild per org.

### Adding a Third Organization

1. Create a new Supabase project
2. Run `npx supabase db push` against the new project ref
3. Deploy the `drive` Edge Function to the new project
4. Set `GOOGLE_SERVICE_ACCOUNT_KEY` secret on the new project
5. Create a new Vercel project: `vercel project add <new-org-board-portal>`
6. Set all `VITE_SUPABASE_*` and `VITE_ORG_*` env vars in Vercel for the new project
7. Add org logo to `public/` folder in the repo
8. Deploy from the repo using the new project's `.vercel/project.json`
9. Configure Google OAuth: add new Supabase callback URI to existing Google OAuth client; set Site URL in new Supabase project's Auth settings

---

## 15. Build & Deployment

### Vercel Projects

| Project Name | Project ID | Default URL |
|---|---|---|
| `dcsc-board-portal` | `prj_3kcxwyfX9dHZRpPDiNV02KKt5l2K` | https://dcsc-board-portal.vercel.app |
| `dc-scores-board-portal` | `prj_AikkjESewvCMGDRHtgEbHXdS1Svk` | https://dc-scores-board-portal.vercel.app |

Both belong to Vercel org `team_QkTNyqqiYCsWuBCnO89KtGmW`.

### Build Process

```bash
npm run build        # tsc -b && vite build
npm run dev          # vite (localhost:3000, HMR)
npm run lint         # eslint
```

Vite bundles everything to `/dist`. Vercel serves `dist/` from its CDN. The `vercel.json` rewrite rule ensures all URLs resolve to `index.html` for client-side routing:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### Deploying Changes

**Both portals (normal deploy):**
```bash
git push origin main
# Vercel auto-deploys DCSC
# DC SCORES requires a manual redeploy (not connected to git auto-deploy):
cp /tmp/dc-scores-tmp/.vercel/project.json .vercel/project.json
vercel --prod
cp /tmp/dcsc-project.json.bak .vercel/project.json
```

> **TODO for a future engineer:** Connect the DC SCORES Vercel project to the same GitHub repo with automatic deployments. This eliminates the manual `.vercel/project.json` swap.

**DCSC only:**
```bash
vercel --prod
```

**Rolling back:**
```
Vercel dashboard → dcsc-board-portal → Deployments → find previous build → Promote to Production
```
Rollback is instant — no rebuild. Previous deployment files are retained indefinitely.

### Supabase Projects

| Org | Project Ref | Dashboard |
|---|---|---|
| DCSC | `vimlfzadxqjgzguwtbia` | https://supabase.com/dashboard/project/vimlfzadxqjgzguwtbia |
| DC SCORES | `pgrgprjwfpvddufipelm` | https://supabase.com/dashboard/project/pgrgprjwfpvddufipelm |

---

## 16. Troubleshooting Playbook

### Login Fails / Redirects to localhost

**Symptom:** After Google sign-in, browser goes to `localhost` and shows ERR_CONNECTION_REFUSED.

**Cause:** Site URL misconfigured in Supabase Auth settings.

**Fix:**
1. Supabase dashboard → project → **Authentication → URL Configuration**
2. Set **Site URL** to the Vercel production URL
3. Add `https://<your-domain>.vercel.app/**` to **Redirect URLs**

---

### Login Fails / "Access blocked: This app's request is invalid"

**Cause:** Google OAuth redirect URI not in the allowlist.

**Fix:**
1. Google Cloud Console → **APIs & Services → Credentials** → your OAuth client
2. Under **Authorized redirect URIs**, ensure `https://<supabase-ref>.supabase.co/auth/v1/callback` is present

---

### User Logs In But Has No Access / Sees Empty Portal

**Symptom:** Authenticated user sees nothing, or missing admin panel.

**Cause A:** Profile doesn't exist (trigger failed or invite was missing).
```sql
-- Check if profile exists
SELECT * FROM profiles WHERE email = 'user@email.com';
-- Check if invite exists
SELECT * FROM board_invites WHERE email = 'user@email.com';
```

**Cause B:** Role is too low.
```sql
UPDATE profiles SET role = 'staff' WHERE email = 'user@email.com';
```

---

### Committee Create / Edit Fails Silently

**Symptom:** Form submits, no error shown, nothing saved.

**Cause:** RLS policy blocked the insert. `is_officer()` returned false for user's role.

**Debug:**
```sql
SELECT role, is_active FROM profiles WHERE email = 'user@email.com';
SELECT is_officer(); -- run as that user
```

**Fix:** Ensure user's role is in `('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')` and `is_active = true`.

---

### Drive Files Not Loading

**Symptom:** Committee documents tab is empty or shows an error.

**Check in order:**
1. **Edge Function logs:** Supabase dashboard → **Edge Functions → drive → Logs**
2. **Service account key:** Is `GOOGLE_SERVICE_ACCOUNT_KEY` set as a secret on this Supabase project?
3. **Folder ID valid:** Is the committee's `drive_folder_id` 10+ alphanumeric characters?
4. **Drive permissions:** Is the service account (`client_email` from the key) added as a Viewer on the Drive folder?

---

### Data Not Showing After Change

**Cause:** Hooks don't use real-time subscriptions. Data only refreshes on mount or explicit `refetch()`.

**Fix:** Reload the page, or navigate away and back. This is by design — Supabase Realtime subscriptions were intentionally not added to keep the app simple.

---

### TypeScript Build Fails

```bash
npx tsc -b --noEmit
```

Common causes: missing `?.` on nullable database fields, mismatched types after schema changes. Always add a migration before changing TypeScript types.

---

## 17. Runbook — Common Operations

### Add a New Board Member

**Via UI (preferred):** Admin page → Roster tab → Invite Member button → fill form.

**Via SQL:**
```sql
INSERT INTO public.board_invites (email, full_name, role, phone, term_start_date, job_title)
VALUES ('member@email.com', 'First Last', 'board_member', '202-555-0100', '2026-07-01', 'CFO');
```
The profile is created automatically on first login.

---

### Deactivate a Board Member

**Via UI:** Admin page → Roster tab → toggle is_active off.

**Via SQL:**
```sql
UPDATE profiles SET is_active = false WHERE email = 'member@email.com';
```

---

### Change a User's Role

**Via UI:** Admin page → Roster tab → click role dropdown.

**Via SQL:**
```sql
UPDATE profiles SET role = 'treasurer' WHERE email = 'member@email.com';
```

---

### Push Database Changes to Both Projects

```bash
cd /Users/Shanehkim/Projects/dcsc-board-portal

# Create migration
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_your_change.sql
# ... edit the file ...

# Push to DCSC
npx supabase link --project-ref vimlfzadxqjgzguwtbia && npx supabase db push --yes

# Push to DC SCORES
npx supabase link --project-ref pgrgprjwfpvddufipelm && npx supabase db push --yes

# Re-link to DCSC as default
npx supabase link --project-ref vimlfzadxqjgzguwtbia
```

---

### Rotate the Google Service Account Key

1. Google Cloud Console → **IAM & Admin → Service Accounts** → your service account → **Keys → Add Key**
2. Download the new JSON key
3. Update secret on both Supabase projects:
```bash
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY='<new-json>' \
  --project-ref vimlfzadxqjgzguwtbia

npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY='<new-json>' \
  --project-ref pgrgprjwfpvddufipelm
```
4. Delete the old key from Google Cloud Console.

---

### Add a New Committee with a Drive Folder

1. Create a folder in Google Drive
2. Share the folder with the service account email (`client_email` in the JSON key) as **Viewer**
3. Copy the folder ID from the URL: `drive.google.com/drive/folders/**THIS_PART**`
4. Admin page → Committees tab → New Committee → paste the folder ID

---

### Check Audit Log

```sql
SELECT
  p.full_name, p.email,
  al.action, al.resource_type, al.resource_id,
  al.metadata, al.created_at
FROM audit_log al
LEFT JOIN profiles p ON p.id = al.profile_id
ORDER BY al.created_at DESC
LIMIT 50;
```

---

## Concurrent Editing — Known Limitation & Risk

**Status:** documented, not yet mitigated (as of June 2026).

### Current behavior
- **No realtime on meeting data.** All meeting-related hooks (`useMeeting`,
  `useAgendaItems`, `useActionItems`, `useMeetingMinutes`, `useAgendaItemMotion`)
  are **one-time fetch + manual `refetch()`**. Only the messaging system
  (`useMessages`, `useReactions`) uses Supabase Realtime. So if two people view
  the same meeting, neither sees the other's changes until they refetch or reload.
- **Last-write-wins on every write.** All updates are keyed only by `id`
  (`.update(...).eq('id', …)`). There is no version column check, no optimistic
  concurrency control, no locking, and no "someone else is editing" indicator.
- `meeting_minutes` has an `updated_at` column (auto-maintained by a trigger) but
  it is **never read or compared** by the client.

### The main risk: simultaneous minutes editing
During a live board meeting, if two officers both open the same draft minutes:
1. Both load the same content into local state.
2. Both type changes (no DB writes yet).
3. Whoever clicks **Save Draft** second **silently overwrites** the first
   person's work. No warning, no merge, no conflict prompt.

Smaller-blast-radius versions of the same race exist for agenda status changes,
action item edits, and vote recording — but minutes content loss is the worst case.

### Interim operational guidance
- Designate **one minute-taker** per meeting. Others should avoid editing the
  minutes simultaneously.
- After someone else has made changes, **reload the page** before editing to
  avoid working from stale data.

### Recommended future fixes (priority order)
1. **Presence indicator** on the minutes editor via a Supabase Realtime channel —
   "Officer X is also editing these minutes."
2. **Optimistic concurrency on minutes** using the existing `updated_at`: send the
   last-known timestamp with the update, reject if it changed server-side, and
   prompt the user to refresh/merge.
3. **Realtime auto-refetch** on agenda items, action items, and minutes so changes
   from other users appear within seconds.
4. **Collaborative editing** (Yjs/CRDT) — only if true simultaneous editing becomes
   a real need; significant added complexity.

---

*End of Engineering Reference*
