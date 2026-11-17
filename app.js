const STORAGE_KEY = "ginga-tea-requester:v1";
const DEFAULTS = { settings: { open: "07:00", close: "22:00", cooldown: 60, limit: 4 }, requests: [] };
let data = loadData();
let toastTimer;

const $ = (id) => document.getElementById(id);
const requestButton = $("request-button");

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULTS, ...saved, settings: { ...DEFAULTS.settings, ...(saved.settings || {}) }, requests: saved.requests || [] };
  } catch { return structuredClone(DEFAULTS); }
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function ukDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function ukMinutes() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find(x => x.type === "hour").value) * 60 + Number(p.find(x => x.type === "minute").value);
}
function toMinutes(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function isOpen() {
  const now = ukMinutes(), open = toMinutes(data.settings.open), close = toMinutes(data.settings.close);
  return open < close ? now >= open && now < close : now >= open || now < close;
}
function todayRequests() { const key = ukDate(); return data.requests.filter(r => ukDate(new Date(r.createdAt)) === key); }
function latestRequest() { return [...data.requests].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null; }
function cooldownMs() {
  const latest = latestRequest();
  return latest ? Math.max(0, Date.parse(latest.createdAt) + data.settings.cooldown * 60000 - Date.now()) : 0;
}
function canRequest() { return isOpen() && todayRequests().length < data.settings.limit && cooldownMs() === 0; }
function duration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`
    : `${minutes}m ${String(seconds).padStart(2,"0")}s`;
}
function dateLabel(value) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }

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
  const options = personality[state] || personality.ready;
  $("system-message-text").textContent = options[Math.floor(Math.random() * options.length)];
  $("system-message").dataset.state = state;
}
let audioContext;
function playTones(notes) {
  if (!data.settings.sound) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext ||= new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();
    notes.forEach(([frequency, start, duration, type = "sine", volume = 0.05]) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + start);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(volume, audioContext.currentTime + start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + start + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(audioContext.currentTime + start);
      oscillator.stop(audioContext.currentTime + start + duration + 0.04);
    });
  } catch (error) { console.warn("Audio unavailable", error); }
}
function playActivation() { playTones([[440,0,.13,"square"],[660,.14,.16,"square"],[880,.32,.25,"sawtooth",.035],[1320,.55,.32]]); }
function playFulfilled() { playTones([[660,0,.12],[880,.13,.16],[1100,.3,.22]]); }
function playDenied() { playTones([[180,0,.22,"triangle"],[130,.2,.3,"triangle"]]); }

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function render() {
  const open = isOpen(), remaining = Math.max(0, data.settings.limit - todayRequests().length), cooldown = cooldownMs(), allowed = canRequest();
  $("availability-label").textContent = open ? "Requests are open" : "Requests are closed";
  $("request-heading").textContent = allowed ? "Tea, please." : !open ? "We're closed for tea." : remaining === 0 ? "That's enough tea today." : "Just a little longer.";
  $("request-description").textContent = allowed ? "Press below to submit your official tea request." : !open ? `Requests open at ${data.settings.open} (UK time).` : remaining === 0 ? "You've reached today's request limit. Requests reopen at midnight." : `Your next request is available in ${duration(cooldown)}.`;
  requestButton.disabled = !allowed;
  requestButton.querySelector(".request-button-label").innerHTML = allowed
    ? "TEA"
    : '<i class="fa-solid fa-lock" aria-label="Locked"></i>';
  const active = latestRequest();
  $("request-card").classList.toggle("activated", Boolean(active && active.status === "Pending"));
  $("cooldown-value").textContent = cooldown > 0 ? duration(cooldown) : "Available now";
  $("cooldown-detail").textContent = cooldown > 0 ? "Time remaining before next request" : "No cooldown active";
  const cooldownTotal = Math.max(1, data.settings.cooldown * 60000);
  const cooldownProgress = Math.max(0, Math.min(100, (cooldown / cooldownTotal) * 100));
  $("cooldown-progress").style.width = `${cooldownProgress}%`;
  $("cooldown-progress").parentElement.setAttribute("aria-valuenow", String(Math.round(cooldownProgress)));
  $("remaining-value").textContent = `${remaining} of ${data.settings.limit} remaining`;
  $("remaining-detail").textContent = remaining === 0 ? "All today's requests have been used." : `${remaining} request${remaining === 1 ? "" : "s"} still available today.`;
  const indicators = $("tea-indicators");
  indicators.innerHTML = Array.from({length: data.settings.limit}, (_, index) => {
    const used = index >= remaining;
    return `<span class="tea-icon ${used ? "used" : "unused"}" aria-hidden="true"><i class="fa-solid fa-mug-hot"></i></span>`;
  }).join("");
  indicators.setAttribute("aria-label", `${remaining} of ${data.settings.limit} tea requests remaining`);

  const latest = latestRequest();
  $("current-request").hidden = !latest;
  if (latest) {
    $("request-status").textContent = latest.status;
    $("request-status").className = `status-pill ${latest.status === "Fulfilled" ? "fulfilled" : "pending"}`;
    $("current-request-title").textContent = latest.status === "Fulfilled" ? "Tea fulfilled." : "Tea requested!";
    $("current-request-time").textContent = `Accepted ${dateLabel(latest.createdAt)}`;
    $("current-request-note").textContent = latest.status === "Fulfilled" ? "A job well steeped." : "The tea is officially owed.";
  }
  renderAdmin();
}

function submitRequest() {
  if (!canRequest()) { render(); toast("That request can't be accepted right now."); return; }
  data.requests.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: "Pending" });
  saveData(); render();
  $("request-heading").textContent = "CONTRACT IN EFFECT";
  $("request-description").textContent = "Request accepted. Tea is now contractually owed.";
  $("request-card").classList.add("activated", "just-accepted");
  requestButton.classList.remove("just-pressed");
  void requestButton.offsetWidth;
  requestButton.classList.add("just-pressed");
  window.setTimeout(() => {
    requestButton.classList.remove("just-pressed");
    $("request-card").classList.remove("just-accepted");
  }, 850);
  toast("Tea request accepted. The contract is active.");
}

function renderAdmin() {
  const today = todayRequests(), pending = data.requests.filter(r => r.status === "Pending"), fulfilled = data.requests.filter(r => r.status === "Fulfilled");
  $("metric-today").textContent = today.length; $("metric-pending").textContent = pending.length; $("metric-fulfilled").textContent = fulfilled.length;
  $("admin-availability").textContent = isOpen() ? "Open" : "Closed";
  $("admin-availability").className = `status-pill ${isOpen() ? "fulfilled" : "pending"}`;
  $("admin-availability-detail").textContent = `Requests are accepted between ${data.settings.open} and ${data.settings.close} UK time.`;
  $("open-time").value = data.settings.open; $("close-time").value = data.settings.close;
  $("cooldown-setting").value = data.settings.cooldown; $("limit-setting").value = data.settings.limit;
  $("pending-list").innerHTML = pending.length ? pending.slice().reverse().map(requestRow).join("") : '<p class="muted">No outstanding requests. A rare moment of peace.</p>';
  $("history-list").innerHTML = data.requests.length ? data.requests.slice().reverse().map(requestRow).join("") : '<p class="muted">No requests yet.</p>';
  renderStatistics();
}
function requestRow(r) {
  return `<div class="request-row"><div><strong><i class="fa-solid fa-mug-hot" aria-hidden="true"></i> Tea request · ${escapeHtml(r.status)}</strong><small>${dateLabel(r.createdAt)}</small></div>${r.status === "Pending" ? `<button data-fulfil="${r.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> Mark fulfilled</button>` : '<span class="status-pill fulfilled"><i class="fa-solid fa-check" aria-hidden="true"></i> Done</span>'}</div>`;
}
function markFulfilled(id) {
  const request = data.requests.find(r => r.id === id);
  if (!request || request.status !== "Pending") return;
  request.status = "Fulfilled"; request.fulfilledAt = new Date().toISOString(); saveData(); render(); toast("Request marked as fulfilled.");
}
function countRecent(days) { const cutoff = Date.now() - days * 86400000; return data.requests.filter(r => Date.parse(r.createdAt) >= cutoff).length; }
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()} W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2,"0")}`;
}
function renderStatistics() {
  const total = data.requests.length;
  const first = total ? Math.min(...data.requests.map(r => Date.parse(r.createdAt))) : Date.now();
  const elapsedDays = Math.max(1, (Date.now() - first) / 86400000);
  $("stat-total").textContent = total;
  $("stat-week").textContent = (total / (elapsedDays / 7)).toFixed(1);
  $("stat-month").textContent = (total / (elapsedDays / 30.4375)).toFixed(1);
  $("recent-week").textContent = (countRecent(30) / 30 * 7).toFixed(1);
  $("recent-month").textContent = (countRecent(90) / 90 * 30.4375).toFixed(1);
  const weeks = {}, months = {};
  data.requests.forEach(r => {
    const d = new Date(r.createdAt), week = isoWeek(d);
    const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "long" }).format(d);
    weeks[week] = (weeks[week] || 0) + 1; months[month] = (months[month] || 0) + 1;
  });
  const bestWeek = Object.entries(weeks).sort((a,b) => b[1]-a[1])[0], bestMonth = Object.entries(months).sort((a,b) => b[1]-a[1])[0];
  $("busiest-week").textContent = bestWeek ? `${bestWeek[0]} · ${bestWeek[1]} teas` : "—";
  $("busiest-month").textContent = bestMonth ? `${bestMonth[0]} · ${bestMonth[1]} teas` : "—";
  const days = Array.from({length:7}, (_,i) => { const d = new Date(); d.setDate(d.getDate() - (6-i)); return d; });
  const counts = days.map(d => data.requests.filter(r => ukDate(new Date(r.createdAt)) === ukDate(d)).length);
  const max = Math.max(1, ...counts);
  $("activity-chart").innerHTML = days.map((d,i) => `<div class="chart-day"><strong>${counts[i]}</strong><div class="chart-bar" style="height:${Math.max(4,counts[i]/max*78)}px"></div><small>${d.toLocaleDateString("en-GB",{weekday:"short"})}</small></div>`).join("");
}

function openAdmin() { $("request-view").hidden = true; $("admin-view").hidden = false; renderAdmin(); }
function closeAdmin() { $("admin-view").hidden = true; $("request-view").hidden = false; render(); }
function switchPanel(name) {
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("active", b.dataset.panel === name));
  document.querySelectorAll(".admin-panel").forEach(p => p.classList.toggle("active", p.id === `panel-${name}`));
}

requestButton.addEventListener("click", submitRequest);
$("admin-open").addEventListener("click", openAdmin);
$("admin-back").addEventListener("click", closeAdmin);
document.querySelectorAll(".admin-tab").forEach(b => b.addEventListener("click", () => switchPanel(b.dataset.panel)));
document.addEventListener("click", e => { const button = e.target.closest("[data-fulfil]"); if (button) markFulfilled(button.dataset.fulfil); });

$("settings-form").addEventListener("submit", e => {
  e.preventDefault();
  const open = $("open-time").value, close = $("close-time").value;
  const cooldown = Number($("cooldown-setting").value), limit = Number($("limit-setting").value);
  if (!open || !close || open === close || !Number.isInteger(cooldown) || cooldown < 1 || !Number.isInteger(limit) || limit < 1) {
    $("settings-feedback").textContent = "Please enter valid hours, cooldown and daily limit."; return;
  }
  data.settings = { open, close, cooldown, limit }; saveData();
  $("settings-feedback").textContent = "Rules saved in this browser."; render(); toast("Tea rules updated.");
});

$("notification-test").addEventListener("click", async () => {
  const feedback = $("notification-feedback");
  if (!("Notification" in window)) { feedback.textContent = "This browser does not support notifications."; return; }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") { feedback.textContent = "Notification permission was not granted."; return; }
  new Notification("Ginga Tea Requester", { body: "Notification test successful. The tea system is listening." });
  feedback.textContent = "Browser notification sent. This is a local preview, not remote push delivery.";
});

window.addEventListener("focus", render);
setInterval(render, 1000);
render();