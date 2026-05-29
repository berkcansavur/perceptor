"use strict";

const fs = require("fs");
const path = require("path");
const { languageForFile } = require("./languages");

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".gradle",
  ".idea",
  ".vscode",
  "build",
  "out",
  "dist",
  "bin",
  "obj",
  "target",
  "Library",
  "Temp",
  "Logs",
  "Obj",
  ".visualise",
]);

function collectSourceFiles(rootDirectory) {
  const sourceFiles = [];

  function visit(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        visit(fullPath);
      } else if (entry.isFile() && languageForFile(fullPath)) {
        sourceFiles.push(fullPath);
      }
    }
  }

  visit(rootDirectory);
  return sourceFiles;
}

module.exports = { collectSourceFiles };
