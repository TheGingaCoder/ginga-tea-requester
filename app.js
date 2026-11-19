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


/* Home-location access control */
const HOME_STORAGE_KEY = "gingahelp.homeLocation";
const HOME_RADIUS_METRES = 150;
const setupScreen = document.getElementById("location-setup");
const lockoutScreen = document.getElementById("location-lockout");
const setupButton = document.getElementById("set-home-location");
const setupFeedback = document.getElementById("setup-feedback");
const lockoutTitle = document.getElementById("lockout-title");
const lockoutMessage = document.getElementById("lockout-message");
const appRoot = document.querySelector("main.app");
let homeLocation = null;
let locationWatchId = null;

function showSetup(message = "") {
  appRoot.hidden = true;
  lockoutScreen.hidden = true;
  setupScreen.hidden = false;
  setupFeedback.textContent = message;
}
function showLockout(title = "SYSTEM INACTIVE", message = "The Ginger Is Not Home") {
  appRoot.hidden = true;
  setupScreen.hidden = true;
  lockoutTitle.textContent = title;
  lockoutMessage.textContent = message;
  lockoutScreen.hidden = false;
}
function showApplication() {
  setupScreen.hidden = true;
  lockoutScreen.hidden = true;
  appRoot.hidden = false;
}
function distanceInMetres(a, b) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const value = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function handleLocation(position) {
  if (!homeLocation) {
    showSetup("Home location has not been set.");
    return;
  }
  const current = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
  if (distanceInMetres(homeLocation, current) <= HOME_RADIUS_METRES) {
    showApplication();
  } else {
    showLockout();
  }
}
function handleLocationError(error) {
  const messages = {
    1: "Location permission is required. Enable it in your browser settings.",
    2: "Your location could not be determined. Try again when location is available.",
    3: "Location check timed out. Please try again."
  };
  showLockout("LOCATION UNAVAILABLE", messages[error.code] || "GingaHelp cannot verify that this device is at home.");
}
function startLocationMonitoring() {
  if (!navigator.geolocation) {
    showLockout("LOCATION UNAVAILABLE", "This device does not support location services.");
    return;
  }
  if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
  showLockout("CHECKING LOCATION", "GingaHelp is verifying this device's location.");
  locationWatchId = navigator.geolocation.watchPosition(
    handleLocation,
    handleLocationError,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}
setupButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setupFeedback.textContent = "This device does not support location services.";
    return;
  }
  setupButton.disabled = true;
  setupButton.textContent = "DETECTING LOCATION...";
  setupFeedback.textContent = "Allow location access when prompted.";
  navigator.geolocation.getCurrentPosition(position => {
    homeLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    try {
      localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(homeLocation));
      setupButton.textContent = "HOME LOCATION SAVED";
      setupFeedback.textContent = "Checking this device is at home...";
      startLocationMonitoring();
    } catch {
      setupButton.disabled = false;
      setupButton.textContent = "SET HOME LOCATION";
      setupFeedback.textContent = "Could not save the home location on this device.";
    }
  }, error => {
    setupButton.disabled = false;
    setupButton.textContent = "SET HOME LOCATION";
    setupFeedback.textContent = error.code === 1
      ? "Location permission was denied. Allow it and try again."
      : "Could not detect your location. Please try again.";
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
});
try {
  const savedHome = localStorage.getItem(HOME_STORAGE_KEY);
  if (savedHome) {
    const parsed = JSON.parse(savedHome);
    if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
      homeLocation = parsed;
      startLocationMonitoring();
    } else {
      localStorage.removeItem(HOME_STORAGE_KEY);
      showSetup();
    }
  } else {
    showSetup();
  }
} catch {
  showSetup("Location storage is unavailable in this browser.");
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && homeLocation) startLocationMonitoring();
});
