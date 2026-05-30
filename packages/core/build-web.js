"use strict";

// Bundles the browser frontend (src/web/app.ts → dist/web/app.js) and copies the
// static assets. esbuild transpiles the TS; tsconfig.web.json type-checks it.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src", "web");
const OUT = path.join(__dirname, "dist", "web");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(SRC, "main.ts")],
    bundle: true,
    outfile: path.join(OUT, "app.js"),
    platform: "browser",
    format: "iife",
    target: "es2020",
    sourcemap: true,
    logLevel: "info",
  });
  for (const asset of ["index.html", "style.css"]) {
    fs.copyFileSync(path.join(SRC, asset), path.join(OUT, asset));
  }
  console.log("web bundle complete -> dist/web");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
