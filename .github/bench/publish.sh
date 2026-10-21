#!/usr/bin/env bash
# Uploads files to the `bench-apps` release, creating it on first use.
# Usage: publish.sh <file...>
set -euo pipefail

if ! gh release view bench-apps >/dev/null 2>&1; then
  # The Android and iOS builds may race to create it; one of them wins.
  gh release create bench-apps --title "Benchmark apps" --prerelease \
    --notes "Prebuilt e2e-profile development clients for the benchmark workflow." || true
fi
gh release upload bench-apps "$@" --clobber
