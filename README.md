# repo-visualiser

Interactive, Obsidian-style **dependency & behavior map** of a code repository,
rendered inside a VS Code webview. Scan a repo with tree-sitter and explore it
two ways:

- **Graph mode** — each folder is a circle node, sized by its cross-folder
  connections; edges are aggregated dependencies (force layout).
- **Folder mode** — a VS Code-style collapsible tree (folder → type → behaviors).

It also lets you queue change requests from the map (add / move / edit a
behavior, create a file or folder) and have them carried out by your **own**
local Claude — no server, no hosted backend, your tokens.

> No HTTP server, no localhost, no browser. The UI runs in a VS Code webview and
> talks to the extension host over the webview message channel.

## Supported languages

| Language | Extracted symbols |
|----------|-------------------|
| TypeScript / TSX | class, interface, enum, **type alias**, **exported const** |
| Java | class, interface, enum, record, **annotation (`@interface`)** |
| C# | class, interface, enum, struct, record, **delegate** |

Adding a language is localized (Open/Closed): register it in
`packages/core/src/core/languageRegistry.ts` and add an extractor under
`packages/core/src/core/extractors/`.

## Repository layout

This is an npm-workspaces monorepo:

```
packages/
  core/        repo-visualiser        — analyzer + CoreService + CLI + web UI
  extension/   repo-visualiser-vscode — the VS Code extension host
```

- **core** is transport-agnostic: the analyzer produces a typed `Graph`, and
  `CoreService.dispatch(action, payload)` is the single seam the host calls.
- **extension** owns the webview, bridges its message channel to `CoreService`,
  and opens files in the editor.

## Install (use it like any other extension)

No `launch.json`, no F5. Build the `.vsix` once and install it into your VS Code —
it then activates automatically on startup and adds a **Repo Visualiser** status-bar
item. Open any folder and click it (or run **"Repo Visualiser: Open"** from the
command palette) to analyze and open the map.

```bash
npm install
npm run install:local   # builds the .vsix and runs `code --install-extension`
```

Reload VS Code afterwards. To share with someone else, send them the generated
`packages/extension/repo-visualiser-vscode-*.vsix`; they install it with:

```bash
code --install-extension repo-visualiser-vscode-<version>.vsix
```

> Requires the `code` CLI on PATH (VS Code → `Cmd+Shift+P` → *Shell Command: Install
> 'code' command in PATH*) and the Claude CLI for the Claude-powered task features.

## Develop

```bash
npm install
npm run build         # core (tsc + web bundle) + extension (esbuild)
npm run check-types   # full-strict tsc, no emit
npm test              # vitest — golden analyzer tests per language
```

### Run from source (F5)

Open this folder in VS Code → **F5** → in the Extension Development Host run
`Cmd/Ctrl+Shift+P` → **"Repo Visualiser: Open"**. Use this only while hacking on the
extension itself; for everyday use prefer `npm run install:local` above.

### Package a `.vsix` only

```bash
npm run package   # -> packages/extension/repo-visualiser-vscode-*.vsix
```

### Headless analyze (no UI)

```bash
node packages/core/dist/cli.js "<TARGET_ROOT>"
# writes <TARGET_ROOT>/.visualise/graph.json
```

Add `.visualise/` to the target repo's `.gitignore`.

## License

[MIT](./LICENSE) © Berkcan Şavur
