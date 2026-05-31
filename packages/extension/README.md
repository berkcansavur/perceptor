# Repo Visualiser

An interactive, Obsidian-style **dependency & behavior map** of your repository,
rendered right inside VS Code.

- **Graph mode** — folders as connection-sized circle nodes, dependencies as
  edges, in a force layout.
- **Folder mode** — a collapsible tree (folder → type → behaviors).
- **Change tasks** — add / move / edit a behavior or create files & folders from
  the map; the work is carried out by *your own* local Claude. No server, no
  hosted backend, your tokens.

## Installation

No Marketplace account needed — it ships as a single `.vsix` file.

**From the packaged file (easiest):**

```bash
code --install-extension repo-visualiser-vscode-*.vsix
```

…or in VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.

Then open any folder and run **Repo Visualiser: Open** (see Usage). To update, install
a newer `.vsix` the same way.

**Build the `.vsix` yourself:**

```bash
npm install
npm run package        # → packages/extension/repo-visualiser-vscode-<version>.vsix
```

> Requires the [`claude` CLI](https://docs.claude.com/en/docs/claude-code) on your PATH
> only if you use the AI-powered change tasks; the map itself works without it.

## Usage

1. Open a folder/workspace in VS Code.
2. `Cmd/Ctrl+Shift+P` → **Repo Visualiser: Open** (or use the status-bar item).
3. Switch between **Graph** and **Folder** modes, pan / zoom / search, click a
   type to open it in the editor.

The map refreshes automatically as files change.

## Supported languages

| Language | Extracted symbols |
|----------|-------------------|
| TypeScript / TSX | class, interface, enum, type alias, exported const |
| Java | class, interface, enum, record, annotation (`@interface`) |
| C# | class, interface, enum, struct, record, delegate |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `repoVisualiser.claudePath` | `claude` | Path to the Claude CLI used for change tasks. |
| `repoVisualiser.autoProcessOnOpen` | `false` | Auto-process queued tasks on open (token-conservative; off by default). |

## Privacy

Everything runs locally. The analyzer and task engine run in the extension host
on your machine; change tasks invoke your own `claude` CLI with your own tokens.
No code leaves your machine through this extension.

## License

[MIT](./LICENSE) © Berkcan Şavur
