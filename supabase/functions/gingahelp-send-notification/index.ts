import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const ALLOWED_ORIGINS = new Set([
  "https://thegingacoder.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

const corsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://thegingacoder.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
};

const requestTypes: Record<string, { title: string; body: (detail: string) => string }> = {
  tea: { title: "Tea", body: () => "Someone has requested a cuppa." },
  noms: { title: "Noms", body: () => "Someone has requested their crackers." },
  help: { title: "Help", body: () => "Someone needs you to come and help them." },
  dog: { title: "Dog", body: detail => "Dog request: " + detail },
  hugs: { title: "Hugs", body: () => "Someone would like you to come and give them a hug." },
  notify: { title: "Notify", body: () => "Someone is thinking of you." },
  scratch: { title: "Scratch + Shoulders", body: () => "Someone has requested a massage and a scratch." },
  nits: { title: "Nit Nits", body: () => "Mum requests that Luke picks his spots." },
  test: { title: "Test notification", body: () => "GingaHelp notifications are working on this device." }
};

const dogChoices = new Set(["Give water", "Give food", "Let outside", "Bring from outside"]);

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, headers);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ error: "Origin not allowed." }, 403, headers);

  try {
    const body = await req.json();
    const type = typeof body?.type === "string" ? body.type : "";
    const detail = typeof body?.detail === "string" ? body.detail.trim() : "";
    const definition = requestTypes[type];

    if (!definition) return jsonResponse({ error: "Unknown request type." }, 400, headers);
    if (type === "dog" && !dogChoices.has(detail)) {
      return jsonResponse({ error: "Choose a valid dog request." }, 400, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidKeysJson = Deno.env.get("VAPID_KEYS_JSON");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:gingacoder@gmail.com";

    if (!supabaseUrl || !serviceKey || !vapidKeysJson) {
      console.error("Required GingaHelp notification secrets are not configured.");
      return jsonResponse({ error: "Notification service is not configured yet." }, 503, headers);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    if (type === "test") {
      const authorization = req.headers.get("authorization") || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!token) return jsonResponse({ error: "Administrator sign-in is required." }, 401, headers);

      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user) return jsonResponse({ error: "Administrator session is invalid." }, 401, headers);

      const { data: adminRow, error: adminError } = await supabase
        .from("gingahelp_admins")
        .select("user_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (adminError || !adminRow) return jsonResponse({ error: "Administrator access is required." }, 403, headers);
    } else {
      const { data: state, error: stateError } = await supabase
        .from("gingahelp_status")
        .select("status")
        .eq("id", 1)
        .single();

      if (stateError || state?.status !== "active") {
        return jsonResponse({ error: "GingaHelp is not currently accepting requests." }, 409, headers);
      }

      const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";
      const fingerprint = await sha256(ip + "|" + userAgent);
      const { data: allowed, error: limitError } = await supabase.rpc("claim_gingahelp_request", {
        p_fingerprint: fingerprint
      });

      if (limitError) throw limitError;
      if (!allowed) return jsonResponse({ error: "Please wait a moment before sending another request." }, 429, headers);
    }

    const { data: devices, error: deviceError } = await supabase
      .from("gingahelp_devices")
      .select("id, endpoint, p256dh, auth");

    if (deviceError) throw deviceError;
    if (!devices || devices.length === 0) {
      return jsonResponse({ sent: 0, message: "No notification devices are registered. Open /control and register a device first." }, 503, headers);
    }

    const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidKeysJson));
    const applicationServer = await webpush.ApplicationServer.new({
      contactInformation: vapidSubject,
      vapidKeys
    });

    const title = type === "test" ? "GingaHelp · Test" : "GingaHelp · " + definition.title;
    const payload = JSON.stringify({
      title,
      body: definition.body(detail),
      url: "./",
      tag: "gingahelp-" + type
    });

    let sent = 0;
    let removed = 0;
    for (const row of devices) {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      };
      try {
        await applicationServer.subscribe(subscription).pushTextMessage(payload, {
          ttl: 3600,
          urgency: webpush.Urgency.High,
          topic: "gingahelp"
        });
        sent++;
      } catch (error) {
        if (error && typeof (error as { isGone?: () => boolean }).isGone === "function" &&
            (error as { isGone: () => boolean }).isGone()) {
          await supabase.from("gingahelp_devices").delete().eq("id", row.id);
          removed++;
        } else {
          console.error("GingaHelp push delivery failed:", String(error));
        }
      }
    }

    if (sent === 0) return jsonResponse({ sent, removed, error: "Push delivery failed for all registered devices." }, 502, headers);
    return jsonResponse({ sent, removed }, 200, headers);
  } catch (error) {
    console.error("gingahelp-send-notification:", String(error));
    return jsonResponse({ error: "The notification could not be sent. Check the Edge Function logs." }, 500, headers);
  }
});
