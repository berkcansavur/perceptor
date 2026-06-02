# Changelog

All notable changes to the Perceptor extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-02

Initial release.

### Added
- **Interactive repository map** in a VS Code webview: **Graph mode** (folders as
  connection-sized circle nodes, dependencies as edges, force layout) and **Folder mode**
  (collapsible folder → type → behavior tree) with a per-method detail panel.
- **Language extractors** for TypeScript/TSX, Java and C# — class, interface, enum, type
  alias and exported const (TS), record and annotation type (Java), struct and delegate
  (C#). Kind badges aligned to the VS Code Dark+ symbol/type palette.
- **Method insight**: static **complexity** metrics (Big-O, cyclomatic complexity, loop
  nesting, LOC) and **data-access risk** signals (N+1, `SELECT *`, unbounded finds,
  leading wildcards, many joins…) read straight off each method.
- **Run-flow storyboard**: a static, source-derived account of how a method runs — the
  inputs it receives, the branches it takes (`if`/`else`, nested), every call it makes
  (callee, arguments, captured result, `await`), what it throws and what it returns.
  Press **Play** to reveal it step by step, plus an editable **payload simulator**
  (Fields or Raw JSON) that lights up only the branch path a given payload takes.
- **Explain**: ask your own local Claude for a complete plain-English explanation of a
  method, inline in its detail panel.
- **Chat-driven changes**: describe a change in plain language and Claude proposes it
  with impact analysis. Each conversation has its own thread (Claude-Desktop-style
  sidebar); edit any message you sent to re-run from that point.
- **Method-level change review**: a changed file reads like Folder mode — its class with
  the changed methods beneath it (green added / orange edited / red removed). Click a
  method to see its **before**, **after** and **current on-disk** code as separate panes.
- **Change tasks** from the map (add / move / edit a behavior, create files & folders),
  carried out by your own local Claude CLI; optional, off-by-default auto-processing.
- **Coding Preferences** form so generated code follows your house style.
- **Full-stack localisation** (EN/TR): the UI and Claude's generated text follow a
  single locale.
- **Self-contained `.vsix`**: bundles the core analyzer, tree-sitter and its own
  grammars/webview assets, so it installs and runs on any machine with no `npm install`
  and no local server. Everything runs locally with your own Claude tokens.

[Unreleased]: https://github.com/berkcansavur/perceptor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/berkcansavur/perceptor/releases/tag/v0.1.0
