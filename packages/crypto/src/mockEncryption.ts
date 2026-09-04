import { getSodium } from "./sodiumReady";

export const SECURITY_STUB_WARNING =
  "⚠️ MVP_ONLY — replace before production";

// ⚠️ These functions are NOT encryption. They base64-encode the plaintext and
// round-trip it.
//
// Nothing in the application encrypts with them any more — direct messages go
// through `directMessage.ts` and group/status payloads through
// `groupSenderKey.ts`. They survive for one reason: decoding history and
// messages from peers still on an older client, which would otherwise render
// as garbage.
//
// Exports are prefixed with `__UNSAFE_` so every call site has to spell out
// what it's doing, and a one-time warning fires in production so a new *write*
// path using them shows up in logs immediately.

const warnOnceInProduction = ((): (() => void) => {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    if (typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production") {
      // Surface to whatever logging the host has wired up; we intentionally
      // do not throw because real callers depend on this pre-Signal/MLS.
      // eslint-disable-next-line no-console
      console.warn(
        "[nada/crypto] __UNSAFE_mockEncryptMessage was called in production. " +
          "This is NOT real encryption — replace with Signal Sender Keys or MLS before launch."
      );
    }
  };
})();

export async function __UNSAFE_mockEncryptMessage(plaintext: string): Promise<string> {
  warnOnceInProduction();
  const sodium = await getSodium();
  return sodium.to_base64(
    sodium.from_string(plaintext),
    sodium.base64_variants.ORIGINAL
  );
}

export async function __UNSAFE_mockDecryptMessage(ciphertext: string): Promise<string> {
  warnOnceInProduction();
  const sodium = await getSodium();
  const bytes = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
  return sodium.to_string(bytes);
}
