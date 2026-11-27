#!/usr/bin/env bash
# Publish the current commit without hosted Actions minutes.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
revision=$(git rev-parse HEAD)
remote=$(git remote get-url origin)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/source"
git archive "$revision" | tar -x -C "$stage/source"
(cd "$stage/source" && node scripts/verify.mjs)
git clone --quiet --single-branch --branch gh-pages "$remote" "$stage/site"
git -C "$stage/site" rm -qr --ignore-unmatch .
cp -R "$stage/source/dist/." "$stage/site/"
git -C "$stage/site" add -A
if ! git -C "$stage/site" diff --cached --quiet; then
  git -C "$stage/site" commit -m "Publish site from $revision"
  git -C "$stage/site" push origin gh-pages
fi
gh api --method POST repos/{owner}/{repo}/pages/builds
