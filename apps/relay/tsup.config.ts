import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  noExternal: ["@nada/db", "@nada/types"],
  sourcemap: true
});
