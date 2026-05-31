"use strict";

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  // Only `vscode` is host-provided. Everything else — the core analyzer/service AND
  // web-tree-sitter — is bundled in, so the packaged .vsix is self-contained and runs on a
  // machine that never ran `npm install`. The .wasm files can't be inlined into JS, so they
  // are copied next to the bundle (see copyAssets) and located at runtime via __dirname.
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

// Copy the runtime assets the bundle can't inline — the webview build and the tree-sitter
// .wasm grammars + runtime — into dist/, where extension.ts resolves them from __dirname.
function copyAssets() {
  const distDir = path.resolve(__dirname, "dist");
  const webOut = path.join(distDir, "web");
  const wasmOut = path.join(distDir, "wasm");
  fs.mkdirSync(webOut, { recursive: true });
  fs.mkdirSync(wasmOut, { recursive: true });

  const coreDir = path.dirname(require.resolve("repo-visualiser/package.json"));
  const coreWeb = path.join(coreDir, "dist", "web");
  for (const asset of fs.readdirSync(coreWeb)) {
    fs.copyFileSync(path.join(coreWeb, asset), path.join(webOut, asset));
  }

  const grammarsDir = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out");
  const grammars = [
    "tree-sitter-java.wasm",
    "tree-sitter-c_sharp.wasm",
    "tree-sitter-typescript.wasm",
    "tree-sitter-tsx.wasm",
  ];
  for (const grammar of grammars) {
    fs.copyFileSync(path.join(grammarsDir, grammar), path.join(wasmOut, grammar));
  }

  fs.copyFileSync(require.resolve("web-tree-sitter/tree-sitter.wasm"), path.join(wasmOut, "tree-sitter.wasm"));
  console.log("assets copied -> dist/web, dist/wasm");
}

async function main() {
  if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
    copyAssets();
    console.log("esbuild: watching for changes…");
  } else {
    await esbuild.build(options);
    copyAssets();
    console.log("esbuild: build complete");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
