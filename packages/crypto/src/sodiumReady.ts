// @ts-nocheck
// @ts-ignore
import * as libsodium from "libsodium-wrappers-sumo";

let sodiumInstance: any = null;
let sodiumReadyPromise: Promise<any> | null = null;

export async function getSodium(): Promise<any> {
  if (sodiumInstance) {
    return sodiumInstance;
  }

  if (!sodiumReadyPromise) {
    const sodium = (libsodium as any).default || libsodium;
    sodiumReadyPromise = sodium.ready.then(() => {
      sodiumInstance = sodium;
      return sodium;
    });
  }

  return sodiumReadyPromise;
}
