"use strict";

const path = require("path");

const WASM_DIR = path.join(
  require.resolve("tree-sitter-wasms/package.json"),
  "..",
  "out"
);

// Registry of supported languages.
// `extractor` is the module name under ./extractors that knows how to read
// the tree-sitter AST for that grammar. Adding a new language = drop a wasm
// into tree-sitter-wasms, add an extractor, and register it here.
const LANGUAGES = {
  java: {
    id: "java",
    extensions: [".java"],
    wasm: path.join(WASM_DIR, "tree-sitter-java.wasm"),
    extractor: "java",
  },
  csharp: {
    id: "csharp",
    extensions: [".cs"],
    wasm: path.join(WASM_DIR, "tree-sitter-c_sharp.wasm"),
    extractor: "csharp",
  },
  typescript: {
    id: "typescript",
    extensions: [".ts", ".mts", ".cts"],
    wasm: path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
    extractor: "typescript",
  },
  tsx: {
    id: "tsx",
    extensions: [".tsx"],
    wasm: path.join(WASM_DIR, "tree-sitter-tsx.wasm"),
    extractor: "typescript",
  },
};

const EXTENSION_TO_LANGUAGE = (() => {
  const map = {};
  for (const language of Object.values(LANGUAGES)) {
    for (const extension of language.extensions) {
      map[extension] = language;
    }
  }
  return map;
})();

function languageForFile(filePath) {
  return EXTENSION_TO_LANGUAGE[path.extname(filePath).toLowerCase()] || null;
}

module.exports = { LANGUAGES, languageForFile };
