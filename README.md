# Perceptor

Interactive, Obsidian-style **dependency & behavior map** of a code repository,
rendered inside a VS Code webview. Scan a repo with tree-sitter and explore it
two ways:

- **Graph mode** — each folder is a circle node, sized by its cross-folder
  connections; edges are aggregated dependencies (force layout).
- **Folder mode** — a VS Code-style collapsible tree (folder → type → behaviors),
  with per-method **Big-O complexity**, **data-access (SQL/ORM) risk** signals, and a
  **Simulate flow** storyboard.

It also lets you queue change requests from the map (add / move / edit a
behavior, create a file or folder) and have them carried out by your **own**
local Claude — no server, no hosted backend, your tokens.

- **Chat** — describe a change in plain language and Claude proposes it with
  impact analysis. Each conversation has its own thread; edit any sent message
  to re-run from that point. Use `@` to reference files inline.
- **Inline Edit (`Cmd+Shift+I`)** — select code in the editor, press the
  shortcut, and a chat thread opens right next to the selected lines. Describe
  what you want changed; Claude proposes a diff you review in the Changes tab.
- **Debug with Perceptor** — a `Debug with Perceptor` CodeLens above every
  method, badged **tested** / **untested**. For a tested method it runs the
  method's real test under its framework (jest / vitest / mocha), focused on
  that method, with a breakpoint at the source line — so you step through the
  method with its real mocks; the breakpoint hint shows how to tweak input
  values live from the Debug Console / Variables. For an untested method it
  offers to generate a complete, committable test with Claude (beside the
  source, or under a `perceptor-tests/` folder). Coverage is detected per
  method across every test file (beside-source, `perceptor-tests/`, parallel
  test dirs).

> No HTTP server, no localhost, no browser. The UI runs in a VS Code webview and
> talks to the extension host over the webview message channel.

> Not affiliated with or endorsed by Anthropic. Perceptor invokes your own locally
> installed `claude` CLI with your own account and tokens.

## Install

From the **VS Code Marketplace** (easiest) — search **Perceptor** in the Extensions
panel, or:

```bash
code --install-extension berkcansavur.perceptor
```

Then open any folder and run **Perceptor: Open** from the command palette (or click
the **Perceptor** status-bar item). The Claude-powered explain/change features need the
[`claude` CLI](https://docs.claude.com/en/docs/claude-code) on your PATH; the map works
without it.

> The Claude CLI is located automatically via your login shell, so it works even when
> VS Code is launched from the Dock/Finder (whose PATH omits Homebrew/nvm). If yours
> lives somewhere unusual, set an absolute path in the **`perceptor.claudePath`**
> setting. The CLI uses your existing Claude login — authenticate once with `claude`
> in a terminal and the extension reuses that session.

## Supported languages

| Language | Extracted symbols |
|----------|-------------------|
| TypeScript / TSX | class, interface, enum, **type alias**, **exported const** |
| Java | class, interface, enum, record, **annotation (`@interface`)** |
| C# | class, interface, enum, struct, record, **delegate** |
| Go | struct, interface (receiver methods, channel/pointer/slice/map unwrap) |

Adding a language is localized (Open/Closed): register it in
`packages/core/src/core/LanguageRegistry.ts` and add an extractor under
`packages/core/src/core/extractors/`.

## Repository layout

This is an npm-workspaces monorepo:

```
packages/
  core/        perceptor-core — analyzer + CoreService + CLI + web UI
  extension/   perceptor      — the VS Code extension host
```

- **core** is transport-agnostic: the analyzer produces a typed `Graph`, and
  `CoreService.dispatch(action, payload)` is the single seam the host calls.
- **extension** owns the webview, bridges its message channel to `CoreService`,
  and opens files in the editor.

## Develop

```bash
npm install
npm run build         # core (tsc + web bundle) + extension (esbuild)
npm run check-types   # full-strict tsc, no emit
npm test              # vitest — golden analyzer tests per language
```

### Run from source (F5)

Open this folder in VS Code → **F5** → in the Extension Development Host run
`Cmd/Ctrl+Shift+P` → **Perceptor: Open**. Use this only while hacking on the
extension itself; for everyday use install from the Marketplace above.

### Build a `.vsix` and install it locally

```bash
npm run package         # -> packages/extension/perceptor-<version>.vsix
npm run install:local   # builds the .vsix and runs `code --install-extension`
```

To share a build with someone else, send them the generated
`packages/extension/perceptor-<version>.vsix`; they install it with:

```bash
code --install-extension perceptor-<version>.vsix
```

### Headless analyze (no UI)

```bash
node packages/core/dist/cli.js "<TARGET_ROOT>"
# writes <TARGET_ROOT>/.perceptor/graph.json
```

The tool writes its scratch state under `<TARGET_ROOT>/.perceptor/` (graph cache, the
pending-actions queue, logs) and, when the target is a git repo, automatically adds
`.perceptor/` to its `.gitignore` so none of it is ever committed.

## License

[MIT](./LICENSE) © Berkcan Şavur
