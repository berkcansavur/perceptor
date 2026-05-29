#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn } = require("child_process");

const { analyzeToFile } = require("../analyzer");
const { startServer } = require("../server");

function parseArguments(argv) {
  const options = {
    rootDirectory: process.cwd(),
    port: 4173,
    analyzeOnly: false,
    serveOnly: false,
    open: true,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--analyze-only") options.analyzeOnly = true;
    else if (argument === "--serve-only") options.serveOnly = true;
    else if (argument === "--no-open") options.open = false;
    else if (argument === "--port") options.port = Number(argv[++i]);
    else positional.push(argument);
  }
  if (positional[0]) options.rootDirectory = path.resolve(positional[0]);
  return options;
}

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";
  spawn(command, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  // In serve-only mode (e.g. Docker), skip the initial scan — the user picks a
  // repo from the UI via "Open Folder", which keeps a broad workspace mount fast.
  if (!options.serveOnly) {
    process.stdout.write(`Analyzing ${options.rootDirectory} …\n`);
    const { graph, outputPath } = await analyzeToFile(options.rootDirectory);
    process.stdout.write(
      `Found ${graph.stats.classes} classes, ${graph.stats.edges} edges across ${graph.stats.files} files.\n`
    );
    process.stdout.write(`Graph written to ${outputPath}\n`);
  }

  if (options.analyzeOnly) return;

  const { port } = await startServer({
    rootDirectory: options.rootDirectory,
    port: options.port,
  });
  const url = `http://localhost:${port}`;
  process.stdout.write(`\nRepo Visualiser running at ${url}\n(Press Ctrl+C to stop)\n`);
  if (options.open) openBrowser(url);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
