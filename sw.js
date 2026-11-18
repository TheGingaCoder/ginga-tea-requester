self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = {body: event.data ? event.data.text() : "A new tea request has arrived."}; }
  const title = payload.title || "Ginga Tea Requester";
  const options = {
    body: payload.body || "A new tea request has arrived. The kettle awaits.",
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: "ginga-tea-request",
    renotify: true,
    data: {url: payload.url || "./"}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const client of clientsList) {
      if (client.url.startsWith(self.registration.scope) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});