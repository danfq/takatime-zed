#!/usr/bin/env bash
#
# set the extension version in every manifest
#
# usage: scripts/bump-version.sh <patch|minor|major|x.y.z>
# prints the new version on stdout
set -euo pipefail
cd "$(dirname "$0")/.."

current=$(sed -nE 's/^version = "(.*)"$/\1/p' extension.toml | head -1)
IFS=. read -r major minor patch <<<"$current"

case "${1:-}" in
  patch) next="$major.$minor.$((patch + 1))" ;;
  minor) next="$major.$((minor + 1)).0" ;;
  major) next="$((major + 1)).0.0" ;;
  *) next="${1:-}" ;;
esac

if ! [[ $next =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 <patch|minor|major|x.y.z>" >&2
  exit 1
fi

# first top-level version line in each manifest
NEXT=$next perl -0pi -e 's/^version = "[^"]*"/version = "$ENV{NEXT}"/m' extension.toml Cargo.toml

# root package entry in the lockfile
NEXT=$next perl -0pi -e 's/(name = "takatime-zed"\nversion = )"[^"]*"/$1"$ENV{NEXT}"/' Cargo.lock

# language server, cat keeps file permissions
tmp=$(mktemp)
jq --arg version "$next" '.version = $version' takatime-ls/package.json >"$tmp"
cat "$tmp" >takatime-ls/package.json
rm "$tmp"

echo "$current -> $next" >&2
echo "$next"
