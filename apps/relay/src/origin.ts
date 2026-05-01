export function normalizeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/\/$/, "");
  }
}

export function isOriginAllowed(origin: string | undefined, allowed: string): boolean {
  if (!origin) {
    return false;
  }

  return normalizeHost(origin) === normalizeHost(allowed);
}
