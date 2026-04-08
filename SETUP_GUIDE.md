# DCSC Board Portal — Setup Guide

Complete these steps in order to connect all the services and get the portal running.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) installed (`brew install supabase/tap/supabase`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running (required by Supabase local dev)
- A Google Workspace account (the org that will control board member access)
- Admin access to Google Cloud Console for your organization

---

## Step 1: Start Supabase Locally

```bash
cd /path/to/dcsc-board-portal
supabase start
```

This takes 1-2 minutes on first run (downloads Docker images). When it finishes, you'll see output like:

```
API URL:   http://127.0.0.1:54321
anon key:  eyJhbGciOiJIUzI1NiIs...
service_role key: eyJhbGciOiJIUzI1NiIs...
Studio URL: http://127.0.0.1:54323
```

**Copy the `anon key`** — you'll need it in Step 2.

Verify the database is set up by opening Supabase Studio at `http://127.0.0.1:54323`. You should see all 9 tables (profiles, committees, meetings, etc.) in the Table Editor.

---

## Step 2: Configure Frontend Environment Variables

Open `.env.local` in the project root and fill in the anon key:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste-the-anon-key-from-step-1>
```

---

## Step 3: Set Up Google Cloud Project

### 3a. Create or select a project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top of the page
3. Click **New Project**
   - Project name: `DCSC Board Portal`
   - Organization: select your Google Workspace org
4. Click **Create**
5. Make sure the new project is selected in the dropdown

### 3b. Enable required APIs

1. Go to **APIs & Services > Library** (or search "API Library" in the top search bar)
2. Search for and enable each of these:
   - **Google Drive API** — click it, then click **Enable**
   - **Google Calendar API** (optional, for future meeting invites) — click it, then click **Enable**

### 3c. Configure OAuth consent screen

1. Go to **APIs & Services > OAuth consent screen**
2. Click **Get Started** or **Configure Consent Screen**
3. Fill in:
   - **App name**: `DCSC Board Portal`
   - **User support email**: your email
   - **Audience**: select **Internal**
     > "Internal" means only people in your Google Workspace org can sign in. This is the key security control — if someone leaves the org, they immediately lose access.
   - **Contact information**: your email
4. Click **Continue** through the remaining steps
5. On the Scopes page, add these scopes if prompted:
   - `email`
   - `profile`
   - `openid`
6. Click **Save**

### 3d. Create OAuth 2.0 Client ID (for user sign-in)

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials > OAuth client ID**
3. Application type: **Web application**
4. Name: `DCSC Board Portal`
5. Under **Authorized redirect URIs**, click **+ Add URI** and add:
   ```
   http://127.0.0.1:54321/auth/v1/callback
   ```
   > This is Supabase's auth callback URL for local development. For production, you'll add your hosted Supabase URL later.
6. Click **Create**
7. A dialog shows your **Client ID** and **Client Secret** — copy both

### 3e. Save OAuth credentials

Open `.env.local` and add the credentials:

```
GOOGLE_OAUTH_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-<your-client-secret>
```

Your complete `.env.local` should now look like:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<your-anon-key>
GOOGLE_OAUTH_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-<your-client-secret>
```

---

## Step 4: Create a Google Service Account (for Drive API access)

The portal uses a service account to read files from Google Drive on behalf of users. This is separate from the OAuth credentials above.

### 4a. Create the service account

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials > Service account**
3. Fill in:
   - Service account name: `dcsc-drive-reader`
   - Service account ID: `dcsc-drive-reader` (auto-filled)
   - Description: `Reads committee Drive folders for the board portal`
4. Click **Create and Continue**
5. Skip the "Grant this service account access" step (click **Continue**)
6. Skip the "Grant users access" step (click **Done**)

### 4b. Create and download a key

1. In the Service Accounts list, click on `dcsc-drive-reader`
2. Go to the **Keys** tab
3. Click **Add Key > Create new key**
4. Select **JSON** format
5. Click **Create** — a JSON file downloads automatically
6. **Keep this file safe** — it contains credentials that grant access to your Drive folders

### 4c. Save the service account key as a Supabase secret

Open a terminal and run:

```bash
supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY="$(cat /path/to/downloaded-key.json)"
```

Replace `/path/to/downloaded-key.json` with the actual path to the file you just downloaded (e.g., `~/Downloads/dcsc-board-portal-abc123.json`).

---

## Step 5: Set Up Google Drive Folders

### 5a. Create the folder structure

In Google Drive, create a folder structure like this:

```
DCSC Board Portal/
├── Audit Committee/
├── Risk Committee/
├── Nominating and Governance Committee/
├── Strategic Planning Committee/
└── Compensation Committee/
```

### 5b. Share each folder with the service account

For **each** committee folder:

1. Right-click the folder > **Share**
2. In the "Add people" field, paste the service account email:
   ```
   dcsc-drive-reader@<your-project-id>.iam.gserviceaccount.com
   ```
   > You can find this email on the Service Accounts page in Google Cloud Console
3. Set permission to **Viewer** (read-only)
4. Uncheck "Notify people" (service accounts can't receive emails)
5. Click **Share**

### 5c. Get each folder's ID

For each folder, open it in Google Drive. The URL will look like:

```
https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

The folder ID is the long string after `/folders/`:

```
1aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

Copy each folder ID — you'll need them in Step 6.

### 5d. Share folders with board members

For each committee folder, also share it with the Google accounts of the committee members. Set appropriate permissions:

- Committee chairs: **Editor**
- Committee members: **Viewer**

This ensures that when a user clicks a document link in the portal, Google Drive verifies they have access before showing the file.

---

## Step 6: Link Drive Folders to Committees in the Database

Open Supabase Studio at `http://127.0.0.1:54323` and go to **Table Editor > committees**.

For each committee row, update the `drive_folder_id` column with the corresponding Google Drive folder ID from Step 5c:

| name | drive_folder_id |
|------|----------------|
| Audit | `1aBcDeFg...` |
| Risk | `2hIjKlMn...` |
| Nominating and Governance | `3oPqRsTu...` |
| Strategic Planning | `4vWxYzAb...` |
| Compensation | `5cDeFgHi...` |

Alternatively, run SQL in the Supabase SQL Editor:

```sql
UPDATE committees SET drive_folder_id = '<folder-id>' WHERE name = 'Audit';
UPDATE committees SET drive_folder_id = '<folder-id>' WHERE name = 'Risk';
UPDATE committees SET drive_folder_id = '<folder-id>' WHERE name = 'Nominating and Governance';
UPDATE committees SET drive_folder_id = '<folder-id>' WHERE name = 'Strategic Planning';
UPDATE committees SET drive_folder_id = '<folder-id>' WHERE name = 'Compensation';
```

---

## Step 7: Restart Supabase and Start the App

Restart Supabase so it picks up the new environment variables and secrets:

```bash
supabase stop
supabase start
```

In a **separate terminal**, start the Edge Function for Google Drive:

```bash
supabase functions serve drive --no-verify-jwt
```

> The `--no-verify-jwt` flag is for local development only. The Edge Function still validates the JWT itself using the Supabase client. In production, Supabase handles JWT verification automatically.

In a **third terminal**, start the frontend:

```bash
npm run dev
```

---

## Step 8: First Sign-In and Admin Bootstrap

1. Open `http://localhost:3000` in your browser
2. Click **Sign in with Google**
3. Sign in with your Google Workspace account
4. You'll be redirected to the dashboard

At this point you're signed in as a `board_member` (the default role). To get officer-level access:

1. Open Supabase Studio at `http://127.0.0.1:54323`
2. Go to **Table Editor > profiles**
3. Find your row (match by email)
4. Change `role` from `board_member` to `chair`
5. Refresh the portal in your browser — you should now see the **Admin** link in the sidebar

Alternatively, run in the SQL Editor:

```sql
UPDATE profiles SET role = 'chair' WHERE email = 'your-email@your-org.com';
```

---

## Step 9: Add Yourself to Committees

In Supabase Studio, go to **Table Editor > committee_memberships** and add rows:

| profile_id | committee_id | role |
|-----------|-------------|------|
| `<your-profile-uuid>` | `<audit-committee-uuid>` | `chair` |
| `<your-profile-uuid>` | `<risk-committee-uuid>` | `member` |

You can find your `profile_id` in the `profiles` table and committee IDs in the `committees` table.

Or run SQL:

```sql
INSERT INTO committee_memberships (profile_id, committee_id, role)
SELECT p.id, c.id, 'chair'
FROM profiles p, committees c
WHERE p.email = 'your-email@your-org.com'
AND c.name = 'Audit';
```

---

## Step 10: Verify Everything Works

### Sign-in flow
- [ ] Visit `http://localhost:3000` — redirected to login page
- [ ] Click "Sign in with Google" — Google consent screen appears
- [ ] After signing in — redirected to dashboard

### Dashboard
- [ ] Your name and avatar appear in the header
- [ ] "My Committees" card shows your committee memberships
- [ ] "Upcoming Meetings" card loads (may be empty if no meetings exist yet)
- [ ] "My Action Items" card loads
- [ ] "Recent Announcements" card loads

### Documents
- [ ] Navigate to **Documents** page
- [ ] Select a committee from the dropdown
- [ ] Files from the committee's Google Drive folder appear in the list
- [ ] Click a file — opens in Google Drive in a new tab

### Access control
- [ ] Officers see the **Admin** link in the sidebar
- [ ] Non-officers do not see the Admin link
- [ ] Users only see documents for committees they belong to

---

## Troubleshooting

### "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
Check that `.env.local` has the correct values and you restarted `npm run dev` after changing it.

### Google Sign-In shows "Error 400: redirect_uri_mismatch"
The redirect URI in Google Cloud Console doesn't match. Make sure you added:
```
http://127.0.0.1:54321/auth/v1/callback
```
Note: it must be `127.0.0.1`, not `localhost`.

### Documents page shows "No Drive folder configured"
You haven't set the `drive_folder_id` on the committee row in Supabase. See Step 6.

### Documents page shows "Drive API list failed"
- Check that the Google Drive API is enabled in Google Cloud Console
- Check that the service account key is set correctly: `supabase secrets list`
- Check that the committee folder is shared with the service account email
- Check the Edge Function logs: `supabase functions logs drive`

### Profile not created after sign-in
The `handle_new_user` trigger may not have fired. Check the `profiles` table in Supabase Studio. If your row is missing, the trigger may have an issue — check the Supabase logs: `supabase db logs`

### "Invalid or expired token" from Edge Function
Make sure the Edge Function is running (`supabase functions serve drive`) and that your Supabase session is still valid (try signing out and back in).

---

## Production Deployment

When ready to deploy to production:

1. Create a hosted Supabase project at [supabase.com](https://supabase.com)
2. Push the database schema: `supabase db push`
3. Set secrets on the hosted project:
   ```bash
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY="$(cat key.json)" --project-ref <your-project-ref>
   ```
4. Add the production Supabase auth callback URL to Google Cloud Console:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. Deploy the Edge Function:
   ```bash
   supabase functions deploy drive --project-ref <your-project-ref>
   ```
6. Deploy the frontend to Vercel:
   ```bash
   npm install -g vercel
   vercel
   ```
7. Set environment variables in Vercel project settings:
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-production-anon-key>
   ```
8. Update the Google OAuth consent screen with your production domain
9. Add your Vercel domain to the Supabase auth redirect URLs
