import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const { mobile, password } = await req.json();
    if (typeof mobile !== "string" || typeof password !== "string" ||
        password.length < 1 || password.length > 256) {
      return json(400, { error: "Enter a valid mobile number and password." });
    }
    const normalizedMobile = mobile.trim().replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{8,15}$/.test(normalizedMobile)) {
      return json(400, { error: "Enter your mobile number with country code." });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) {
      return json(503, { error: "Mobile login is not configured on the server." });
    }

    // Service-role access stays on the server; the email is never returned to the app.
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: lookupError } = await admin
      .from("profiles")
      .select("email")
      .eq("mobile", normalizedMobile)
      .maybeSingle();

    // Use a generic response so this endpoint does not reveal whether a mobile exists.
    if (lookupError || !profile?.email) {
      return json(401, { error: "Invalid mobile number or password." });
    }

    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (error || !data.session) {
      return json(401, { error: "Invalid mobile number or password." });
    }
    return json(200, { session: data.session });
  } catch {
    return json(400, { error: "Invalid request." });
  }
});
