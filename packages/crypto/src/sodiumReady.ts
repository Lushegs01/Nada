// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import * as libsodium from "libsodium-wrappers-sumo";

let sodiumInstance: typeof libsodium | null = null;
let sodiumReadyPromise: Promise<typeof libsodium> | null = null;

export async function getSodium(): Promise<typeof libsodium> {
  if (sodiumInstance) {
    return sodiumInstance;
  }

  if (!sodiumReadyPromise) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const sodium = (libsodium as any).default || libsodium;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    sodiumReadyPromise = sodium.ready.then(() => {
      sodiumInstance = sodium;
      return sodium;
    });
  }

  return sodiumReadyPromise;
}
