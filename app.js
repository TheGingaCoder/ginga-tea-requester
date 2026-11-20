import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://goqdqneuwaxoyxyopfdl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ri3ecPVbIE9gsrvggZm-pQ_DeKQ1mUZ";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const requestDefinitions = {
  tea: { name: "Tea", description: "Request a cuppa.", icon: "fa-mug-hot", action: "Tea requested" },
  noms: { name: "Noms", description: "Request your crackers.", icon: "fa-cookie-bite", action: "Noms requested" },
  help: { name: "Help", description: "Ask Luke to come to you and help.", icon: "fa-hand-holding-heart", action: "Help requested" },
  dog: { name: "Dog", description: "Choose what needs doing.", icon: "fa-paw", action: "Dog request sent" },
  hugs: { name: "Hugs", description: "Ask Luke to come and give you a hug.", icon: "fa-heart", action: "Hug requested" },
  notify: { name: "Notify", description: "Let Luke know you're thinking of him.", icon: "fa-bell", action: "Notification sent" },
  scratch: { name: "Scratch + Shoulders", description: "Ask Luke for a massage and a scratch.", icon: "fa-hands", action: "Scratch + Shoulders requested" },
  nits: { name: "Nit Nits", description: "Ask Luke to pick Luke's spots.", icon: "fa-wand-magic-sparkles", action: "Nit Nits requested" }
};

const statusCopy = {
  active: { title: "SYSTEM ACTIVE", message: "Requests are currently available." },
  sleep: { title: "SYSTEM STANDBY", message: "The Ginger Is Asleep" },
  college: { title: "SYSTEM LOCKED", message: "The Ginger Is At College" },
  away: { title: "SYSTEM INACTIVE", message: "The Ginger Is Not Home" },
  unavailable: { title: "SYSTEM UNAVAILABLE", message: "GingaHelp cannot confirm its current status." }
};

const $ = id => document.getElementById(id);
const modal = $("request-modal");
const modalCard = modal.querySelector(".request-modal");
const modalTitle = $("modal-title");
const modalDescription = $("modal-description");
const modalIcon = $("modal-icon");
const modalConfirm = $("modal-confirm");
const modalOptions = $("modal-options");
const dogChoice = $("dog-choice");
const toast = $("toast");
const statusScreen = $("status-screen");
const statusTitle = $("status-title");
const statusMessage = $("status-message");
const statusNotifyButton = $("status-notify");

let activeRequest = null;
let activeStatus = null;
let toastTimer = null;
let previousFocus = null;

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle("toast-error", error);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function applyStatus(status) {
  activeStatus = statusCopy[status] ? status : "unavailable";
  const copy = statusCopy[activeStatus];
  const isActive = activeStatus === "active";
  statusScreen.hidden = isActive;
  statusTitle.textContent = copy.title;
  statusMessage.textContent = copy.message;
  statusScreen.dataset.status = activeStatus;
  const canNotify = activeStatus === "college" || activeStatus === "away";
  statusNotifyButton.hidden = !canNotify;
  document.querySelectorAll("[data-request]").forEach(button => {
    button.disabled = !isActive;
  });
  if (!isActive && !modal.hidden && !(activeRequest === "notify" && canNotify)) closeModal();
}

async function loadStatus() {
  const { data, error } = await supabase
    .from("gingahelp_status")
    .select("status")
    .eq("id", 1)
    .single();

  if (error || !data) {
    applyStatus("unavailable");
    console.error("Could not load GingaHelp status:", error);
    return;
  }
  applyStatus(data.status);
}

const statusChannel = supabase
  .channel("gingahelp-public-status")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "gingahelp_status",
    filter: "id=eq.1"
  }, payload => {
    const nextStatus = payload.new?.status;
    if (nextStatus) applyStatus(nextStatus);
  })
  .subscribe();

function openModal(type, sourceButton) {
  const request = requestDefinitions[type];
  const canSend = activeStatus === "active" || (type === "notify" && ["college", "away"].includes(activeStatus));
  if (!request || !canSend) return;

  activeRequest = type;
  previousFocus = sourceButton;
  modalCard.className = "request-modal " + type;
  modalTitle.textContent = request.name;
  modalDescription.textContent = request.description;
  modalIcon.innerHTML = '<i class="fa-solid ' + request.icon + '" aria-hidden="true"></i>';
  modalConfirm.textContent = request.action;
  modalOptions.hidden = type !== "dog";
  if (type === "dog") dogChoice.selectedIndex = 0;
  modal.hidden = false;
  modalConfirm.focus();
}

function closeModal() {
  modal.hidden = true;
  activeRequest = null;
  modalConfirm.disabled = false;
  if (previousFocus && !previousFocus.disabled && !previousFocus.hidden) previousFocus.focus({ preventScroll: true });
}

document.querySelectorAll("[data-request]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    button.classList.remove("is-pressed");
    void button.offsetWidth;
    button.classList.add("is-pressed");
    setTimeout(() => button.classList.remove("is-pressed"), 380);
    openModal(button.dataset.request, button);
  });
});

statusNotifyButton.addEventListener("click", () => openModal("notify", statusNotifyButton));

$("modal-close").addEventListener("click", closeModal);
$("modal-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

modalConfirm.addEventListener("click", async () => {
  const canSend = activeStatus === "active" || (activeRequest === "notify" && ["college", "away"].includes(activeStatus));
  if (!activeRequest || !canSend) return;

  const type = activeRequest;
  const detail = type === "dog" ? dogChoice.value : "";
  const request = requestDefinitions[type];
  modalConfirm.disabled = true;
  modalConfirm.textContent = "SENDING...";

  try {
    const { data, error } = await supabase.functions.invoke("gingahelp-send-notification", {
      body: { type, detail }
    });
    if (error) throw new Error(data?.error || error.message || "Could not send the request.");
    if (!data?.sent) throw new Error(data?.message || "No notification device received the request.");
    closeModal();
    showToast(request.action + ". Luke has been notified.");
  } catch (error) {
    modalConfirm.disabled = false;
    modalConfirm.textContent = request.action;
    showToast(error.message || "The request could not be sent.", true);
  }
});

applyStatus("unavailable");
loadStatus();
window.addEventListener("beforeunload", () => {
  supabase.removeChannel(statusChannel);
});
