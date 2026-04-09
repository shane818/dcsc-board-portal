import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- CORS (identical to drive function) ----

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

function jsonResponse(
  data: unknown,
  status = 200,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  message: string,
  status = 400,
  corsHeaders: Record<string, string>
): Response {
  return jsonResponse({ error: message }, status, corsHeaders);
}

// ---- Google Service Account Auth (calendar scope) ----

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
  if (cachedAccessToken && now < tokenExpiresAt - 60) return cachedAccessToken;

  const keyJson = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") ?? "{}");
  const { client_email, private_key } = keyJson;

  if (!client_email || !private_key) {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY: missing client_email or private_key");
  }

  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = textToBase64Url(
    JSON.stringify({
      iss: client_email,
      scope: "https://www.googleapis.com/auth/calendar",
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
    const tokenErr = await tokenRes.text();
    console.error("[calendar] token exchange failed:", tokenErr);
    throw new Error(`Google token exchange failed: ${tokenErr}`);
  }

  const { access_token, expires_in } = await tokenRes.json();
  cachedAccessToken = access_token;
  tokenExpiresAt = now + (expires_in ?? 3600);
  return access_token;
}

// ---- Supabase client ----

function createAuthenticatedClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// ---- Officer check (mirrors drive function) ----

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
  return data ? OFFICER_ROLES.has(data.role) : false;
}

// ---- Calendar API ----

interface CreateEventPayload {
  meetingId: string;
  title: string;
  description: string | null;
  location: string | null;
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
}

interface CalendarEventResult {
  eventId: string;
  eventLink: string;
}

async function createCalendarEvent(
  payload: CreateEventPayload
): Promise<CalendarEventResult> {
  const token = await getGoogleAccessToken();
  const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID secret not set");

  const body = {
    summary: payload.title,
    ...(payload.description ? { description: payload.description } : {}),
    ...(payload.location ? { location: payload.location } : {}),
    start: { dateTime: payload.startIso },
    end: { dateTime: payload.endIso },
    attendees: payload.attendeeEmails.map((email) => ({ email })),
  };

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?sendUpdates=all`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error: ${err}`);
  }

  const event = await res.json();
  return { eventId: event.id, eventLink: event.htmlLink };
}

// ---- Main handler ----

Deno.serve(async (req: Request): Promise<Response> => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Missing Authorization header", 401, corsHeaders);
  }

  const supabase = createAuthenticatedClient(authHeader);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Invalid or expired token", 401, corsHeaders);

  const isOfficer = await checkIsOfficer(supabase, user.id);
  if (!isOfficer) {
    return errorResponse("Only officers can create calendar events", 403, corsHeaders);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? req.headers.get("x-action");

  try {
    if (req.method === "POST" && action === "create") {
      const payload = (await req.json()) as CreateEventPayload;

      if (!payload.meetingId || !payload.title || !payload.startIso || !payload.endIso) {
        return errorResponse(
          "Missing required fields: meetingId, title, startIso, endIso",
          400,
          corsHeaders
        );
      }

      const { eventId, eventLink } = await createCalendarEvent(payload);

      // Persist event ID and link back to meetings table
      const { error: updateErr } = await supabase
        .from("meetings")
        .update({ gcal_event_id: eventId, gcal_event_link: eventLink })
        .eq("id", payload.meetingId);

      if (updateErr) {
        console.error("Failed to update meetings table:", updateErr.message);
      }

      return jsonResponse({ eventId, eventLink }, 201, corsHeaders);
    }

    return errorResponse("Unknown action. Supported: ?action=create (POST)", 404, corsHeaders);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[calendar] error:", msg);
    // Return the real error message so we can diagnose — tighten later
    return errorResponse(msg, 500, corsHeaders);
  }
});
