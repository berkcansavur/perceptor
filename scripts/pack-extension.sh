#!/usr/bin/env bash
# Build a self-contained .vsix for the VS Code extension (workspaces monorepo).
# - core: packages/core tsc output, staged as node_modules/repo-visualiser
# - extension host: esbuild bundle → dist/extension.js (core stays external)
# - tree-sitter deps staged as siblings so the core resolves them at runtime
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CORE="$ROOT/packages/core"
EXT="$ROOT/packages/extension"

echo "Building core + extension…"
npm run build

VERSION="$(node -p "require('$EXT/package.json').version")"
STAGE="$(mktemp -d)"

echo "Staging…"
node -e "const p=require('$EXT/package.json'); delete p.devDependencies; delete p.scripts; const fs=require('fs'); fs.writeFileSync('$STAGE/package.json', JSON.stringify(p,null,2));"
mkdir -p "$STAGE/dist" "$STAGE/node_modules/repo-visualiser"
cp "$EXT/dist/extension.js" "$STAGE/dist/"
cp -R "$EXT/media" "$STAGE/"
[ -f "$EXT/README.md" ] && cp "$EXT/README.md" "$STAGE/"
[ -f "$EXT/LICENSE" ] && cp "$EXT/LICENSE" "$STAGE/"
[ -f "$EXT/CHANGELOG.md" ] && cp "$EXT/CHANGELOG.md" "$STAGE/"

# core package staged under node_modules/repo-visualiser (dist already contains web/)
cp -R "$CORE/dist" "$CORE/package.json" "$STAGE/node_modules/repo-visualiser/"
# runtime deps the core loads (hoisted at the workspace root)
cp -R "$ROOT/node_modules/web-tree-sitter" "$STAGE/node_modules/"
# tree-sitter grammars: ship ONLY the languages LanguageRegistry registers (keeps the
# .vsix small ~8MB instead of ~50MB). Add a grammar here when you add a language.
mkdir -p "$STAGE/node_modules/tree-sitter-wasms/out"
cp "$ROOT/node_modules/tree-sitter-wasms/package.json" "$STAGE/node_modules/tree-sitter-wasms/"
for grammar in tree-sitter-java tree-sitter-c_sharp tree-sitter-typescript tree-sitter-tsx; do
  cp "$ROOT/node_modules/tree-sitter-wasms/out/$grammar.wasm" "$STAGE/node_modules/tree-sitter-wasms/out/"
done

echo "Packaging .vsix…"
( cd "$STAGE" && npx --yes @vscode/vsce package --out "$EXT/repo-visualiser-vscode-$VERSION.vsix" )

rm -rf "$STAGE"
echo "Done -> packages/extension/repo-visualiser-vscode-$VERSION.vsix"
echo "Install with: code --install-extension packages/extension/repo-visualiser-vscode-$VERSION.vsix"
