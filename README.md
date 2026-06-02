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
# writes <TARGET_ROOT>/.visualise/graph.json
```

The tool writes its scratch state under `<TARGET_ROOT>/.visualise/` (graph cache, the
pending-actions queue, logs) and, when the target is a git repo, automatically adds
`.visualise/` to its `.gitignore` so none of it is ever committed.

## License

[MIT](./LICENSE) © Berkcan Şavur
