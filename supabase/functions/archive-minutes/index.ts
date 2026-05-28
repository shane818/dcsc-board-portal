// Archive approved minutes:
//   1. Receive markdown content + meeting metadata from the client
//   2. Convert markdown -> HTML
//   3. Use Google Drive API to create a Google Doc in the Approved Minutes folder
//   4. Export that Doc as PDF
//   5. Upload the PDF to the same folder
//   6. Delete the intermediate Google Doc
//   7. Return the PDF's file ID + webViewLink to the client
//
// Auth: Caller must have a valid Supabase auth token AND be an officer.
//
// Service account: needs at least the broader `drive` scope (not `drive.readonly`)
//   and the target folder must be shared with the service account as Editor.
// Configured via secrets:
//   GOOGLE_SERVICE_ACCOUNT_KEY (existing, reused from drive function)
//   APPROVED_MINUTES_FOLDER_ID (new, set per Supabase project)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------- CORS ----------------

function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ---------------- Google Service Account ----------------

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function base64UrlEncode(data: Uint8Array): string {
  const binString = Array.from(data, (b) => String.fromCharCode(b)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < tokenExpiresAt - 60) {
    return cachedAccessToken;
  }

  const keyJson = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") ?? "{}");
  const { client_email, private_key } = keyJson;
  if (!client_email || !private_key) {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY");
  }

  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = textToBase64Url(
    JSON.stringify({
      iss: client_email,
      // BROADER scope than drive function — needs write access to create + export + delete files
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsignedJwt = `${header}.${claims}`;

  const pemBody = private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedJwt)
  );
  const signedJwt = `${unsignedJwt}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signedJwt}`,
  });

  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  }

  const { access_token, expires_in } = await tokenRes.json();
  cachedAccessToken = access_token;
  tokenExpiresAt = now + (expires_in ?? 3600);
  return access_token;
}

// ---------------- Markdown → HTML ----------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  // Escape first, then apply formatting
  let out = escapeHtml(text);
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text*
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) {
      out.push("");
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(`<h1>${renderInline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2>${renderInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      out.push(`<h3>${renderInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
    } else {
      out.push(`<p>${renderInline(line)}</p>`);
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
    h1 { font-size: 18pt; margin-bottom: 8pt; }
    h2 { font-size: 14pt; margin-top: 16pt; margin-bottom: 6pt; }
    h3 { font-size: 12pt; margin-top: 12pt; margin-bottom: 4pt; }
    p { margin: 4pt 0; }
    li { margin: 2pt 0; }
  </style></head><body>${out.join("\n")}</body></html>`;
}

// ---------------- Drive API helpers ----------------

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

interface DriveFileMeta {
  id: string;
  webViewLink?: string;
  name?: string;
}

/** Create a Google Doc by uploading HTML and letting Drive auto-convert. */
async function createGoogleDocFromHtml(
  token: string,
  folderId: string,
  filename: string,
  html: string
): Promise<DriveFileMeta> {
  // Multipart upload: metadata + html body
  const boundary = "----minutes_boundary_" + crypto.randomUUID();
  const metadata = {
    name: filename,
    mimeType: "application/vnd.google-apps.document", // tells Drive to convert
    parents: [folderId],
  };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html\r\n\r\n` +
    `${html}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive create-doc failed: ${await res.text()}`);
  }
  return await res.json();
}

/** Export a Google Doc as PDF, returning the PDF bytes. */
async function exportDocAsPdf(token: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}/export?mimeType=application/pdf`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Drive export failed: ${await res.text()}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Upload PDF bytes to a Drive folder. */
async function uploadPdf(
  token: string,
  folderId: string,
  filename: string,
  pdfBytes: Uint8Array
): Promise<DriveFileMeta> {
  const boundary = "----minutes_pdf_boundary_" + crypto.randomUUID();
  const metadata = {
    name: filename,
    mimeType: "application/pdf",
    parents: [folderId],
  };
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/pdf\r\n\r\n`;
  const closingBoundary = `\r\n--${boundary}--`;

  // Concatenate string parts and binary PDF
  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaPart);
  const closingBytes = encoder.encode(closingBoundary);
  const body = new Uint8Array(metaBytes.length + pdfBytes.length + closingBytes.length);
  body.set(metaBytes, 0);
  body.set(pdfBytes, metaBytes.length);
  body.set(closingBytes, metaBytes.length + pdfBytes.length);

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive upload-pdf failed: ${await res.text()}`);
  }
  return await res.json();
}

async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // Ignore errors — best effort cleanup
}

// ---------------- Supabase auth ----------------

function createAuthenticatedClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

const OFFICER_ROLES = new Set(["chair", "vice_chair", "secretary", "treasurer", "staff"]);

async function checkIsOfficer(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data ? OFFICER_ROLES.has(data.role as string) : false;
}

// ---------------- Filename ----------------

function formatFilename(meetingTitle: string, meetingDate: string): string {
  const d = new Date(meetingDate);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  // Sortable prefix; safe chars only
  const safeTitle = meetingTitle.replace(/[<>:"/\\|?*]/g, "").trim();
  return `${yyyy}-${mm}-${dd} - ${safeTitle}.pdf`;
}

// ---------------- Main handler ----------------

interface ArchivePayload {
  meetingTitle: string;
  meetingDate: string; // ISO
  markdown: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Missing Authorization header", 401);
  }

  const supabase = createAuthenticatedClient(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("Invalid or expired token", 401);
  }

  const isOfficer = await checkIsOfficer(supabase, user.id);
  if (!isOfficer) {
    return errorResponse("Only officers can archive minutes", 403);
  }

  const folderId = Deno.env.get("APPROVED_MINUTES_FOLDER_ID");
  if (!folderId) {
    return errorResponse(
      "APPROVED_MINUTES_FOLDER_ID secret is not configured for this project",
      500
    );
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let payload: ArchivePayload;
  try {
    payload = (await req.json()) as ArchivePayload;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (!payload.meetingTitle || !payload.meetingDate || !payload.markdown) {
    return errorResponse("Missing required fields: meetingTitle, meetingDate, markdown", 400);
  }

  let docId: string | undefined;
  try {
    const token = await getGoogleAccessToken();
    const html = markdownToHtml(payload.markdown);
    const filename = formatFilename(payload.meetingTitle, payload.meetingDate);
    const docFilename = filename.replace(/\.pdf$/, ""); // Doc has no extension

    // 1. Create intermediate Google Doc
    const doc = await createGoogleDocFromHtml(token, folderId, docFilename, html);
    docId = doc.id;

    // 2. Export as PDF
    const pdfBytes = await exportDocAsPdf(token, doc.id);

    // 3. Upload the PDF as a separate file in the same folder
    const pdf = await uploadPdf(token, folderId, filename, pdfBytes);

    // 4. Delete the intermediate Doc (best effort)
    if (docId) {
      await deleteDriveFile(token, docId);
      docId = undefined;
    }

    return jsonResponse({
      fileId: pdf.id,
      webViewLink: pdf.webViewLink ?? `https://drive.google.com/file/d/${pdf.id}/view`,
      filename,
    });
  } catch (e) {
    // Cleanup intermediate doc if it exists
    if (docId) {
      try {
        const token = await getGoogleAccessToken();
        await deleteDriveFile(token, docId);
      } catch { /* ignore */ }
    }
    console.error("[archive-minutes] error:", (e as Error).message);
    return errorResponse((e as Error).message, 500);
  }
});
