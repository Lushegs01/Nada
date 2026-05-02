const NADA_ORIGIN = self.location.origin;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "NADA_ORIGIN_REQUEST") {
    event.source?.postMessage({
      type: "NADA_ORIGIN",
      origin: NADA_ORIGIN
    });
  }
});

self.addEventListener("push", (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || "Nada Messaging";
      const options = {
        body: data.body || "You have a new message.",
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        data: {
          url: NADA_ORIGIN
        }
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
      console.error("Error parsing push payload", err);
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === NADA_ORIGIN + "/" && "focus" in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(NADA_ORIGIN + "/");
      }
    })
  );
});
