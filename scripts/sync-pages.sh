#!/usr/bin/env bash
# Copies the static site (public/) and the student template files (site-template/) into the GitHub Pages
# repository next to this project (../pace-site). Run it after changing public/ or site-template/,
# then commit and push pace-site.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE"
DST="$HERE/../pace-site"
if [ ! -d "$DST/.git" ]; then
  echo "pace-site repository not found at $DST" >&2
  exit 1
fi
cp -R "$SRC/public/." "$DST/"
cp -R "$SRC/site-template/." "$DST/"
echo "Synced public/ and site-template/ into $DST"
echo "Next: cd \"$DST\" && git status"
