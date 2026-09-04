const NADA_ORIGIN = self.location.origin;

/**
 * Resolves a URL from a push payload against this app's own origin.
 *
 * A notification click navigates wherever this points, so an unchecked value
 * from a payload is an open redirect wearing NADA's icon. Push payloads are
 * VAPID-signed and only the relay can produce one, but "only our server can
 * exploit this" is not a property worth relying on — anything that fails to
 * resolve to this origin falls back to the app root.
 */
function safeAppUrl(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return NADA_ORIGIN + "/";
  }
  try {
    const resolved = new URL(candidate, NADA_ORIGIN);
    return resolved.origin === NADA_ORIGIN ? resolved.toString() : NADA_ORIGIN + "/";
  } catch {
    return NADA_ORIGIN + "/";
  }
}

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
      const url = safeAppUrl(data.url);
      const clientsList = await clients.matchAll({
        includeUncontrolled: true,
        type: "window"
      });
      const focusedClient = clientsList.find((client) => client.focused);

      if (focusedClient) {
        // The user is already looking at NADA. Hand the event to the app so it
        // can surface its own in-app notification, rather than dropping it —
        // a swallowed push is an event the user never learns about at all.
        focusedClient.postMessage({
          type: "NADA_PUSH",
          chatId: data.chatId ?? null,
          kind: data.kind ?? "message",
          title,
          body: data.body ?? ""
        });
        return;
      }

      await self.registration.showNotification(title, {
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
      });
    } catch (err) {
      // The payload itself is never logged: it carries a chat id and a sender.
      console.error("NADA: failed to handle push event", err && err.name);
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = safeAppUrl(data.url);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(NADA_ORIGIN) && "focus" in client) {
            // Focusing an open tab leaves it on whatever screen it was
            // showing, so tell the app which conversation the user tapped.
            // Without this, tapping a message notification lands them
            // somewhere unrelated and they have to find the chat themselves.
            client.postMessage({
              type: "NADA_NOTIFICATION_CLICK",
              chatId: data.chatId ?? null,
              kind: data.kind ?? "message"
            });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
