export interface SignalAdapterStatus {
  available: boolean;
  implementation: "signal-wasm";
  moduleExports: string[];
}

export async function loadSignalAdapter(): Promise<SignalAdapterStatus> {
  const signalModule = await import("@signalapp/libsignal-client");

  return {
    available: true,
    implementation: "signal-wasm",
    moduleExports: Object.keys(signalModule).sort()
  };
}
