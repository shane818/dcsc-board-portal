// Delete a board member account (officer-only, destructive).
//
// Deleting the auth user cascades (profiles.id REFERENCES auth.users ON DELETE
// CASCADE) and removes the profile plus all FK-referenced records. Intended
// for test/mistake accounts. For real departures, use the Deactivate toggle.
//
// Auth: caller must be an officer. Self-deletion is blocked.

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

interface DeletePayload {
  profileId: string;
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

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) {
    return errorResponse("Invalid or expired token", 401);
  }

  let payload: DeletePayload;
  try {
    payload = (await req.json()) as DeletePayload;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const profileId = (payload.profileId ?? "").trim();
  if (!profileId) {
    return errorResponse("profileId is required", 400);
  }

  // Block self-deletion
  if (profileId === user.id) {
    return errorResponse("You cannot delete your own account.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verify caller is an officer
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!callerProfile || !OFFICER_ROLES.has(callerProfile.role as string)) {
    return errorResponse("Only officers can delete members", 403);
  }

  // Confirm target exists
  const { data: target } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) {
    return errorResponse("Member not found (already deleted?)", 404);
  }

  // Delete the auth user — cascades to profile + references.
  // (profileId equals auth.users.id for real accounts.)
  const { error: delErr } = await admin.auth.admin.deleteUser(profileId);
  if (delErr) {
    // Fallback: if there's no matching auth user (edge case), delete the profile row directly.
    const { error: profileDelErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", profileId);
    if (profileDelErr) {
      return errorResponse(`Failed to delete member: ${delErr.message}`, 500);
    }
  }

  return jsonResponse({ success: true, deleted: target.email });
});
