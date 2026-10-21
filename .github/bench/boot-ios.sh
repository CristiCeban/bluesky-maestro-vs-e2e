#!/usr/bin/env bash
# Boots one iPhone 17 simulator as upstream's nightly does (iPhone 17 on
# iOS 26.5, falling back to the newest installed iOS 26.x runtime when 26.5
# is not on the image), turns off password AutoFill, installs the app.
# Usage: boot-ios.sh <path to .app>   Writes out/udid.txt and out/device.txt.
set -euo pipefail
app="${1:?usage: boot-ios.sh <app>}"
mkdir -p out
device_name="iPhone 17"
runtimes=$(xcrun simctl list runtimes available --json)
runtime_id=$(echo "$runtimes" | jq -r '[.runtimes[] | select(.name == "iOS 26.5")] | first | .identifier // empty')
if [ -z "$runtime_id" ]; then
  runtime_id=$(echo "$runtimes" | jq -r '[.runtimes[] | select(.name | startswith("iOS 26"))] | sort_by(.version | split(".") | map(tonumber)) | last | .identifier // empty')
fi
if [ -z "$runtime_id" ]; then
  echo "No iOS 26 runtime. Available:" >&2
  echo "$runtimes" | jq -r '.runtimes[].name' >&2
  exit 1
fi
runtime_name=$(echo "$runtimes" | jq -r --arg id "$runtime_id" '.runtimes[] | select(.identifier == $id) | "\(.name) (\(.buildversion))"')
type_id=$(xcrun simctl list devicetypes --json | jq -r --arg n "$device_name" '[.devicetypes[] | select(.name == $n)] | first | .identifier // empty')
udid=$(xcrun simctl create "bench $device_name" "$type_id" "$runtime_id")
xcrun simctl shutdown all || true
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
xcrun simctl spawn "$udid" defaults write com.apple.WebUI AutoFillPasswords -int 0
xcrun simctl install "$udid" "$app"
echo "$udid" > out/udid.txt
echo "$device_name $runtime_name" > out/device.txt
echo "Using $device_name on $runtime_name ($udid)"
