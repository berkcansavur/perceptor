#!/usr/bin/env bash
# Build the .vsix and install it into your local VS Code so the extension runs
# like any other — no F5 / launch.json needed. Re-run after pulling changes.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
EXT="$ROOT/packages/extension"

if ! command -v code >/dev/null 2>&1; then
  echo "error: the 'code' CLI is not on PATH." >&2
  echo "In VS Code run: Cmd+Shift+P -> 'Shell Command: Install code command in PATH'." >&2
  exit 1
fi

bash "$ROOT/scripts/pack-extension.sh"

VERSION="$(node -p "require('$EXT/package.json').version")"
VSIX="$EXT/repo-visualiser-vscode-$VERSION.vsix"

echo "Installing $VSIX…"
code --install-extension "$VSIX" --force

echo "Done. Reload VS Code, then click the 'Repo Visualiser' status-bar item (or run"
echo "'Repo Visualiser: Open' from the command palette) in any folder you open."
