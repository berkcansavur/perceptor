#!/usr/bin/env bash
# Bump version across the monorepo, commit, tag, and push.
# Usage: bash scripts/release.sh <patch|minor|major>
set -euo pipefail

BUMP_TYPE="${1:-patch}"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: bash scripts/release.sh <patch|minor|major>"
  exit 1
fi

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "Bumping $CURRENT_VERSION -> $NEW_VERSION"

for PKG in package.json packages/core/package.json packages/extension/package.json; do
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  Updated $PKG"
done

echo ""
echo "Version bumped to $NEW_VERSION."
echo "Next steps:"
echo "  git add -A && git commit -m \"chore: bump version to $NEW_VERSION\""
echo "  git tag v$NEW_VERSION"
echo "  git push origin master --tags"
