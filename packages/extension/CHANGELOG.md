# Changelog

All notable changes to the Repo Visualiser extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Chat-driven changes**: describe a change in plain language; Claude proposes a
  diff you approve, with per-region "ask/modify" and impact analysis.
- **Pending vs Changes tabs**: Pending shows this session's not-yet-committed work;
  Changes shows committed work (git-based). Archive sets individually or Clear a tab.
- **Whole-repo map**: every file becomes a node — class-less code as a *module*
  node (top-level functions), plus *config* (package.json scripts, Dockerfile
  stages) and *file* nodes; class-less files are icon-marked in the graph card.
- **Coding Preferences** form so generated code follows your house style.
- **Full-stack localisation** (EN/TR): the UI and Claude's generated text follow a
  single locale.

### Fixed
- Method "Explain" now polls for and shows Claude's summary.
- Live "what Claude is doing" status in the Tasks panel.
- Correct git commit detection when the folder is a subdirectory of a larger repo.

### Changed
- Packaged `.vsix` slimmed to the shipped grammars (~1 MB).

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
