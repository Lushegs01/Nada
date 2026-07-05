import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The workspace installs with node-linker=hoisted + symlink=false, so
// @nada/* packages are not resolvable through node_modules. Alias them to
// their sources the same way the web app's tsconfig paths do.
export default defineConfig({
  resolve: {
    alias: {
      "@nada/types": fileURLToPath(new URL("../types/src/index.ts", import.meta.url))
    }
  }
});
