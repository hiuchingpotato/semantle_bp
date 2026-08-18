#!/usr/bin/env bash
#
# Resample the marker artwork for the web.
#
# Source art lives in assets/images at around 950x1725. The board draws it at
# 28-34px. Shipping the originals would mean 850KB of download to paint
# thumbnails, and letting the browser scale 1725px down to 34px in one step
# looks worse than resampling properly up front.
#
# Output height is deliberate headroom: 160px is roughly 4x the largest size the
# board currently draws, which covers high-DPR screens and leaves room to raise
# MARKER_HEIGHT without regenerating.
#
# Uses sips, which ships with macOS. Re-run after changing the artwork.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$REPO/assets/images"
DEST="$REPO/web/public/markers"
HEIGHT=160

if [ ! -d "$SOURCE" ]; then
  echo "no source artwork at $SOURCE" >&2
  exit 1
fi

mkdir -p "$DEST"

shopt -s nullglob
found=0
for file in "$SOURCE"/*.png; do
  name="$(basename "$file")"
  sips --resampleHeight "$HEIGHT" "$file" --out "$DEST/$name" >/dev/null
  printf '  %-22s %s\n' "$name" "$(du -h "$DEST/$name" | cut -f1)"
  found=$((found + 1))
done

if [ "$found" -eq 0 ]; then
  echo "no PNGs found in $SOURCE" >&2
  exit 1
fi

echo "$found markers -> web/public/markers ($(du -sh "$DEST" | cut -f1) total)"
