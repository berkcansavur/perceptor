#!/usr/bin/env bash
# Build a self-contained .vsix for the VS Code extension (workspaces monorepo).
# Everything is bundled by esbuild into dist/extension.js, and the runtime assets it
# can't inline (the webview build + tree-sitter .wasm grammars/runtime) are copied next
# to it into dist/web and dist/wasm. So packaging is just: build, then vsce package.
# No node_modules staging — the bundle carries its own code, the assets ship as files.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
EXT="$ROOT/packages/extension"

echo "Building core + extension…"
npm run build

VERSION="$(node -p "require('$EXT/package.json').version")"

echo "Packaging .vsix…"
( cd "$EXT" && npx --yes @vscode/vsce package --no-dependencies --out "repo-visualiser-vscode-$VERSION.vsix" )

echo "Done -> packages/extension/repo-visualiser-vscode-$VERSION.vsix"
echo "Install with: code --install-extension packages/extension/repo-visualiser-vscode-$VERSION.vsix"
