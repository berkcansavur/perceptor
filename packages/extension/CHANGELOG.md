# Changelog

All notable changes to the Perceptor extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-06-06

### Added
- **Inline Edit (`Cmd+Shift+I`)**: select code in the editor and press the
  shortcut to open a Perceptor chat thread right next to the selected lines —
  built on the VS Code CommentController API. Selected lines are highlighted
  with a blue accent border (`#6aa1ff`).
- **Inline Edit buttons**: Submit, Stop, Close, Attach File, Remove Attached
  File, View in Chat — each shown/hidden based on the current process state
  via context keys.
- **Inline Edit animation**: `⚡ Percepting...` text-only animation with no
  flicker or restart glitches.
- **@ file reference (inline)**: type `@filename.ts` in the inline reply box
  and submit — the name is resolved to its full graph path via tail-match
  (`resolveToGraphPath`). Files can also be attached via the Attach File
  QuickPick button.
- **@ file reference (chat)**: type `@` in the main chat to get an
  autocomplete popup; navigate with arrow keys, select with Tab/Enter.
- **View in Chat navigation**: clicking View in Chat from the inline thread
  opens the corresponding task's conversation in the Perceptor panel
  (`VisualiserPanel.selectChat → chat:select`).
- **Remove Attached File**: `$(trash)` icon to remove attached files; removes
  directly when there is one file, shows a QuickPick when there are multiple.

## [0.4.1] - 2026-06-05

### Fixed
- **CI release pipeline**: `.vsix` filename now resolved from the actual build output
  instead of deriving it from the git tag — eliminates version mismatch (`ENOENT`) when
  `package.json` version and tag differ.

## [0.3.1] - 2026-06-05

### Added
- **Graph scope filter**: scope bar with editable path input + root (⌂) button to focus
  on a subtree. VS Code-style autocomplete suggestions, double-click a node to scope into
  its folder.
- **Sibling clustering**: children of the same parent attract each other so related folders
  visually group together instead of scattering across the layout.
- **Access modifier badge**: method visibility now shown as a colored text badge
  (public/private/protected/internal/package) instead of a dot — all languages supported.
- **Task type badge**: each task in the Tasks panel shows a type label (add, edit, move,
  request, file, folder, explain) at the head of its card.
- **Sidebar archive button**: hover any chat in the left sidebar to reveal an archive (📥)
  button — the old in-thread archive button has been removed.
- **Code smell detection (SKILL.md §1d)**: 8 language-agnostic smell rules (Strategy,
  Template Method, Factory, SRP, Primitive obsession, Feature envy, Long parameter list,
  Code duplication) with concrete TypeScript before→after examples.
- **Framework-specific idioms (SKILL.md §1e)**: mandatory mechanics for 20 frameworks
  (NestJS, Express, Spring Boot, ASP.NET Core, Gin, and more).

### Fixed
- **Silent tree-sitter parse failure**: recognized-language files no longer fall back to
  "file" kind — parse/extract failures return empty `ParsedCode` and log a warning.
- **Token usage overflow**: task-head now wraps with `flex-wrap`, usage chip drops to its
  own line instead of overflowing.
- **Dead CSS cleanup**: removed `.chat-archive` CSS rules left over after the in-thread
  archive button was removed.

## [0.3.0] - 2026-06-03

### Added
- **Markdown rendering**: Claude responses now render as rich markdown — bold,
  italic, inline code, fenced code blocks (with Copy button), lists and blockquotes.
- **Image paste and drag-and-drop**: Ctrl+V or drag-and-drop to attach images in
  chat; saved under `.visualise/attachments/` with thumbnail preview.
- **Image attachments forwarded to Claude**: `AutoProcessor` collects image
  attachment paths from task messages and `ClaudeProcessRunner` appends them to
  the CLI prompt so the skill can read them via the Read tool.
- **Image display in chat**: `ReadAttachmentCommand` serves attachment files as
  base64 data URLs; `ChatPanel` loads them asynchronously after render.
- **Dynamic skill discovery**: `SlashCommandMenu` now scans `<project>/.claude/skills/`
  and `~/.claude/skills/` via `ListSkillsCommand` instead of a hardcoded 4-skill list,
  showing all of the user's Claude CLI skills.
- **Slash command menu**: typing `/` in the chat input opens an autocomplete menu —
  navigate with arrow keys and select with Enter.

### Fixed
- File drag-and-drop in VS Code webview: added document-level `dragover`/`drop`
  prevention and expanded the drop zone to `#chat-main`.

## [0.2.0] - 2026-06-03

### Added
- **Go language support**: struct and interface extraction with receiver method
  attachment, channel/pointer/slice/map type unwrapping, and Go visibility convention
  (uppercase = public, lowercase = package). Registered in the Language Registry with
  `tree-sitter-go.wasm`.
- **Go complexity profile**: `for`-only loops (no while/foreach), `select` as a
  channel-specific branch keyword.
- **Go in Preferences**: Go added to the primary language dropdown with framework
  options (Gin, Echo, Fiber, Chi, Gorilla Mux).
- **Go package field in create-file modal**: when creating a `.go` file, a "Go package"
  input appears — auto-filled from the directory name, user-editable.
- **Distinct struct/interface colors**: struct badge steel-blue (#569cd6), interface
  badge green-teal (#43d9ad) — visually distinguishable at a glance across all languages.
- **Go package badge**: folders containing Go types show a small green `pkg` badge.
- **Pause/continue cycle for flow simulation**: the Run button now cycles through
  Run → Pause → Continue instead of being a one-shot action.

### Fixed
- Extension build script now copies `tree-sitter-go.wasm` to `dist/wasm/`.
- Synced `package-lock.json` with husky and commitlint dependencies for CI (`npm ci`).

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

[Unreleased]: https://github.com/berkcansavur/perceptor/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/berkcansavur/perceptor/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/berkcansavur/perceptor/compare/v0.3.1...v0.4.1
[0.3.1]: https://github.com/berkcansavur/perceptor/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/berkcansavur/perceptor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/berkcansavur/perceptor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/berkcansavur/perceptor/releases/tag/v0.1.0
