import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The workspace installs with node-linker=hoisted + symlink=false, so
// @nada/* packages are not resolvable through node_modules. Alias them to
// their sources the same way the web app's tsconfig paths do.
export default defineConfig({
  resolve: {
    alias: {
      "@nada/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
      "@nada/db": fileURLToPath(new URL("../../packages/db/src/index.ts", import.meta.url)),
      // Test-only: the end-to-end test encrypts and decrypts with the same
      // primitives the client uses, so it proves the wire format survives the
      // relay rather than asserting the relay forwards an opaque string.
      "@nada/crypto": fileURLToPath(new URL("../../packages/crypto/src/index.ts", import.meta.url))
    }
  }
});
