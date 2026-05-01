export function getRelaySocketUrl(): string | undefined {
  const configured = process.env["NEXT_PUBLIC_RELAY_URL"]?.trim();
  if (!configured) {
    return undefined;
  }

  const candidate =
    configured.startsWith("ws://") || configured.startsWith("wss://")
      ? configured
      : configured.startsWith("http://") || configured.startsWith("https://")
        ? configured.replace(/^http/, "ws")
        : `wss://${configured}`;

  const url = new URL(candidate);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/ws";
  }

  return url.toString();
}

export function getRelayHttpBaseUrl(): string | undefined {
  const configured = process.env["NEXT_PUBLIC_RELAY_URL"]?.trim();
  if (!configured) {
    return undefined;
  }

  const candidate =
    configured.startsWith("ws://") || configured.startsWith("wss://")
      ? configured.replace(/^ws/, "http")
      : configured.startsWith("http://") || configured.startsWith("https://")
        ? configured
        : `https://${configured}`;
  const url = new URL(candidate);
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString();
}
