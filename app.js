const STORAGE_KEY = "ginga-tea-requester:data";
const PREF_KEY = "ginga-tea-requester:preferences";
const $ = id => document.getElementById(id);

const DEFAULT_SETTINGS = {
  open: "07:00",
  close: "22:00",
  cooldown: 60,
  limit: 4,
  enabled: true,
  hoursOverride: false,
  sound: false
};

let data = { settings: {...DEFAULT_SETTINGS}, requests: [] };
let admin = false;
let toastTimer;
let audioContext;
let settingsDirty = false;

const personality = {
  ready: ["ALL SYSTEMS OPERATIONAL.", "KETTLE LINK ESTABLISHED. AWAITING AUTHORISATION.", "BEVERAGE RESPONSE UNIT STANDING BY."],
  cooldown: ["PLEASE STAND BY. THE KETTLE IS BUSY.", "COOLDOWN ACTIVE. IMPATIENCE WILL NOT BOIL WATER FASTER.", "YOUR REQUEST HAS BEEN LOGGED. THE KETTLE NEEDS A MOMENT."],
  limit: ["YOUR GREED HAS BEEN RECORDED.", "DAILY ALLOWANCE EXHAUSTED. THIS INCIDENT WILL BE REVIEWED.", "THAT IS QUITE ENOUGH TEA FOR ONE DAY."],
  closed: ["BEVERAGE OPERATIONS SUSPENDED.", "OUTSIDE OPERATING HOURS. THE TEA DEPARTMENT IS OFF DUTY."],
  disabled: ["SYSTEM DISABLED BY ADMINISTRATOR.", "BEVERAGE OPERATIONS SUSPENDED BY COMMAND."],
  accepted: ["CONTRACTUAL OBLIGATION INITIATED.", "REQUEST ACCEPTED. THE TEA DEBT IS NOW ACTIVE.", "A NEW TEA CONTRACT HAS BEEN REGISTERED."],
  fulfilled: ["DELIVERY CONFIRMED. EXCELLENT WORK.", "CONTRACT SATISFIED. RECORDS UPDATED.", "TEA DELIVERY VERIFIED. STAND DOWN."]
};

function setPersonality(state) {
  const choices = personality[state] || personality.ready;
  const message = $("system-message-text");
  const panel = $("system-message");
  if (message) message.textContent = choices[Math.floor(Math.random() * choices.length)];
  if (panel) panel.dataset.state = state;
}

function toast(message) {
  const element = $("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

function ukDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

function ukMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  return Number(parts.find(part => part.type === "hour").value) * 60 +
    Number(parts.find(part => part.type === "minute").value);
}

function mins(value) {
  const parts = value.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function isOpen() {
  if (data.settings.hoursOverride) return true;
  const now = ukMinutes();
  const opening = mins(data.settings.open);
  const closing = mins(data.settings.close);
  return opening < closing ? now >= opening && now < closing : now >= opening || now < closing;
}

function todayRequests() {
  const today = ukDate();
  return data.requests.filter(request => ukDate(new Date(request.createdAt)) === today);
}

function latestRequest() {
  if (!data.requests.length) return null;
  return data.requests.reduce((latest, request) =>
    Date.parse(latest.createdAt) > Date.parse(request.createdAt) ? latest : request
  );
}

function cooldownOrigin(request) {
  if (!request) return 0;
  return Date.parse(request.fulfilledAt || request.createdAt);
}

function cooldownMs() {
  const request = latestRequest();
  if (!request) return 0;
  if (request.status === "Pending") return data.settings.cooldown * 60000;
  return Math.max(0, cooldownOrigin(request) + data.settings.cooldown * 60000 - Date.now());
}

function canRequest() {
  const latest = latestRequest();
  const pending = latest && latest.status === "Pending";
  return data.settings.enabled && isOpen() &&
    todayRequests().length < data.settings.limit &&
    !pending && cooldownMs() === 0;
}

function duration(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? hours + "h " + String(minutes).padStart(2, "0") + "m " + String(remainder).padStart(2, "0") + "s"
    : minutes + "m " + String(remainder).padStart(2, "0") + "s";
}

function clockText(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(value => String(value).padStart(2, "0")).join(":");
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      data.settings = {...DEFAULT_SETTINGS, ...(saved.settings || {})};
      data.requests = Array.isArray(saved.requests) ? saved.requests : [];
    }
  } catch (error) {
    console.warn("Saved tea requester data could not be read.", error);
  }
  try {
    const preferences = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    data.settings.sound = Boolean(preferences.sound);
  } catch {
    data.settings.sound = false;
  }
  $("sound-enabled").checked = data.settings.sound;
}

function saveSound() {
  localStorage.setItem(PREF_KEY, JSON.stringify({sound: data.settings.sound}));
  saveData();
}

function playTones(notes) {
  if (!data.settings.sound) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext = audioContext || new Context();
    if (audioContext.state === "suspended") audioContext.resume();
    notes.forEach(note => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const frequency = note[0], start = note[1], length = note[2];
      oscillator.type = note[3] || "sine";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + start);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(note[4] || 0.05, audioContext.currentTime + start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + start + length);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(audioContext.currentTime + start);
      oscillator.stop(audioContext.currentTime + start + length + 0.04);
    });
  } catch (error) {
    console.warn("Audio playback unavailable.", error);
  }
}

function playActivation() {
  playTones([[440, 0, .13, "square"], [660, .14, .16, "square"], [880, .32, .25, "sawtooth", .035], [1320, .55, .32]]);
}

function playFulfilled() {
  playTones([[660, 0, .12], [880, .13, .16], [1100, .3, .22]]);
}

function playDenied() {
  playTones([[180, 0, .22, "triangle"], [130, .2, .3, "triangle"]]);
}

function untilMidnightMs() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour").value);
  const minute = Number(parts.find(part => part.type === "minute").value);
  const second = Number(parts.find(part => part.type === "second").value);
  return Math.max(1000, ((24 * 60 * 60) - (hour * 3600 + minute * 60 + second)) * 1000);
}

function untilOpeningMs() {
  const now = ukMinutes();
  const opening = mins(data.settings.open);
  let difference = (opening - now + 1440) % 1440;
  if (difference === 0) difference = 1440;
  return difference * 60000;
}

function render() {
  const open = isOpen();
  const remaining = Math.max(0, data.settings.limit - todayRequests().length);
  const cooldown = cooldownMs();
  const allowed = canRequest();
  const latest = latestRequest();
  const pending = Boolean(latest && latest.status === "Pending");
  const fulfilled = Boolean(latest && latest.status === "Fulfilled" && cooldown > 0);

  const state = !data.settings.enabled ? "disabled" :
    !open ? "closed" :
    remaining === 0 ? "limit" :
    pending ? "accepted" :
    fulfilled ? "fulfilled" :
    cooldown > 0 ? "cooldown" : "ready";

  if ($("system-message") && $("system-message").dataset.state !== state) setPersonality(state);

  const layouts = {
    ready: {label: "Available now", heading: "Tea Available", description: "You may request a cuppa", lock: false},
    cooldown: {label: "On Cooldown", heading: "On Cooldown", description: "Seems like you've recently requested a cuppa, please wait ##:##", lock: true},
    limit: {label: "Daily Allowance Reached", heading: "Limit Reached", description: "You've ran out of Tea Allowance for today. Your Limit resets at 12:00am", lock: true},
    closed: {label: "Outside Hours", heading: "Outside Hours", description: "Come back at " + data.settings.open + " for your next Tea", lock: true},
    disabled: {label: "System Disabled", heading: "System Disabled", description: "The Administrator has manually locked the system.", lock: true},
    accepted: {label: "Request Pending", heading: "The Tea Is Brewing", description: "Your request has been noted and is in progress.", lock: true},
    fulfilled: {label: "On Cooldown", heading: "Tea Fulfilled", description: "Your last request was fulfilled. Please wait for your cooldown to finish.", lock: true}
  };

  const layout = layouts[state];
  $("availability-label").textContent = !data.settings.enabled ? "System disabled" : open ? "Requests are open" : "Requests are closed";
  $("contract-tagline").textContent = "The Contract Is In Effect";
  $("cooldown-label").textContent = layout.label;
  $("request-heading").textContent = layout.heading;

  let description = layout.description;
  if (state === "cooldown") {
    const seconds = Math.ceil(cooldown / 1000);
    description = description.replace("##:##", Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"));
  }
  $("request-description").textContent = description;

  const timer = state === "limit" ? untilMidnightMs() : state === "closed" ? untilOpeningMs() : cooldown;
  $("cooldown-value").textContent = state === "disabled" ? "SYSTEM OFFLINE" :
    state === "ready" ? "Available now" : clockText(timer) + " Remaining";
  $("cooldown-detail").textContent = state === "limit" ? "Time until the daily allowance resets" :
    state === "closed" ? "Time until tea service reopens" :
    cooldown > 0 ? "Time remaining before the next request" : "No cooldown active";

  const progressStates = ["cooldown", "accepted", "fulfilled"];
  const percentage = progressStates.includes(state)
    ? Math.max(0, Math.min(100, cooldown / Math.max(1, data.settings.cooldown * 60000) * 100)) : 0;
  $("cooldown-progress").style.width = percentage + "%";
  $("cooldown-progress").parentElement.setAttribute("aria-valuenow", String(Math.round(percentage)));

  const button = $("request-button");
  const label = button.querySelector(".request-button-label");
  const lock = button.querySelector(".request-lock");
  label.hidden = layout.lock;
  lock.hidden = !layout.lock;
  label.textContent = "TEA";
  button.disabled = !allowed;
  button.setAttribute("aria-label", allowed ? "Request tea" : "Tea request unavailable");
  $("request-card").classList.toggle("activated", pending);

  $("remaining-label").textContent = "Tea Allowance";
  $("remaining-value").textContent = remaining + "/" + data.settings.limit + " Remaining";
  $("remaining-detail").textContent = remaining === 0 ? "All today's requests have been used." :
    remaining + " request" + (remaining === 1 ? "" : "s") + " still available today.";
  $("tea-indicators").innerHTML = Array.from({length: data.settings.limit}, (_, index) =>
    '<span class="tea-icon ' + (index >= remaining ? "used" : "unused") + '" aria-hidden="true"><i class="fa-solid fa-mug-hot"></i></span>'
  ).join("");
  $("tea-indicators").setAttribute("aria-label", remaining + " of " + data.settings.limit + " tea requests remaining");

  $("current-request").hidden = !latest;
  if (latest) {
    $("request-status").textContent = latest.status;
    $("request-status").className = "status-pill " + (latest.status === "Fulfilled" ? "fulfilled" : "pending");
    $("current-request-title").textContent = latest.status === "Fulfilled" ? "Tea fulfilled." : "Tea requested!";
    $("current-request-time").textContent = "Accepted " + dateLabel(latest.createdAt);
    $("current-request-note").textContent = latest.status === "Fulfilled" ? "A job well steeped." : "The tea is officially owed.";
  }
  if (admin) renderAdmin();
}

function submitRequest() {
  if (!canRequest()) {
    render();
    playDenied();
    toast("REQUEST REJECTED. THE SYSTEM HAS SPOKEN.");
    return;
  }

  const request = {
    id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2),
    createdAt: new Date().toISOString(),
    status: "Pending",
    fulfilledAt: null
  };
  data.requests.push(request);
  saveData();
  setPersonality("accepted");
  playActivation();
  render();
  $("request-heading").textContent = "CONTRACT IN EFFECT";
  $("request-description").textContent = "Request accepted. Tea is now contractually owed.";
  $("request-card").classList.add("activated", "just-accepted");
  $("request-button").classList.add("just-pressed");
  setTimeout(() => {
    $("request-button").classList.remove("just-pressed");
    $("request-card").classList.remove("just-accepted");
  }, 850);
  toast("Tea request accepted. The contract is active.");
}

function requestRow(request) {
  return '<div class="request-row"><div><strong><i class="fa-solid fa-mug-hot" aria-hidden="true"></i> Tea request · ' +
    escapeHtml(request.status) + '</strong><small>' + dateLabel(request.createdAt) + '</small></div>' +
    (request.status === "Pending"
      ? '<button class="fulfil-button" data-fulfil="' + escapeHtml(request.id) + '"><i class="fa-solid fa-check" aria-hidden="true"></i> Fulfil request</button>'
      : '<span class="status-pill fulfilled"><i class="fa-solid fa-check" aria-hidden="true"></i> Fulfilled</span>') +
    '</div>';
}

function countRecent(days) {
  const cutoff = Date.now() - days * 86400000;
  return data.requests.filter(request => Date.parse(request.createdAt) >= cutoff).length;
}

function renderStatistics() {
  const total = data.requests.length;
  const first = total ? Math.min(...data.requests.map(request => Date.parse(request.createdAt))) : Date.now();
  const elapsed = Math.max(1, (Date.now() - first) / 86400000);
  $("stat-total").textContent = total;
  $("stat-week").textContent = (total / (elapsed / 7)).toFixed(1);
  $("stat-month").textContent = (total / (elapsed / 30.4375)).toFixed(1);
  $("recent-week").textContent = (countRecent(30) / 30 * 7).toFixed(1);
  $("recent-month").textContent = (countRecent(90) / 90 * 30.4375).toFixed(1);

  const weeks = {}, months = {};
  data.requests.forEach(request => {
    const date = new Date(request.createdAt);
    const isoDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    isoDate.setUTCDate(isoDate.getUTCDate() + 4 - (isoDate.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(isoDate.getUTCFullYear(), 0, 1));
    const week = isoDate.getUTCFullYear() + " W" +
      String(Math.ceil((((isoDate - yearStart) / 86400000) + 1) / 7)).padStart(2, "0");
    const month = new Intl.DateTimeFormat("en-GB", {timeZone: "Europe/London", year: "numeric", month: "long"}).format(date);
    weeks[week] = (weeks[week] || 0) + 1;
    months[month] = (months[month] || 0) + 1;
  });
  const busiestWeek = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0];
  const busiestMonth = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
  $("busiest-week").textContent = busiestWeek ? busiestWeek[0] + " · " + busiestWeek[1] + " teas" : "—";
  $("busiest-month").textContent = busiestMonth ? busiestMonth[0] + " · " + busiestMonth[1] + " teas" : "—";

  const days = Array.from({length: 7}, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const counts = days.map(date => data.requests.filter(request =>
    ukDate(new Date(request.createdAt)) === ukDate(date)).length);
  const maximum = Math.max(1, ...counts);
  $("activity-chart").innerHTML = days.map((date, index) =>
    '<div class="chart-day"><strong>' + counts[index] + '</strong><div class="chart-bar" style="height:' +
    Math.max(4, counts[index] / maximum * 78) + 'px"></div><small>' +
    date.toLocaleDateString("en-GB", {weekday: "short"}) + "</small></div>"
  ).join("");
}

function renderAdmin() {
  const today = todayRequests();
  const pending = data.requests.filter(request => request.status === "Pending");
  const fulfilled = data.requests.filter(request => request.status === "Fulfilled");
  $("metric-today").textContent = today.length;
  $("metric-pending").textContent = pending.length;
  $("metric-fulfilled").textContent = fulfilled.length;
  $("admin-availability").textContent = !data.settings.enabled ? "Disabled" :
    data.settings.hoursOverride ? "Override active" : isOpen() ? "Open" : "Closed";
  $("admin-availability").className = "status-pill " +
    (data.settings.enabled && isOpen() ? "fulfilled" : "pending");
  $("admin-availability-detail").textContent = data.settings.hoursOverride
    ? "Opening-hours restriction is bypassed. Cooldown and daily limit still apply."
    : "Requests are accepted between " + data.settings.open + " and " + data.settings.close + " UK time.";
  $("hours-override-toggle").textContent = data.settings.hoursOverride ? "Turn override off" : "Override opening hours";
  $("hours-override-toggle").classList.toggle("override-active", data.settings.hoursOverride);
  $("hours-override-detail").textContent = data.settings.hoursOverride
    ? "ACTIVE — requests can be made at any time, subject to the other rules."
    : "Allow requests outside " + data.settings.open + "–" + data.settings.close + " UK time.";
  $("pending-count-pill").textContent = pending.length + " PENDING";

  if (!settingsDirty) {
    $("open-time").value = data.settings.open;
    $("close-time").value = data.settings.close;
    $("cooldown-setting").value = data.settings.cooldown;
    $("limit-setting").value = data.settings.limit;
  }

  $("system-toggle").innerHTML = data.settings.enabled
    ? '<i class="fa-solid fa-power-off"></i> Disable requests'
    : '<i class="fa-solid fa-power-off"></i> Enable requests';
  $("pending-list").innerHTML = pending.length
    ? pending.slice().reverse().map(requestRow).join("")
    : '<p class="muted">No outstanding requests. A rare moment of peace.</p>';
  $("history-list").innerHTML = data.requests.length
    ? data.requests.slice().reverse().map(requestRow).join("")
    : '<p class="muted">No requests yet.</p>';
  renderStatistics();
}

function fulfil(id) {
  const request = data.requests.find(item => item.id === id);
  if (!request || request.status !== "Pending") return;
  request.status = "Fulfilled";
  request.fulfilledAt = new Date().toISOString();
  saveData();
  setPersonality("fulfilled");
  playFulfilled();
  render();
  toast("CONTRACT SATISFIED. DELIVERY CONFIRMED.");
}

function openAdmin() {
  admin = true;
  $("request-view").hidden = true;
  $("admin-view").hidden = false;
  $("auth-gate").hidden = true;
  $("admin-console").hidden = false;
  renderAdmin();
}

function closeAdmin() {
  admin = false;
  $("admin-view").hidden = true;
  $("request-view").hidden = false;
  render();
}

function switchPanel(name) {
  document.querySelectorAll(".admin-tab").forEach(button =>
    button.classList.toggle("active", button.dataset.panel === name));
  document.querySelectorAll(".admin-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === "panel-" + name));
}

function saveSettings(event) {
  event.preventDefault();
  const open = $("open-time").value;
  const close = $("close-time").value;
  const cooldown = Number($("cooldown-setting").value);
  const limit = Number($("limit-setting").value);

  if (!open || !close || open === close || !Number.isInteger(cooldown) ||
      cooldown < 1 || cooldown > 1440 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    $("settings-feedback").textContent = "Please enter valid hours, cooldown and daily limit.";
    return;
  }

  data.settings.open = open;
  data.settings.close = close;
  data.settings.cooldown = cooldown;
  data.settings.limit = limit;
  data.settings.sound = $("sound-enabled").checked;
  settingsDirty = false;
  saveSound();
  saveData();
  $("settings-feedback").textContent = "Rules saved on this device.";
  render();
  toast("SYSTEM PARAMETERS UPDATED.");
}

function toggleHoursOverride() {
  data.settings.hoursOverride = !data.settings.hoursOverride;
  saveData();
  render();
  toast(data.settings.hoursOverride ? "OPENING-HOURS OVERRIDE ENABLED." : "OPENING-HOURS OVERRIDE DISABLED.");
}

function toggleSystem() {
  data.settings.enabled = !data.settings.enabled;
  saveData();
  render();
  setPersonality(data.settings.enabled ? "ready" : "disabled");
  toast(data.settings.enabled ? "BEVERAGE OPERATIONS RESTORED." : "BEVERAGE OPERATIONS SUSPENDED.");
  if (!data.settings.enabled) playDenied();
  else playTones([[740, 0, .22, "sine"]]);
}

$("request-button").addEventListener("click", submitRequest);
$("admin-open").addEventListener("click", openAdmin);
$("admin-back").addEventListener("click", closeAdmin);
$("admin-back-login").addEventListener("click", closeAdmin);
$("admin-logout").addEventListener("click", closeAdmin);
$("system-toggle").addEventListener("click", toggleSystem);
$("hours-override-toggle").addEventListener("click", toggleHoursOverride);
$("settings-form").addEventListener("input", () => {
  settingsDirty = true;
  $("settings-feedback").textContent = "Unsaved changes.";
});
$("settings-form").addEventListener("change", () => {
  settingsDirty = true;
  $("settings-feedback").textContent = "Unsaved changes.";
});
$("settings-form").addEventListener("submit", saveSettings);
$("sound-enabled").addEventListener("change", () => {
  data.settings.sound = $("sound-enabled").checked;
  saveSound();
});
document.querySelectorAll(".admin-tab").forEach(button =>
  button.addEventListener("click", () => switchPanel(button.dataset.panel)));
document.addEventListener("click", event => {
  const button = event.target.closest("[data-fulfil]");
  if (button) fulfil(button.dataset.fulfil);
});
$("notification-test").addEventListener("click", async () => {
  const feedback = $("notification-feedback");
  if (!("Notification" in window)) {
    feedback.textContent = "This browser does not support notifications.";
    return;
  }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    feedback.textContent = "Notification permission was not granted.";
    return;
  }
  new Notification("Ginga Tea Requester", {
    body: "Notification test successful. The tea system is listening."
  });
  feedback.textContent = "Local browser notification sent. Remote push delivery is not available in local-only mode.";
});

function init() {
  loadData();
  setPersonality("ready");
  render();
  setInterval(render, 1000);
}

init();