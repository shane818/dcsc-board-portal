// Invite a board member (Option A: pre-create the account so the person is
// referenceable across the portal before they ever log in).
//
// Flow:
//   1. Verify the caller is an officer (their JWT).
//   2. Insert a board_invites row carrying name/role/profile fields.
//   3. Use the service role to create a Google-less auth user (email_confirm:true).
//      The handle_new_user trigger fires and creates a pending profile from the
//      invite, then deletes the invite.
//   4. When the person later signs in with Google (same verified email), the
//      identity links to this waiting account — their built-out profile is ready.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const OFFICER_ROLES = new Set(["chair", "vice_chair", "secretary", "treasurer", "staff"]);
const VALID_ROLES = new Set([
  "chair",
  "vice_chair",
  "secretary",
  "treasurer",
  "board_member",
  "staff",
  "ex_officio",
]);

interface InvitePayload {
  email: string;
  full_name: string;
  role: string;
  phone?: string | null;
  term_start_date?: string | null;
  job_title?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Missing Authorization header", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Caller client (their JWT) — used to verify identity + officer status
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) {
    return errorResponse("Invalid or expired token", 401);
  }

  // Admin client (service role) — used to read role + create the auth user
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!callerProfile || !OFFICER_ROLES.has(callerProfile.role as string)) {
    return errorResponse("Only officers can invite members", 403);
  }

  let payload: InvitePayload;
  try {
    payload = (await req.json()) as InvitePayload;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const fullName = (payload.full_name ?? "").trim();
  const role = (payload.role ?? "board_member").trim();

  if (!email || !fullName) {
    return errorResponse("email and full_name are required", 400);
  }
  if (!VALID_ROLES.has(role)) {
    return errorResponse(`Invalid role: ${role}`, 400);
  }

  // Reject if a profile already exists for this email
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, invite_pending")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    return errorResponse(
      existingProfile.invite_pending
        ? "This person has already been invited and is pending."
        : "This email already has an account.",
      409
    );
  }

  // 1. Insert the invite (carries role + profile fields for the trigger)
  const { error: inviteErr } = await admin.from("board_invites").insert({
    email,
    full_name: fullName,
    role,
    invited_by: user.id,
    phone: payload.phone?.trim() || null,
    term_start_date: payload.term_start_date || null,
    job_title: payload.job_title?.trim() || null,
  });
  if (inviteErr && !inviteErr.message.includes("duplicate")) {
    return errorResponse(`Failed to record invite: ${inviteErr.message}`, 500);
  }

  // 2. Pre-create the Google-less auth user. The handle_new_user trigger fires
  //    synchronously and creates the pending profile from the invite.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr) {
    // Roll back the invite row so the officer can retry cleanly
    await admin.from("board_invites").delete().eq("email", email);
    return errorResponse(`Failed to create pending account: ${createErr.message}`, 500);
  }

  return jsonResponse({
    success: true,
    user_id: created.user?.id,
    email,
  });
});
