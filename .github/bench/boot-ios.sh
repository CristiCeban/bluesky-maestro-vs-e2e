#!/usr/bin/env bash
# Boots one iPhone 17 simulator on an EXPLICIT runtime and installs the app.
#
# The runtime used to be a preference with a fallback ("iOS 26.5, else the
# newest iOS 26.x"), and the published iOS cells therefore ran iOS 26.5 while
# the local and 10tap cells ran iOS 26.2 - silently, because the fallback
# cannot be told apart from the pin in a result row. A benchmark row's runtime
# is part of the measurement, so it is now an input with no fallback: if the
# requested runtime is not on the image, this prints what IS and fails.
#
# Usage: boot-ios.sh <path to .app>   Runtime: IOS_RUNTIME (default iOS 26.2).
# Writes out/udid.txt and out/device.txt ("<name> <runtime> (<build>)").
set -euo pipefail
app="${1:?usage: boot-ios.sh <app>}"
mkdir -p out
device_name="${IOS_DEVICE_NAME:-iPhone 17}"
want="${IOS_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-26-2}"

runtimes=$(xcrun simctl list runtimes --json)
{
  echo "== requested runtime: $want"
  echo "== xcrun simctl list runtimes =="
  xcrun simctl list runtimes
} | tee out/runtimes.txt

# Accept the identifier unless simctl explicitly says it is not usable. Older
# simctl writes `"state": "available"`; current ones write the state as null and
# simply omit a runtime that is not installed, so equality against "available"
# would reject a perfectly good runtime. `simctl create` is the real gate: the
# line below fails the job loudly if it cannot use the pin.
if ! echo "$runtimes" | jq -e --arg id "$want" \
  'any(.runtimes[]; .identifier == $id and ((.state // "available") as $s | $s != "unavailable" and $s != "inconsistent"))' \
  >/dev/null; then
  echo "boot-ios.sh: runtime $want is not available on this image (see out/runtimes.txt)." >&2
  echo "boot-ios.sh: NOT falling back - a different runtime is a different measurement." >&2
  echo "$runtimes" | jq -r '.runtimes[] | "  \(.identifier) state=\(.state)"' >&2
  exit 1
fi
runtime_name=$(echo "$runtimes" | jq -r --arg id "$want" \
  '.runtimes[] | select(.identifier == $id) | "\(.name) (\(.buildversion))"')
type_id=$(xcrun simctl list devicetypes --json | jq -r --arg n "$device_name" \
  '[.devicetypes[] | select(.name == $n)] | first | .identifier // empty')
if [ -z "$type_id" ]; then
  echo "boot-ios.sh: no device type named '$device_name' on this image." >&2
  xcrun simctl list devicetypes >&2
  exit 1
fi
udid=$(xcrun simctl create "bench $device_name" "$type_id" "$want")
xcrun simctl shutdown all || true
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
xcrun simctl spawn "$udid" defaults write com.apple.WebUI AutoFillPasswords -int 0
xcrun simctl install "$udid" "$app"
echo "$udid" > out/udid.txt
echo "$device_name $runtime_name" > out/device.txt
echo "Using $device_name on $runtime_name ($udid)"
