#!/usr/bin/env bash
# Regenerates the field app screenshots of the staff guide
# (docs/kilavuz/07-saha-uygulamasi.md) into docs/kilavuz/img/saha/.
#
# The screens are rendered by test/kilavuz/screens_test.dart with fakes and
# synthetic data; a plain `flutter test` skips that file. Text uses Roboto
# and the Material icons from the Flutter SDK. Images are compressed with
# pngquant when it is installed.
set -euo pipefail

cd "$(dirname "$0")/.."
flutter_bin="$(command -v flutter)"
flutter_root="$(cd "$(dirname "$(readlink -f "$flutter_bin")")/.." && pwd)"
export KILAVUZ_FONT_DIR="$flutter_root/bin/cache/artifacts/material_fonts"

out=../../docs/kilavuz/img/saha
mkdir -p "$out"
rm -f "$out"/*.png

flutter test test/kilavuz/screens_test.dart --dart-define=KILAVUZ_SHOTS=true

if command -v pngquant >/dev/null; then
  pngquant --force --skip-if-larger --quality=70-90 --ext .png "$out"/*.png || true
fi
du -sh "$out"
