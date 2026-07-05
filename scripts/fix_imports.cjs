const path = require("path");
const { Project } = require(path.join(__dirname, "..", "_ts_morph_tmp", "node_modules", "ts-morph"));

async function run() {
  const project = new Project({
    tsConfigFilePath: "apps/web/tsconfig.json",
  });
  
  const nadaApp = project.getSourceFile("apps/web/src/components/NadaApp.tsx");
  if (nadaApp) {
    nadaApp.fixMissingImports();
  }

  // Also fix all other files
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getFilePath().includes("apps/web/src/components/")) {
      sourceFile.fixMissingImports();
    }
  }

  await project.save();
  console.log("Done fixing imports.");
}
run().catch(console.error);
