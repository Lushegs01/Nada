import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The workspace installs with node-linker=hoisted + symlink=false, so
// @nada/* packages are not resolvable through node_modules. Alias them to
// their sources the same way this app's tsconfig paths do.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@nada/crypto": fileURLToPath(new URL("../../packages/crypto/src/index.ts", import.meta.url)),
      "@nada/db": fileURLToPath(new URL("../../packages/db/src/index.ts", import.meta.url)),
      "@nada/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
      "@nada/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url))
    }
  },
  test: {
    // Playwright owns `*.spec.ts` (its config matches exactly that), Vitest
    // owns `*.test.ts`. Naming individual files here meant every new browser
    // spec had to remember to add itself, and the one that forgot died on
    // "Cannot redefine property: Symbol($$jest-matchers-object)" — two test
    // runners' expect() in one process.
    exclude: ["**/*.spec.ts", "node_modules/**"]
  }
});
