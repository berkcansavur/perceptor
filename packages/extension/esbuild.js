"use strict";

const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  // vscode is provided by the host; the core package (analyzer+server) stays an
  // external runtime dependency because it loads tree-sitter wasm at runtime.
  external: ["vscode", "repo-visualiser"],
  sourcemap: true,
  logLevel: "info",
};

async function main() {
  if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log("esbuild: watching for changes…");
  } else {
    await esbuild.build(options);
    console.log("esbuild: build complete");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
