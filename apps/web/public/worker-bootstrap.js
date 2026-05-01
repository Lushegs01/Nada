const NADA_ORIGIN = self.location.origin;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "NADA_ORIGIN_REQUEST") {
    event.source?.postMessage({
      type: "NADA_ORIGIN",
      origin: NADA_ORIGIN
    });
  }
});
