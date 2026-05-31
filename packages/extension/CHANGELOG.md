# Changelog

All notable changes to the Repo Visualiser extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Chat-driven changes**: describe a change in plain language and Claude proposes
  it, with impact analysis. Each conversation has its own thread (Claude-Desktop-style
  sidebar); edit any message you sent to re-run from that point, and applied
  conversations keep going in the same session.
- **Method-level change review**: a changed file reads like Folder mode — its class
  with the methods that changed beneath it (green added / orange edited / red removed).
  Click a method to see its **before**, **after**, and **current on-disk** code as
  separate panes — never an interleaved diff.
- **Static complexity metrics** (Big-O, cyclomatic complexity, loop nesting, LOC)
  shown on a method in the Folder "Explain" drawer and in the change review.
- **Coding Preferences** form so generated code follows your house style.
- **Full-stack localisation** (EN/TR): the UI and Claude's generated text follow a
  single locale.

### Changed
- **Self-contained `.vsix`**: the extension now bundles the core analyzer and
  tree-sitter and ships its own grammars/webview assets, so it installs and runs on
  any machine with no `npm install` and no local server.
- The Tasks panel lists only currently running / queued work; "View in chat" jumps
  from a task or a change straight to its conversation.

### Removed
- The separate "Pending" tab and the git-based "committed changes" view.
- Raw unified-diff rendering and the per-region "ask/modify" box — change review is
  now method-level off a chat conversation.

## [0.1.0] - 2026-05-30

### Added
- Initial release: interactive repository map in a VS Code webview.
- **Graph mode** (folders as connection-sized nodes) and **Folder mode**
  (collapsible folder → type → behavior tree).
- Change tasks from the map (add / move / edit behavior, create file / folder)
  carried out by the user's own local Claude CLI.
- Language extractors for TypeScript/TSX, Java and C#, including type aliases and
  exported consts (TS), annotation types (Java) and delegates (C#).
- Kind badges aligned to the VS Code Dark+ symbol/type palette.
- Optional, off-by-default auto-processing of queued tasks.

[Unreleased]: https://github.com/berkcansavur/repo-visualiser/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/berkcansavur/repo-visualiser/releases/tag/v0.1.0
