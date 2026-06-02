#!/usr/bin/env node
import * as path from "path";
import { analyzeToFile } from "./core";
import { resolveInstalledAssets } from "./core/installedAssets";

const HELP_TEXT = `perceptor-core — dependency/behavior map analyzer

Usage:
  visualise [path]

Writes <path>/.visualise/graph.json. The interactive map lives in the
"Perceptor" VS Code extension (Cmd+Shift+P → "Perceptor: Open").

Arguments:
  path           Repository to analyze (default: current directory)

Options:
  -h, --help     Show this help
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    return;
  }
  const positional = args.find((argument) => !argument.startsWith("-"));
  const rootDirectory = positional ? path.resolve(positional) : process.cwd();

  process.stdout.write(`Analyzing ${rootDirectory} …\n`);
  const { graph, outputPath } = await analyzeToFile(rootDirectory, resolveInstalledAssets());
  process.stdout.write(
    `Found ${graph.stats.classes} classes, ${graph.stats.edges} edges across ${graph.stats.files} files.\n`
  );
  process.stdout.write(`Graph written to ${outputPath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
