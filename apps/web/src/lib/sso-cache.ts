/**
 * Returns whether a navigation can carry short-lived CampOS SSO state and must
 * bypass every runtime cache. The callback has the one-time code in its query
 * string; the error landing page is kept network-only as well so a stale error
 * response cannot be replayed after a later successful launch.
 */
export function isSensitiveSsoNavigation(url: URL, sameOrigin: boolean): boolean {
  if (!sameOrigin) return false;

  return (
    url.pathname === "/sso/callback" ||
    (url.pathname === "/launch" && url.searchParams.has("sso_error"))
  );
}
