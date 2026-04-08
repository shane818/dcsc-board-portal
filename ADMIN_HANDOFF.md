# Administrator Handoff Guide
## DCSC / DC SCORES Board Portal

**Last updated:** April 2026
**Purpose:** Complete onboarding guide for a new or co-pilot administrator. Covers required accounts, local environment setup, Claude Code usage, and codebase orientation.

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Required Accounts & Logins](#2-required-accounts--logins)
3. [Mac Environment Setup](#3-mac-environment-setup)
4. [Getting the Codebase](#4-getting-the-codebase)
5. [Environment Variables](#5-environment-variables)
6. [Running the App Locally](#6-running-the-app-locally)
7. [Claude Code Setup](#7-claude-code-setup)
8. [Codebase Orientation](#8-codebase-orientation)
9. [Database: Supabase](#9-database-supabase)
10. [Deployments: Vercel](#10-deployments-vercel)
11. [Common Tasks](#11-common-tasks)
12. [Emergency Procedures](#12-emergency-procedures)

---

## 1. System Overview

This is a **single codebase that powers two separate board portals**:

| Portal | Organization | URL |
|--------|-------------|-----|
| DCSC Board Portal | DC Soccer Club | dcsc-board-portal.vercel.app |
| DC SCORES Board Portal | DC SCORES | dc-scores-board-portal.vercel.app |

Each portal has its own **Supabase project** (separate database, separate users) and its own **Vercel deployment**. The code is identical — org-specific content (name, logo, colors) is driven by environment variables.

**Tech stack:**
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Database & Auth:** Supabase (Postgres + Row Level Security + Realtime)
- **Hosting:** Vercel
- **File Storage:** Google Drive (via service account + Edge Function)
- **AI Development Tool:** Claude Code (Anthropic)

---

## 2. Required Accounts & Logins

The incoming administrator needs access to **all four** of these. Request credentials or transfer ownership from the previous admin.

### A. Supabase — `supabase.com`
Two separate projects. You need **Owner** or **Admin** role on both.

| Project | Project ID | Purpose |
|---------|-----------|---------|
| DCSC | `vimlfzadxqjgzguwtbia` | DCSC database, auth, realtime |
| DC SCORES | `pgrgprjwfpvddufipelm` | DC SCORES database, auth, realtime |

**What you do here:**
- Manage users and auth settings
- Run SQL migrations in the SQL Editor
- Monitor database tables and RLS policies
- View logs and debug errors
- Manage Realtime and Edge Functions

**How to get access:** The current owner goes to Project Settings → Team → Invite member with Owner role.

---

### B. Vercel — `vercel.com`
Two separate projects linked to the same codebase. You need **Owner** or **Admin** access.

| Project | Deploys From | Environment |
|---------|-------------|-------------|
| dcsc-board-portal | main branch | DCSC Supabase keys |
| dc-scores-board-portal | main branch | DC SCORES Supabase keys |

**What you do here:**
- Deploy new code (automatic on push to main, or manual deploy)
- Set and update environment variables
- View deployment logs and error traces
- Manage custom domains

**How to get access:** Current owner goes to the Vercel team settings → Members → Invite.

---

### C. Google Cloud Console — `console.cloud.google.com`
One project that holds the **service account** for Google Drive integration.

**What it does:** The Documents page shows files from a designated Google Drive folder. A service account authenticates the Edge Function to read Drive files without user OAuth every time.

**What you need:**
- Access to the Google Cloud project (currently under the previous admin's Google account)
- Ability to view/regenerate the service account key (JSON file)
- The service account key is stored as a Vercel environment variable: `GOOGLE_SERVICE_ACCOUNT_KEY`

**Action required for handoff:** Previous admin should add the new admin as a Project Owner in Google Cloud Console → IAM & Admin → IAM.

> ⚠️ **Security note:** Rotate (regenerate) the service account key every ~90 days. Old admin should regenerate and hand over the new JSON before stepping down.

---

### D. GitHub (Recommended — set up if not already done)
The codebase should be in a GitHub repository for proper version control and team collaboration.

**Repository:** Should be private, under the organization's GitHub account.

**What you do here:**
- Push code changes
- Review history of all changes
- Roll back to previous versions if something breaks

**How to set up (if not done yet):**
```bash
cd /path/to/dcsc-board-portal
git init
git add .
git commit -m "Initial commit"
# Create a private repo on GitHub, then:
git remote add origin https://github.com/YOUR-ORG/dcsc-board-portal.git
git push -u origin main
```

---

## 3. Mac Environment Setup

The new admin needs a Mac with the following installed. Run each command in Terminal.

### Step 1 — Install Homebrew (Mac package manager)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Step 2 — Install Node.js (v20 or later)
```bash
brew install node
node --version   # Should show v20.x.x or higher
```

### Step 3 — Install Supabase CLI
```bash
brew install supabase/tap/supabase
supabase --version
```

### Step 4 — Install Claude Code (AI development tool)
```bash
npm install -g @anthropic/claude-code
claude --version
```

### Step 5 — Install Git (likely already installed on Mac)
```bash
git --version
# If not found:
brew install git
```

### Step 6 — Install VS Code (recommended code editor)
Download from: https://code.visualstudio.com

Recommended extensions:
- **ESLint** — catches code errors
- **Tailwind CSS IntelliSense** — autocomplete for styles
- **TypeScript** — built-in, just ensure it's enabled

---

## 4. Getting the Codebase

### If code is on GitHub:
```bash
cd ~/Projects   # or wherever you want it
git clone https://github.com/YOUR-ORG/dcsc-board-portal.git
cd dcsc-board-portal
npm install
```

### If code is being transferred directly (USB / file share):
```bash
# Copy the folder to your Mac, then:
cd /path/to/dcsc-board-portal
npm install
```

> **Note:** `node_modules/` is never transferred — `npm install` rebuilds it from `package.json`.

---

## 5. Environment Variables

The app needs secret keys to connect to Supabase and Google. These are stored in a file called `.env.local` in the project root. **This file is never committed to git.**

### Get the values from the previous admin, then create the file:

```bash
# In the project root:
touch .env.local
```

Open `.env.local` in any text editor and paste:

```
# DCSC Supabase (for local dev against DCSC project)
VITE_SUPABASE_URL=https://vimlfzadxqjgzguwtbia.supabase.co
VITE_SUPABASE_ANON_KEY=<get from Supabase → Project Settings → API>

# Organization branding (DCSC defaults — no changes needed for DCSC)
# VITE_ORG_NAME=DC Soccer Club
# VITE_ORG_SHORT_NAME=DCSC
```

**To find the Supabase Anon Key:**
Supabase Dashboard → select your project → Project Settings (gear icon) → API → `anon` `public` key.

### Vercel Environment Variables (for production deployments)
Each Vercel project has its own environment variables set in the dashboard:
- Vercel Dashboard → select project → Settings → Environment Variables

Variables needed per project:

| Variable | Where to get it |
|----------|----------------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Cloud → IAM → Service Accounts → Keys |
| `VITE_ORG_NAME` | Set per-org (DC SCORES only) |
| `VITE_ORG_SHORT_NAME` | Set per-org (DC SCORES only) |
| `VITE_ORG_ACCENT_COLOR` | Set per-org (DC SCORES only) |

---

## 6. Running the App Locally

```bash
cd /path/to/dcsc-board-portal
npm run dev
```

Open your browser to `http://localhost:5173`

You'll see the DCSC portal (using DCSC Supabase). Log in with any board member email — Supabase will send a magic link to that email.

**Other useful commands:**
```bash
npm run build    # Build for production (tests for TypeScript errors)
npm run lint     # Check for code style issues
```

---

## 7. Claude Code Setup

Claude Code is the AI assistant used to make changes to this codebase. It writes and edits code, runs migrations, and understands the full context of the project.

### First-time setup:
```bash
# Install (if not done in Step 4):
npm install -g @anthropic/claude-code

# Authenticate with your Anthropic account:
claude login
# This opens a browser — log in or create an account at claude.ai
```

### Starting a session:
```bash
cd /path/to/dcsc-board-portal
claude
```

Claude Code opens an interactive session. You describe what you want in plain English. Examples:

- *"Add a new field called 'notes' to the action items table"*
- *"Fix the bug where the committee page crashes when there are no members"*
- *"The Messages page isn't showing the unread count — investigate and fix"*
- *"Run a security audit on the RLS policies"*

### Key things Claude Code knows about this project:
- The single-codebase / dual-deployment pattern
- Supabase RLS (Row Level Security) — all data access rules
- The migration file system (`supabase/migrations/`)
- TypeScript types and component patterns used throughout

### Important Claude Code habits:
1. **Always describe the problem, not just the fix** — "Users can't create conversations" is better than "change line 47"
2. **Paste error messages** — Claude Code can diagnose Supabase errors, TypeScript errors, and console errors
3. **Review changes before they're applied** — Claude Code will show you diffs; read them
4. **Test after every change** — run `npm run build` to catch TypeScript errors, then test in the browser

### Billing:
Claude Code is billed to an Anthropic account. Transfer the account or create a new one. Plans available at `claude.ai/settings/billing`.

---

## 8. Codebase Orientation

### Project structure:
```
dcsc-board-portal/
├── src/
│   ├── App.tsx                  # All routes defined here
│   ├── config/
│   │   └── org.ts               # Org-specific branding (name, colors, logo)
│   ├── context/
│   │   └── AuthContext.tsx      # Global auth state (current user, role)
│   ├── components/
│   │   ├── auth/                # Login, auth callback, route guards
│   │   ├── layout/              # Sidebar, Header, AppLayout, GlobalSearch
│   │   ├── dashboard/           # Dashboard widgets
│   │   └── meetings/            # Meeting agenda, voting, minutes components
│   ├── hooks/                   # Data fetching (one hook per feature)
│   │   ├── useAuth.ts           # Current user + role
│   │   ├── useMeetings.ts       # Meetings list
│   │   ├── useMessages.ts       # Real-time messaging
│   │   └── ...
│   ├── pages/                   # One file per page/screen
│   │   ├── MeetingsPage.tsx
│   │   ├── MessagesPage.tsx
│   │   ├── AdminPage.tsx        # Officers only
│   │   └── ...
│   └── lib/
│       └── supabase.ts          # Supabase client singleton
├── supabase/
│   ├── migrations/              # ALL database changes (run in order)
│   └── functions/
│       └── drive/               # Edge Function: Google Drive proxy
├── public/                      # Static assets (logos, favicon)
├── .env.local                   # Secret keys (never commit this)
├── vercel.json                  # Vercel security headers + routing
├── package.json
└── ADMIN_HANDOFF.md             # This file
```

### How pages work:
Each page in `src/pages/` follows this pattern:
1. Gets current user from `useAuth()`
2. Fetches data using a hook from `src/hooks/`
3. Renders UI with Tailwind CSS classes

### How database access works:
- All data goes through **Supabase** using the `supabase` client from `src/lib/supabase.ts`
- **Row Level Security (RLS)** policies on each table determine what each user can see/edit
- Role hierarchy: `chair` > `vice_chair` > `secretary` > `treasurer` > `staff` > `board_member` > `guest`
- Officers = chair, vice_chair, secretary, treasurer, staff
- The `is_officer()` SQL function is used throughout RLS policies

### How database changes work (migrations):
Every database change must be a migration file — never edit the database directly in production without a migration.

```bash
# Create a new migration:
supabase migration new my_change_description

# This creates: supabase/migrations/TIMESTAMP_my_change_description.sql
# Edit that file with your SQL, then run it in:
# Supabase Dashboard → SQL Editor → paste and run
```

Migration files are the permanent record of all schema changes. They run in timestamp order.

### The dual-deployment pattern:
The same code deploys to both portals. The only differences are:
- Different Supabase project (different `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)
- Different org branding (`VITE_ORG_*` environment variables)
- **Important:** When running a SQL migration, run it on **both** Supabase projects

---

## 9. Database: Supabase

### Key tables:
| Table | Purpose |
|-------|---------|
| `profiles` | All users — roles, names, status |
| `meetings` | Board meetings |
| `agenda_items` | Items within a meeting |
| `action_items` | Tasks assigned to members |
| `announcements` | Org-wide announcements |
| `committees` | Committees + members |
| `conversations` | Messaging threads |
| `messages` | Individual messages |
| `board_invites` | Pending invitations |
| `board_resources` | Links/resources for board members |
| `audit_log` | Tracks sensitive changes |

### Running SQL:
Supabase Dashboard → SQL Editor → New query → paste SQL → Run

### User management:
- **Inviting new board members:** AdminPage in the portal (Officers only) → sends magic link invite
- **Deactivating members:** AdminPage → toggle is_active off
- **Changing roles:** AdminPage → role dropdown

### Auth:
Uses **Supabase Magic Link** (passwordless). Users enter their email, receive a link, click it — no password needed.

---

## 10. Deployments: Vercel

### How deploys work:
If connected to GitHub: every push to `main` branch triggers an automatic deploy to both Vercel projects.

If not on GitHub: manual deploy via Vercel CLI:
```bash
npm install -g vercel
vercel login
vercel --prod
```

### Checking deploy status:
Vercel Dashboard → select project → Deployments tab → click latest deploy to see logs

### If a deploy breaks the app:
Vercel Dashboard → Deployments → find the last working deploy → click the three-dot menu → **Promote to Production**. This instantly rolls back.

### Environment variables:
Any time you add a new `VITE_*` variable to the code, you must also add it in Vercel:
Vercel Dashboard → project → Settings → Environment Variables → Add

---

## 11. Common Tasks

### Add a new board member
1. Log into the portal as an officer
2. Go to Admin → Invite Member
3. Enter their email and role
4. They receive a magic link via email

### Update organization branding (DC SCORES only)
1. Vercel Dashboard → dc-scores-board-portal → Settings → Environment Variables
2. Update `VITE_ORG_NAME`, `VITE_ORG_ACCENT_COLOR`, etc.
3. Trigger a redeploy (Vercel Dashboard → Deployments → Redeploy)

### Make a code change with Claude Code
```bash
cd /path/to/dcsc-board-portal
claude
# Describe what you want to change
# Review the diff Claude Code shows you
# Test with: npm run dev
# Build check: npm run build
# Deploy: git add . && git commit -m "description" && git push
```

### Run a database migration on both projects
1. Write the SQL in `supabase/migrations/TIMESTAMP_description.sql`
2. Supabase Dashboard → DCSC project → SQL Editor → run the SQL
3. Switch to DC SCORES project → SQL Editor → run the same SQL

### Rotate the Google service account key
1. Google Cloud Console → IAM & Admin → Service Accounts
2. Find the service account → Keys tab → Add Key → Create new key (JSON)
3. Download the JSON file
4. Vercel Dashboard → both projects → Settings → Environment Variables → update `GOOGLE_SERVICE_ACCOUNT_KEY`
5. Redeploy both Vercel projects

---

## 12. Emergency Procedures

### App is down / showing errors
1. Check Vercel Dashboard → Deployments → look for red failed deploy
2. If a bad deploy went out → Promote previous deployment (instant rollback)
3. Check Supabase Dashboard → project health / logs for database errors

### User locked out (magic link not arriving)
1. Check spam folder first
2. Supabase Dashboard → Authentication → Users → find user → resend confirmation email
3. Check that their profile `is_active = true` in the `profiles` table

### Data issue / something was deleted accidentally
1. Supabase Dashboard → Table Editor → find the affected table
2. If recently deleted, check audit_log table for the record
3. Supabase has point-in-time recovery on paid plans — contact Supabase support for restore

### Security incident (unauthorized access suspected)
1. Supabase Dashboard → Authentication → Users → disable the suspected user
2. Supabase Dashboard → Project Settings → API → rotate the `anon` key (forces all clients to re-auth)
3. Review `audit_log` table for suspicious activity
4. Contact Supabase support if a service role key was compromised

### Claude Code producing incorrect changes
1. Stop — don't deploy
2. Use `git diff` to see exactly what changed
3. Use `git checkout -- .` to discard all uncommitted changes and start over
4. Describe the problem differently to Claude Code, or make the change manually

---

## Quick Reference Card

| Need | Go to |
|------|-------|
| Manage users / roles | Portal → Admin page (officer login required) |
| Run SQL / migrations | Supabase Dashboard → SQL Editor |
| Update secrets/keys | Vercel Dashboard → project → Settings → Environment Variables |
| Roll back a broken deploy | Vercel Dashboard → Deployments → Promote previous |
| Rotate Google Drive key | Google Cloud Console → Service Accounts → Keys |
| Invite new Supabase team member | Supabase Dashboard → Project Settings → Team |
| Invite new Vercel team member | Vercel Dashboard → Team Settings → Members |
| Make code changes | Terminal → `claude` in project folder |
| Check real-time errors | Browser DevTools → Console tab |

---

*This document should be reviewed and updated whenever significant infrastructure changes are made. Store a copy in a secure shared location accessible to all administrators.*
