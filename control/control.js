import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://goqdqneuwaxoyxyopfdl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ri3ecPVbIE9gsrvggZm-pQ_DeKQ1mUZ";
const VAPID_PUBLIC_KEY = "BMjEqHACpcjfvEMonqodi8dc4d09E3eTogw2EFGY5a8d-v07baJXWgug5R4WdqgzOHd6ffxPEt7tUAqZLf3JcOQ";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let currentUser = null;
let currentStatus = null;
let currentManualOverride = false;
let statusChannel = null;
let exclusionChannel = null;
let currentCollegeWeekStart = null;
let currentWeekExcluded = false;
let authHandled = false;

function feedback(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setConnection(text, online = true) {
  const pill = $("connection-pill");
  pill.textContent = text;
  pill.style.borderColor = online ? "#3d5b52" : "#79514a";
  pill.style.color = online ? "#84d9b6" : "#f2a17e";
}

function renderStatus(status, manualOverride = currentManualOverride) {
  currentStatus = status;
  currentManualOverride = Boolean(manualOverride);
  document.querySelectorAll("[data-status]").forEach(button => {
    const selected = button.dataset.status === status;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

async function verifyAndShow(user) {
  if (authHandled) return;
  authHandled = true;
  try {
    const { data, error } = await supabase
      .from("gingahelp_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      await supabase.auth.signOut();
      $("login-panel").hidden = false;
      $("dashboard").hidden = true;
      feedback($("login-feedback"), "This account is not authorised to control GingaHelp.", true);
      return;
    }

    currentUser = user;
    $("login-panel").hidden = true;
    $("dashboard").hidden = false;
    $("signed-in-as").textContent = "Signed in as " + (user.email || "administrator");
    await loadStatus();
    await loadCollegeWeek();
    await loadDevices();
    subscribeToStatus();
  } catch (error) {
    $("login-panel").hidden = false;
    $("dashboard").hidden = true;
    feedback($("login-feedback"), error.message || "Could not verify administrator access.", true);
  } finally {
    authHandled = false;
  }
}

async function loadStatus() {
  const { data, error } = await supabase
    .from("gingahelp_status")
    .select("status, manual_override")
    .eq("id", 1)
    .single();

  if (error || !data) {
    setConnection("OFFLINE", false);
    feedback($("status-feedback"), error?.message || "Could not load status.", true);
    return;
  }
  renderStatus(data.status, data.manual_override);
  setConnection("LIVE");
  feedback($("status-feedback"), data.manual_override
    ? "Current status: " + data.status + " (manual override). Select Active to resume the automatic timetable."
    : "Current status: " + data.status + " (automatic timetable).");
}

function subscribeToStatus() {
  if (statusChannel) supabase.removeChannel(statusChannel);
  statusChannel = supabase
    .channel("gingahelp-control-status")
    .on("postgres_changes", {
      event: "*", schema: "public", table: "gingahelp_status", filter: "id=eq.1"
    }, payload => {
      if (payload.new?.status) {
        renderStatus(payload.new.status, payload.new.manual_override);
        feedback($("status-feedback"), payload.new.manual_override
          ? "Status updated manually."
          : "Automatic timetable updated the status.");
      }
    })
    .subscribe(state => {
      setConnection(state === "SUBSCRIBED" ? "LIVE" : state, state === "SUBSCRIBED");
    });

  if (exclusionChannel) supabase.removeChannel(exclusionChannel);
  exclusionChannel = supabase
    .channel("gingahelp-college-week-exclusions")
    .on("postgres_changes", {
      event: "*", schema: "public", table: "gingahelp_college_excluded_weeks"
    }, () => loadCollegeWeek())
    .subscribe();
}

async function changeStatus(status, button) {
  if (!currentUser || !["active", "sleep", "college", "away"].includes(status)) return;
  const nextManualOverride = status !== "active";
  if (status === currentStatus && nextManualOverride === currentManualOverride) return;

  document.querySelectorAll("[data-status]").forEach(item => item.disabled = true);
  feedback($("status-feedback"), "Updating system status…");
  const { error } = await supabase
    .from("gingahelp_status")
    .update({
      status,
      manual_override: nextManualOverride,
      updated_at: new Date().toISOString(),
      updated_by: currentUser.id
    })
    .eq("id", 1);

  document.querySelectorAll("[data-status]").forEach(item => item.disabled = false);
  if (error) {
    feedback($("status-feedback"), error.message || "Status update failed.", true);
    return;
  }
  renderStatus(status, nextManualOverride);
  feedback($("status-feedback"), nextManualOverride
    ? "Manual override set to " + button.querySelector("strong").textContent + ". Select Active to resume the automatic timetable."
    : "Automatic timetable resumed. The scheduled status will refresh within one minute.");
}

function getCurrentCollegeWeekStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const day = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() - day + 1);
  return localDate.toISOString().slice(0, 10);
}

function formatWeekDate(dateString) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric"
  }).format(new Date(dateString + "T00:00:00Z"));
}

async function loadCollegeWeek() {
  const button = $("exclude-college-week");
  if (!button) return;
  currentCollegeWeekStart = getCurrentCollegeWeekStart();
  const weekEnd = new Date(currentCollegeWeekStart + "T00:00:00Z");
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const { data, error } = await supabase
    .from("gingahelp_college_excluded_weeks")
    .select("week_start")
    .eq("week_start", currentCollegeWeekStart)
    .maybeSingle();

  if (error) {
    button.disabled = true;
    $("college-week-summary").textContent = "Could not load the current week's exclusion status.";
    feedback($("college-week-feedback"), error.message, true);
    return;
  }

  currentWeekExcluded = Boolean(data);
  const range = formatWeekDate(currentCollegeWeekStart) + " – " + formatWeekDate(weekEnd.toISOString().slice(0, 10));
  $("college-week-summary").textContent = currentWeekExcluded
    ? "Excluded: " + range + ". Automatic College Mode will stay off for this week."
    : "Not excluded: " + range + ". The normal College timetable applies.";
  button.textContent = currentWeekExcluded
    ? "Restore College schedule for this week"
    : "Exclude this college week";
  button.disabled = false;
  button.setAttribute("aria-pressed", String(currentWeekExcluded));
}

async function toggleCollegeWeekExclusion() {
  if (!currentUser || !currentCollegeWeekStart) return;
  const button = $("exclude-college-week");
  button.disabled = true;
  feedback($("college-week-feedback"), currentWeekExcluded
    ? "Restoring the College schedule…"
    : "Excluding this College week…");

  const result = currentWeekExcluded
    ? await supabase.from("gingahelp_college_excluded_weeks")
        .delete().eq("week_start", currentCollegeWeekStart)
    : await supabase.from("gingahelp_college_excluded_weeks")
        .insert({ week_start: currentCollegeWeekStart, created_by: currentUser.id });

  if (result.error) {
    feedback($("college-week-feedback"), result.error.message || "Could not update this week's exclusion.", true);
    button.disabled = false;
    return;
  }

  await loadCollegeWeek();
  feedback($("college-week-feedback"), currentWeekExcluded
    ? "This week is excluded. The automatic status will refresh within one minute."
    : "The normal College timetable has been restored for this week.");
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

async function loadDevices() {
  const { data, error } = await supabase
    .from("gingahelp_devices")
    .select("id, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    $("device-summary").textContent = "Could not load registered devices.";
    return;
  }

  const count = data.length;
  $("device-summary").textContent = count === 0
    ? "No devices registered yet. Register this device to receive requests."
    : count + " notification device" + (count === 1 ? "" : "s") + " registered to your account.";
}

async function registerDevice() {
  const button = $("register-device");
  button.disabled = true;
  feedback($("device-feedback"), "Preparing notification registration…");
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      throw new Error("This browser does not support web push notifications.");
    }
    if (Notification.permission === "denied") {
      throw new Error("Notifications are blocked for this site. Change the browser's site notification permission and try again.");
    }
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");

    const workerUrl = new URL("../sw.js", import.meta.url);
    const workerScope = new URL("../", import.meta.url).pathname;
    const registration = await navigator.serviceWorker.register(workerUrl, { scope: workerScope });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const json = subscription.toJSON();
    const { error } = await supabase.from("gingahelp_devices").upsert({
      user_id: currentUser.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }, { onConflict: "endpoint" });

    if (error) throw error;
    feedback($("device-feedback"), "This device is registered and ready to receive GingaHelp notifications.");
    await loadDevices();
  } catch (error) {
    feedback($("device-feedback"), error.message || "Device registration failed.", true);
  } finally {
    button.disabled = false;
  }
}

async function sendTestNotification() {
  const button = $("test-notification");
  button.disabled = true;
  feedback($("device-feedback"), "Sending test notification…");
  try {
    const { data, error } = await supabase.functions.invoke("gingahelp-send-notification", {
      body: { type: "test" }
    });
    if (error) throw new Error(data?.error || error.message);
    if (!data?.sent) throw new Error(data?.message || "No notification was delivered.");
    feedback($("device-feedback"), "Test notification sent to " + data.sent + " device" + (data.sent === 1 ? "" : "s") + ".");
  } catch (error) {
    feedback($("device-feedback"), error.message || "Test notification failed.", true);
  } finally {
    button.disabled = false;
  }
}

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("login-button");
  button.disabled = true;
  feedback($("login-feedback"), "Signing in…");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  button.disabled = false;
  if (error) {
    feedback($("login-feedback"), error.message, true);
    return;
  }
  await verifyAndShow(data.user);
});

document.querySelectorAll("[data-status]").forEach(button => {
  button.addEventListener("click", () => changeStatus(button.dataset.status, button));
});
$("exclude-college-week").addEventListener("click", toggleCollegeWeekExclusion);
$("register-device").addEventListener("click", registerDevice);
$("test-notification").addEventListener("click", sendTestNotification);
$("sign-out").addEventListener("click", async () => {
  if (statusChannel) await supabase.removeChannel(statusChannel);
  if (exclusionChannel) await supabase.removeChannel(exclusionChannel);
  statusChannel = null;
  exclusionChannel = null;
  await supabase.auth.signOut();
  currentUser = null;
  $("dashboard").hidden = true;
  $("login-panel").hidden = false;
  feedback($("login-feedback"), "Signed out.");
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    $("dashboard").hidden = true;
    $("login-panel").hidden = false;
    if (statusChannel) supabase.removeChannel(statusChannel);
    if (exclusionChannel) supabase.removeChannel(exclusionChannel);
    statusChannel = null;
    exclusionChannel = null;
  }
});

const { data: sessionData } = await supabase.auth.getSession();
if (sessionData.session?.user) {
  await verifyAndShow(sessionData.session.user);
}
