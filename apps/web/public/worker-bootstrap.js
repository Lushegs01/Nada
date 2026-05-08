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
  if (!event.data) return;

  event.waitUntil((async () => {
    try {
      const data = event.data.json();
      const title = data.title || "NADA";
      const url = data.url || NADA_ORIGIN + "/";
      const clientsList = await clients.matchAll({
        includeUncontrolled: true,
        type: "window"
      });
      const focusedClient = clientsList.find((client) => client.focused);

      if (focusedClient) {
        return;
      }

      const options = {
        body: data.body || "You have a new private update.",
        icon: "/logo.png",
        badge: "/logo.png",
        tag: data.tag || data.chatId || data.kind || "nada",
        renotify: data.kind === "call",
        requireInteraction: Boolean(data.requireInteraction || data.kind === "call"),
        silent: false,
        data: {
          chatId: data.chatId || null,
          kind: data.kind || "message",
          url
        },
        actions: data.kind === "call"
          ? [{ action: "open", title: "Open call" }]
          : []
      };

      await self.registration.showNotification(title, options);
    } catch (err) {
      console.error("Error parsing push payload", err);
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || NADA_ORIGIN + "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.startsWith(NADA_ORIGIN) && "focus" in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
