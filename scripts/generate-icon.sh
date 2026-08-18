#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

source_svg="assets/brand/foscen-icon.svg"
output_icns="assets/brand/foscen.icns"
work_directory="$(mktemp -d)"
trap 'rm -rf "$work_directory"' EXIT

qlmanage -t -s 1024 -o "$work_directory" "$source_svg" >/dev/null 2>&1
source_png="$work_directory/foscen-icon.svg.png"
test -f "$source_png" || { printf 'ERROR: SVG 图标渲染失败\n' >&2; exit 1; }

iconset="$work_directory/foscen.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$source_png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" "$source_png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$iconset" -o "$output_icns"
printf 'Generated %s\n' "$output_icns"
