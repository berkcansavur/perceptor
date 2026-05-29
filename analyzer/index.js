"use strict";

const fs = require("fs");
const path = require("path");
const Parser = require("web-tree-sitter");

const { LANGUAGES, languageForFile } = require("./languages");
const { collectSourceFiles } = require("./walk");

const loadedLanguages = new Map();
const loadedExtractors = new Map();

async function languageGrammar(language) {
  if (!loadedLanguages.has(language.id)) {
    loadedLanguages.set(language.id, await Parser.Language.load(language.wasm));
  }
  return loadedLanguages.get(language.id);
}

function extractorFor(language) {
  if (!loadedExtractors.has(language.id)) {
    loadedExtractors.set(language.id, require(`./extractors/${language.extractor}`));
  }
  return loadedExtractors.get(language.id);
}

function buildEdges(nodes) {
  const idsByName = new Map();
  for (const node of nodes) {
    if (!idsByName.has(node.name)) idsByName.set(node.name, []);
    idsByName.get(node.name).push(node.id);
  }

  // Collapse to one edge per (source, target) pair. Constructor injection
  // usually shows up as both a final field and a constructor param; we keep a
  // single edge and prefer "constructor" since it is the stronger signal.
  const pairKinds = new Map();
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      const targets = idsByName.get(dependency.baseType);
      if (!targets) continue; // external type (String, List, MonoBehaviour, ...)
      for (const targetId of targets) {
        if (targetId === node.id) continue;
        const key = `${node.id}->${targetId}`;
        const existing = pairKinds.get(key);
        if (!existing) {
          pairKinds.set(key, { source: node.id, target: targetId, kind: dependency.source });
        } else if (dependency.source === "constructor") {
          existing.kind = "constructor";
        }
      }
    }
  }

  const edges = [];
  for (const edge of pairKinds.values()) {
    edges.push({ id: `e${edges.length}`, source: edge.source, target: edge.target, kind: edge.kind });
  }
  return edges;
}

async function analyze(rootDirectory) {
  await Parser.init();
  const parser = new Parser();

  const sourceFiles = collectSourceFiles(rootDirectory);
  const nodes = [];
  const byLanguage = {};

  for (const filePath of sourceFiles) {
    const language = languageForFile(filePath);
    if (!language) continue;

    let sourceCode;
    try {
      sourceCode = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    parser.setLanguage(await languageGrammar(language));
    let tree;
    try {
      tree = parser.parse(sourceCode);
    } catch {
      continue;
    }

    const relativeFile = path.relative(rootDirectory, filePath).split(path.sep).join("/");
    const directory = relativeFile.includes("/")
      ? relativeFile.slice(0, relativeFile.lastIndexOf("/"))
      : ".";
    const folder = directory === "." ? "(root)" : directory.slice(directory.lastIndexOf("/") + 1);
    const classes = extractorFor(language).extract(tree.rootNode, relativeFile);
    for (const parsedClass of classes) {
      nodes.push({
        id: `${relativeFile}::${parsedClass.name}`,
        name: parsedClass.name,
        kind: parsedClass.kind,
        language: language.id,
        file: parsedClass.file,
        dir: directory,
        folder,
        line: parsedClass.line,
        behaviors: parsedClass.behaviors,
        dependencies: parsedClass.dependencies,
      });
    }
    byLanguage[language.id] = (byLanguage[language.id] || 0) + 1;
  }

  const edges = buildEdges(nodes);

  return {
    generatedAt: new Date().toISOString(),
    root: rootDirectory,
    stats: {
      files: sourceFiles.length,
      classes: nodes.length,
      edges: edges.length,
      byLanguage,
    },
    nodes,
    edges,
  };
}

function outputPath(rootDirectory) {
  return path.join(rootDirectory, ".visualise", "graph.json");
}

async function analyzeToFile(rootDirectory) {
  const graph = await analyze(rootDirectory);
  const target = outputPath(rootDirectory);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(graph, null, 2));
  return { graph, outputPath: target };
}

module.exports = { analyze, analyzeToFile, outputPath, LANGUAGES };
