import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders});
  if (req.method !== "POST") return new Response("Method not allowed", {status: 405, headers: corsHeaders});

  try {
    const body = await req.json();
    const requestId = body && body.requestId;
    if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return Response.json({error: "A valid requestId is required."}, {status: 400, headers: corsHeaders});
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:gingacoder@gmail.com";
    if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
      throw new Error("Push notification server secrets are not configured.");
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const {data: claimed, error: claimError} = await supabase
      .from("tea_requests")
      .update({notification_sent_at: new Date().toISOString()})
      .eq("id", requestId)
      .eq("status", "Pending")
      .is("notification_sent_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return Response.json({sent: 0, skipped: true}, {headers: corsHeaders});

    const {data: subscriptions, error: subscriptionsError} = await supabase
      .from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (subscriptionsError) throw subscriptionsError;

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const payload = JSON.stringify({
      title: "Ginga Tea Requester",
      body: "A new tea request has arrived. The kettle awaits.",
      url: "./?view=admin"
    });
    let sent = 0;
    let removed = 0;
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: {p256dh: subscription.p256dh, auth: subscription.auth}
        }, payload);
        sent++;
      } catch (error) {
        const statusCode = error && error.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
          removed++;
        } else {
          console.error("Push delivery failed:", statusCode || error);
        }
      }
    }
    return Response.json({sent, removed}, {headers: corsHeaders});
  } catch (error) {
    console.error("send-tea-notification:", error);
    return Response.json({error: error.message || "Notification dispatch failed."}, {status: 500, headers: corsHeaders});
  }
});