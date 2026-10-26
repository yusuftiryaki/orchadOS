#!/usr/bin/env bash
# Builds ins_meta_dump against the Insta360 InsMetaData SDK (not in this repo).
#   INSMETA_SDK=~/.orchados/sdk/insta360/InsMetaDataSDK-...-linux64-default ./build.sh [OUT_DIR]
# The binary needs libInsMetaDataSDK.so at run time (rpath points at the SDK's lib/).
set -euo pipefail
sdk="${INSMETA_SDK:?set INSMETA_SDK to the InsMetaData SDK directory}"
out="${1:-$(dirname "$0")/build}"
mkdir -p "$out"
g++ -std=c++17 -O2 -Wall -Wextra -I"$sdk/include" "$(dirname "$0")/main.cc" \
  -L"$sdk/lib" -lInsMetaDataSDK -Wl,-rpath,"$sdk/lib" -o "$out/ins_meta_dump"
echo "built $out/ins_meta_dump"
