# Perceptor

Perceptor X-rays your repository: an interactive, Obsidian-style **dependency &
behavior map**, with static **complexity** and **data-access risk** read straight off
each method — rendered right inside VS Code.

- **Graph mode** — folders as connection-sized circle nodes, dependencies as
  edges, in a force layout.
- **Folder mode** — a collapsible tree (folder → type → behaviors), with a method
  detail panel.
- **Method insight** — for any method: a static **Big-O / complexity** read, **data-access
  (SQL/ORM) risk** signals (N+1, `SELECT *`, unbounded finds…), and a **Run flow**
  storyboard that animates, step by step, what the method receives, every call it makes,
  and what it returns.
- **Explain** — ask your own local Claude for a complete plain-English explanation of a
  method, inline in its detail panel.
- **Change tasks** — add / move / edit a behavior or create files & folders from
  the map; the work is carried out by *your own* local Claude. No server, no
  hosted backend, your tokens.

## Quick start (3 steps)

1. **Get the file** — `perceptor-<version>.vsix`.
2. **Install it** — open VS Code → **Extensions** panel (left sidebar) → click the
   **`…`** menu at the top → **Install from VSIX…** → pick the file.
3. **Open the map** — open any project folder, then click **Perceptor** in the
   bottom status bar (or press `Cmd/Ctrl+Shift+P` and run **Perceptor: Open**).

That's it — the map appears and updates by itself. *(Optional: the AI edit/explain
features need the free `claude` CLI installed; the map works fine without it.)*

## Installation

No Marketplace account needed — it ships as a single `.vsix` file.

**From the packaged file (easiest):**

```bash
code --install-extension perceptor-*.vsix
```

…or in VS Code: **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.

Then open any folder and run **Perceptor: Open** (see Usage). To update, install
a newer `.vsix` the same way.

**Build the `.vsix` yourself:**

```bash
npm install
npm run package        # → packages/extension/perceptor-<version>.vsix
```

> Requires the [`claude` CLI](https://docs.claude.com/en/docs/claude-code) on your PATH
> only if you use the AI-powered explain/change tasks; the map itself works without it.

## Usage

1. Open a folder/workspace in VS Code.
2. `Cmd/Ctrl+Shift+P` → **Perceptor: Open** (or use the status-bar item).
3. Switch between **Graph** and **Folder** modes, pan / zoom / search, click a
   type to open it in the editor.
4. In Folder mode, click a behavior to open its detail panel — complexity, data-access
   risk, the Run-flow storyboard (press **Play**), and **Explain**.

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
| `perceptor.claudePath` | _(empty)_ | Path to the Claude CLI used for explain/change tasks. Empty = auto-detect via your login shell (recommended); set an absolute path to override. |
| `perceptor.autoProcessOnOpen` | `false` | Auto-process queued tasks on open (token-conservative; off by default). |

## Privacy

Everything runs locally. The analyzer and task engine run in the extension host
on your machine; explain/change tasks invoke your own `claude` CLI with your own tokens.
No code leaves your machine through this extension.

## License

[MIT](./LICENSE) © Berkcan Şavur
