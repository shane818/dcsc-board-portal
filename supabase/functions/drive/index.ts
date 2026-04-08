import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- CORS ----

const ALLOWED_ORIGINS = [
  "https://dcsc-board-portal.vercel.app",
  "https://dc-scores-board-portal.vercel.app",
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Kept for backward compatibility in jsonResponse / errorResponse helpers
const corsHeaders: Record<string, string> = getCorsHeaders(null);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ---- Google Service Account Auth ----

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
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY: missing client_email or private_key");
  }

  // Build JWT header and claims
  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = textToBase64Url(
    JSON.stringify({
      iss: client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsignedJwt = `${header}.${claims}`;

  // Import the private key and sign
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

  // Exchange for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signedJwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const { access_token, expires_in } = await tokenRes.json();
  cachedAccessToken = access_token;
  tokenExpiresAt = now + (expires_in ?? 3600);

  return access_token;
}

// ---- Google Drive API Helpers ----

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

async function listFilesInFolder(folderId: string): Promise<unknown[]> {
  const token = await getGoogleAccessToken();
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)"
  );

  const res = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API list failed: ${err}`);
  }

  const data = await res.json();
  return data.files ?? [];
}

async function getFileMetadata(
  fileId: string
): Promise<{ webViewLink: string; name: string; mimeType: string }> {
  const token = await getGoogleAccessToken();
  const fields = encodeURIComponent("id,name,mimeType,webViewLink");

  const res = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API get failed: ${err}`);
  }

  return await res.json();
}

// ---- Supabase Helpers ----

function createAuthenticatedClient(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

async function getUserId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function checkCommitteeAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  committeeId: string
): Promise<{ allowed: boolean; driveFolderId: string | null }> {
  // Check if user is an officer (officers can access all committees)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const officerRoles = ["chair", "vice_chair", "secretary", "treasurer", "staff"];
  const isOfficer = profile && officerRoles.includes(profile.role);

  if (!isOfficer) {
    // Check committee membership
    const { data: membership } = await supabase
      .from("committee_memberships")
      .select("id")
      .eq("profile_id", userId)
      .eq("committee_id", committeeId)
      .single();

    if (!membership) {
      return { allowed: false, driveFolderId: null };
    }
  }

  // Get the committee's Drive folder ID
  const { data: committee } = await supabase
    .from("committees")
    .select("drive_folder_id")
    .eq("id", committeeId)
    .single();

  return {
    allowed: true,
    driveFolderId: committee?.drive_folder_id ?? null,
  };
}

// ---- Request Handlers ----

async function handleList(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  committeeId: string
): Promise<Response> {
  const { allowed, driveFolderId } = await checkCommitteeAccess(
    supabase,
    userId,
    committeeId
  );

  if (!allowed) {
    return errorResponse("Not authorized to access this committee", 403);
  }

  // Treat null, empty, or obviously invalid folder IDs as unconfigured
  // Valid Drive folder IDs are 28+ alphanumeric chars (with - and _)
  const trimmed = (driveFolderId ?? "").trim();
  const looksValid = trimmed.length >= 10 && /^[A-Za-z0-9_\-]+$/.test(trimmed);
  if (!looksValid) {
    return jsonResponse({
      files: [],
      message: `No valid Drive folder configured (got: "${trimmed}"). Go to Admin → Committees and paste the folder ID from the Drive URL.`,
    });
  }

  try {
    const files = await listFilesInFolder(trimmed);
    return jsonResponse({ files });
  } catch (e) {
    return errorResponse(`Failed to list files (folder: "${trimmed}"): ${(e as Error).message}`, 500);
  }
}

async function handleUrl(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  fileId: string,
  committeeId: string
): Promise<Response> {
  const { allowed } = await checkCommitteeAccess(supabase, userId, committeeId);

  if (!allowed) {
    return errorResponse("Not authorized to access this committee", 403);
  }

  try {
    const metadata = await getFileMetadata(fileId);

    // Log the access in the audit log
    await supabase.from("audit_log").insert({
      profile_id: userId,
      action: "download",
      resource_type: "document",
      resource_id: fileId,
      metadata: { filename: metadata.name, mime_type: metadata.mimeType, committee_id: committeeId },
    });

    return jsonResponse(metadata);
  } catch (e) {
    return errorResponse(`Failed to get file URL: ${(e as Error).message}`, 500);
  }
}

async function handleRegister(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: {
    drive_file_id: string;
    filename: string;
    mime_type?: string;
    committee_id: string;
    meeting_id?: string;
    description?: string;
    drive_folder_id?: string;
  }
): Promise<Response> {
  if (!body.drive_file_id || !body.filename || !body.committee_id) {
    return errorResponse("Missing required fields: drive_file_id, filename, committee_id");
  }

  const { allowed } = await checkCommitteeAccess(supabase, userId, body.committee_id);

  if (!allowed) {
    return errorResponse("Not authorized to access this committee", 403);
  }

  const { data, error } = await supabase
    .from("document_references")
    .insert({
      drive_file_id: body.drive_file_id,
      drive_folder_id: body.drive_folder_id ?? null,
      filename: body.filename,
      mime_type: body.mime_type ?? null,
      committee_id: body.committee_id,
      meeting_id: body.meeting_id ?? null,
      uploaded_by: userId,
      description: body.description ?? null,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to register document: ${error.message}`, 500);
  }

  return jsonResponse(data, 201);
}

// ---- Main Handler ----

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  const requestOrigin = req.headers.get("origin");
  const dynamicCors = getCorsHeaders(requestOrigin);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: dynamicCors });
  }

  // Verify authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Missing Authorization header", 401);
  }

  const supabase = createAuthenticatedClient(authHeader);
  const userId = await getUserId(supabase);

  if (!userId) {
    return errorResponse("Invalid or expired token", 401);
  }

  // Route by action query parameter
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (req.method === "GET" && action === "list") {
      const committeeId = url.searchParams.get("committee_id");
      if (!committeeId) return errorResponse("Missing committee_id parameter");
      return await handleList(supabase, userId, committeeId);
    }

    if (req.method === "GET" && action === "url") {
      const fileId = url.searchParams.get("file_id");
      const committeeId = url.searchParams.get("committee_id");
      if (!fileId || !committeeId) return errorResponse("Missing file_id or committee_id parameter");
      return await handleUrl(supabase, userId, fileId, committeeId);
    }

    if (req.method === "POST" && action === "register") {
      const body = await req.json();
      return await handleRegister(supabase, userId, body);
    }

    return errorResponse("Unknown action. Use: list, url, or register", 404);
  } catch (e) {
    return errorResponse(`Internal error: ${(e as Error).message}`, 500);
  }
});
