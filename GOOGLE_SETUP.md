# Google Drive & Calendar Integration Setup

**Last updated:** June 2026
**Purpose:** How the portals connect to Google Drive (document viewing, minutes
PDF archiving) and Google Calendar, and how to set this up for each organization.

---

## How it works (the mental model)

The portal does **not** use a board member's Google login to read Drive. It uses
a **service account** — a robot Google identity with its own email address. For
the portal to see any Drive folder, that folder must be **shared with the
service account email** (just like sharing with a person).

Each organization has its **own** Google Cloud project + service account, so the
two portals are fully isolated — DCSC's robot cannot read DC SCORES documents and
vice versa.

```
Board member clicks "view document"
        │
        ▼
Portal frontend ──► Supabase Edge Function (drive / calendar / archive-minutes)
        │                    │
        │                    ├─ reads GOOGLE_SERVICE_ACCOUNT_KEY secret
        │                    ├─ authenticates AS the service account
        │                    └─ calls Google Drive / Calendar API
        ▼
   Document appears (only if the folder was shared with the service account)
```

---

## Current configuration

| Item | DCSC | DC SCORES |
|------|------|-----------|
| Google Cloud project | `dcsc-board-portal` | `dc-scores-board-portal` |
| Service account email | `dcsc-drive-reader@dcsc-board-portal.iam.gserviceaccount.com` | `dc-scores-board@dc-scores-board-portal.iam.gserviceaccount.com` |
| Supabase project ref | `vimlfzadxqjgzguwtbia` | `pgrgprjwfpvddufipelm` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` secret | ✅ set | ✅ set (June 2026) |
| `GOOGLE_CALENDAR_ID` secret | ✅ set | ✅ set |
| `APPROVED_MINUTES_FOLDER_ID` secret | ✅ set | ⏳ not set (no folder yet) |

The service account JSON key is stored **only** as a Supabase secret
(`GOOGLE_SERVICE_ACCOUNT_KEY`). It is never committed to git. The downloaded
`.json` key file should be deleted from your computer after it's set.

---

## Sharing a folder so the portal can read it

For ANY Drive folder you want visible in a portal (committee documents, approved
minutes archive, etc.):

1. Open the folder in Google Drive
2. Click **Share**
3. Add the org's **service account email** (see table above)
4. Permission level:
   - **Viewer** → read/view documents (enough for committee docs)
   - **Content Manager** → also allows writing (needed for auto-PDF minutes
     archiving into that folder)
5. Save

The folder can live in **anyone's Drive** — a personal Gmail account or a
Workspace/Shared Drive. Ownership doesn't matter; only the sharing does.

> **Records tip:** For an organization's permanent records, prefer a
> Workspace-owned or **Shared Drive** folder over a personal Gmail folder. If a
> personal Gmail account is ever lost, its folders go with it. A Shared Drive
> also has its own storage quota, which is required for the auto-PDF minutes
> archiving to work (service accounts have no personal storage of their own).

---

## Setting up Google integration for a NEW organization

If you ever stand up a third portal (or re-do one), here's the full sequence.

### 1. Create the Google Cloud project
- Go to https://console.cloud.google.com
- Top bar → project dropdown → **New Project**
- Name it like `<org>-board-portal`

### 2. Enable the APIs
In that project, search the top bar and **Enable** each:
- **Google Drive API** (document viewing — required)
- **Google Calendar API** (calendar invites — optional)

### 3. Create the service account
- **IAM & Admin → Service Accounts → + Create Service Account**
- Name it like `<org>-drive-reader`
- Skip the optional role/permission steps → **Done**
- The email is generated automatically:
  `something@<project-id>.iam.gserviceaccount.com`

### 4. Create + download the JSON key
- Click the service account → **Keys** tab
- **Add Key → Create new key → JSON → Create**
- A `.json` file downloads — this is a SECRET credential

### 5. Store the key as a Supabase secret
From the project repo, with the Supabase CLI linked to the org's project:
```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY="$(cat /path/to/key.json)"
```
Then **delete the local .json file** — it's no longer needed:
```bash
rm /path/to/key.json
```

### 6. (Optional) Calendar + approved-minutes secrets
```bash
# Calendar ID — the org's Google Calendar (Settings → Integrate calendar → Calendar ID)
npx supabase secrets set GOOGLE_CALENDAR_ID="<calendar-id>"

# Approved minutes Drive folder (must be a Shared Drive folder for auto-PDF to work)
npx supabase secrets set APPROVED_MINUTES_FOLDER_ID="<folder-id>"
```

### 7. Share folders
Share each committee/archive folder with the service account email (step
"Sharing a folder" above).

---

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| "Failed to load documents" / 403 in a committee | Folder not shared with the service account, OR Drive API not enabled in that project |
| Minutes approval: "storage quota exceeded" | Approved-minutes folder is in a personal Drive, not a **Shared Drive**. Service accounts have no personal storage — the target must be a Shared Drive. |
| Calendar invite fails | Calendar API not enabled, or `GOOGLE_CALENDAR_ID` not set |
| Works on DCSC but not DC SCORES (or vice versa) | A secret is set on one Supabase project but not the other — check `npx supabase secrets list` on each |

---

## Secret reference

Set per Supabase project via `npx supabase secrets set NAME="value"`:

| Secret | Purpose |
|--------|---------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Full JSON key — authenticates the robot identity for Drive + Calendar |
| `GOOGLE_CALENDAR_ID` | Which Google Calendar to create events on |
| `APPROVED_MINUTES_FOLDER_ID` | Drive folder (Shared Drive) where approved-minutes PDFs are archived |

The Edge Functions read these at runtime — **no redeploy needed** after setting a
secret.
