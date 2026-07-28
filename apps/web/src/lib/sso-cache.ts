/**
 * Returns whether a navigation can carry short-lived CampOS SSO state and must
 * bypass every runtime cache. The callback has the one-time code in its query
 * string; the error landing page is kept network-only as well so a stale error
 * response cannot be replayed after a later successful launch. The CampOS
 * administrator workspace is cookie-authenticated and tenant-specific, so it
 * must never enter a shared service-worker runtime cache either.
 */
export function isSensitiveSsoNavigation(url: URL, sameOrigin: boolean): boolean {
  if (!sameOrigin) return false;

  return (
    url.pathname === "/sso/callback" ||
    (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) ||
    (url.pathname === "/launch" && url.searchParams.has("sso_error"))
  );
}
