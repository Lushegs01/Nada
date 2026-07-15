/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { isSensitiveSsoNavigation } from "./lib/sso-cache";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Runtime routes are considered in order. This must precede `defaultCache`,
// whose HTML strategy would otherwise persist `/sso/callback?code=...`.
const sensitiveSsoNavigationNetworkOnly = {
  matcher: ({ sameOrigin, url }) => isSensitiveSsoNavigation(url, sameOrigin),
  handler: async ({ request }) => fetch(request)
} satisfies RuntimeCaching;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [sensitiveSsoNavigationNetworkOnly, ...defaultCache],
});

serwist.addEventListeners();

// Load the custom NADA background sync logic
importScripts("/worker-bootstrap.js");
