const requests = {
  tea: {name:"Tea", description:"Request a cuppa.", icon:"fa-mug-hot", action:"Confirm request"},
  noms: {name:"Noms", description:"Request your crackers.", icon:"fa-cookie-bite", action:"Confirm request"},
  help: {name:"Help", description:"Ask me to come to you and help.", icon:"fa-hand-holding-heart", action:"Request help"},
  dog: {name:"Dog", description:"Choose what needs doing.", icon:"fa-paw", action:"Confirm dog request"},
  hugs: {name:"Hugs", description:"Ask me to come and give you a hug.", icon:"fa-heart", action:"Request a hug"},
  notify: {name:"Notify", description:"Let me know you're thinking of me.", icon:"fa-bell", action:"Send notification"},
  scratch: {name:"Scratch + Shoulders", description:"Ask for a massage and a scratch.", icon:"fa-hands", action:"Confirm request"},
  nits: {name:"Nit Nits", description:"Ask me to pick your spots.", icon:"fa-wand-magic-sparkles", action:"Confirm request"}
};

const modal = document.getElementById("request-modal");
const modalCard = modal.querySelector(".request-modal");
const modalTitle = document.getElementById("modal-title");
const modalDescription = document.getElementById("modal-description");
const modalIcon = document.getElementById("modal-icon");
const modalConfirm = document.getElementById("modal-confirm");
const modalOptions = document.getElementById("modal-options");
const dogChoice = document.getElementById("dog-choice");
const toast = document.getElementById("toast");
let activeRequest = null;
let toastTimer = null;
let previousFocus = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function openModal(type, sourceButton) {
  const request = requests[type];
  if (!request) return;
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
  if (previousFocus) previousFocus.focus({preventScroll:true});
}

document.querySelectorAll("[data-request]").forEach(button => {
  button.addEventListener("click", () => {
    button.classList.remove("is-pressed");
    void button.offsetWidth;
    button.classList.add("is-pressed");
    setTimeout(() => button.classList.remove("is-pressed"), 380);
    openModal(button.dataset.request, button);
  });
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

modalConfirm.addEventListener("click", () => {
  if (!activeRequest) return;
  const request = requests[activeRequest];
  const detail = activeRequest === "dog" ? ": " + dogChoice.value : "";
  const message = activeRequest === "notify"
    ? "Notification preview: " + request.name
    : request.name + " request preview" + detail;
  closeModal();
  showToast(message);
});
