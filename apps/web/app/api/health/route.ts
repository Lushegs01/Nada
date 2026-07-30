const HEALTH_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

/**
 * Cheap web-process probe for CampOS launch prewarming. Relay/database health
 * remains separately observable; an SSO click only needs the web receiver up.
 */
export function GET(): Response {
  return new Response(null, { status: 204, headers: HEALTH_HEADERS });
}

export const HEAD = GET;
