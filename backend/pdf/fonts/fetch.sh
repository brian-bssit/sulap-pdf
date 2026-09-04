#!/usr/bin/env bash
# Unduh font open-license untuk fitur Edit PDF (task docs/feature-fonts).
# Aset di-commit — jalankan ini hanya utk regenerate/reproducibility.
set -euo pipefail
cd "$(dirname "$0")"

LA_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf"
LA_LIC="https://raw.githubusercontent.com/google/fonts/main/ofl/lato/OFL.txt"
DV_URL="https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -sL "$LA_URL"  -o "$tmp/lato.ttf"
curl -sL "$LA_LIC"  -o LICENSE-Lato-OFL.txt
curl -sL "$DV_URL"  -o "$tmp/dejavu.zip"
unzip -o -q "$tmp/dejavu.zip" \
  "dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf" \
  "dejavu-fonts-ttf-2.37/ttf/DejaVuSerif.ttf" \
  "dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf" \
  "dejavu-fonts-ttf-2.37/LICENSE" -d "$tmp"
cp "$tmp/lato.ttf" lato.ttf
cp "$tmp/dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf"     dejavu_sans.ttf
cp "$tmp/dejavu-fonts-ttf-2.37/ttf/DejaVuSerif.ttf"    dejavu_serif.ttf
cp "$tmp/dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf" dejavu_sans_mono.ttf
cp "$tmp/dejavu-fonts-ttf-2.37/LICENSE"                LICENSE-DejaVu.txt

echo "OK — fonts refreshed. Verifikasi:"
shasum -a 256 lato.ttf dejavu_sans.ttf dejavu_serif.ttf dejavu_sans_mono.ttf
