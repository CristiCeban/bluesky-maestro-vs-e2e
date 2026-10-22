#!/usr/bin/env bash
# Answer the iOS first-launch permission prompts BEFORE the app ever asks, by
# writing the sim's TCC rows with `simctl privacy grant`.
#
# Why this is a harness (Category 1) concern and not a test concern: on a fresh
# simulator - which is what every GitHub runner is - the app's first-ever launch
# happens in device prep (run-arm.sh's warm launch), before any test and before
# any engine exists. Nobody is there to answer a prompt at that moment. Published
# GHA run 39704588488 (iOS 26.5) shows the result: the photo-library prompt is on
# screen at 25 of the e2e arm's 86 failures and the run logged ZERO dismissals,
# because the port only looks for that prompt inside the two media flows
# (`openMedia`), while the alert was sitting on screens belonging to tests that
# never call it. The Maestro arm of the SAME run has 0 hits for the same string:
# its `launchApp` default (`permissions: all`, __e2e__/setupApp.yml) auto-answers
# system prompts and the port has no equivalent. So this is an environment
# asymmetry between the arms, and closing it in the harness restores symmetry
# rather than buying either arm a capability.
#
# ARM SYMMETRY: the grant is a property of the simulator + bundle id, applied once
# in device prep by boot-ios.sh, before either arm exists. Both arms install the
# same bundle into a sim booted by the same script, so neither can see a prompt
# the other does not.
#
# WHY `privacy grant` PER SERVICE AND NOT `grant all`: `grant all` writes a single
# `kTCCServiceAll` row (verified on iOS 26.2 / Xcode 27.1 - after `reset all` the
# app has 0 rows, after `grant all` exactly 1, `kTCCServiceAll`) rather than the
# per-service rows an app's TCC check reads. Granting per service writes
# `kTCCServicePhotos|2`, `kTCCServiceCamera|2`, and so on.
#
# WHY `photos` AND NOT ONLY `photos-add`: `photos-add` writes
# `kTCCServicePhotosAdd` - the "add to library" permission, not the "full access
# to your Photo Library" prompt this suite trips over. Both are granted; `photos`
# is the one that matters, and Bluesky's Info.plist declares both usage strings.
#
# WHAT CANNOT BE GRANTED, said here rather than in a footnote: `notifications` is
# refused by `simctl privacy` on the simulator (exit 1, verified), which is also
# why the suite's own iOS target omits it (e2e.config.ts). A first-launch
# notification prompt therefore CANNOT be pre-granted from Category 1.
#
# EXIT STATUS IS NOT EVIDENCE: `simctl privacy grant` exits 0 even for a bundle id
# that is not installed (verified: granting `com.example.notinstalled` exits 0 and
# writes a row), so a green exit cannot tell a real grant from a typo. Every run
# therefore reads TCC back and writes it to out/privacy.txt, in BOTH settings of
# PRIVACY_GRANT - the control carries the same evidence as the fix, which is what
# makes "the alert appeared with no grant present" a measurement, not a story.
#
# Usage: privacy-ios.sh <udid> [apply|readback]   UDID defaults to out/udid.txt.
#   apply     - grant when PRIVACY_GRANT=on, always write out/privacy.txt.
#   readback  - observe only: grants nothing, writes no files, prints to stdout.
# Env: PRIVACY_GRANT=on|off, PRIVACY_SERVICES, APP_BUNDLE_ID.
# Never fails the job: this is device prep, and a runtime that refuses a service
# must be visible in the artifact rather than as a red build.
set -uo pipefail

udid="${1:-$(cat out/udid.txt 2>/dev/null || true)}"
[ -n "$udid" ] || { echo "privacy-ios.sh: no udid (pass one or run after boot-ios.sh)" >&2; exit 0; }
mode="${2:-apply}"
case "$mode" in apply|readback) ;; *) echo "privacy-ios.sh: mode must be apply|readback" >&2; exit 0;; esac

APP="${APP_BUNDLE_ID:-xyz.blueskyweb.app}"
# `photos` first: the services write different rows so order is not load bearing,
# but doing the one that matters first means a runtime that dies halfway still has
# the important one applied.
services="${PRIVACY_SERVICES:-photos photos-add camera microphone contacts media-library}"

# Read the sim's own TCC table. It lives in the device directory, not in the app's
# data container, and both candidate paths are tried because that location has
# moved between Xcode versions - silently finding nothing would look exactly like
# "nothing was granted".
readback_block() {
  local devdir db rows
  devdir="$HOME/Library/Developer/CoreSimulator/Devices/$udid"
  db=""
  for c in "$devdir/data/Library/TCC/TCC.db" \
           "$devdir/data/Library/Application Support/com.apple.TCC/TCC.db"; do
    [ -f "$c" ] && { db="$c"; break; }
  done
  if [ -z "$db" ]; then
    echo "readback: NO TCC.db found under $devdir (path moved in this Xcode?)"
  elif ! command -v sqlite3 >/dev/null 2>&1; then
    echo "readback: sqlite3 unavailable on this image"
  else
    echo "readback: $db"
    rows=$(sqlite3 "$db" "select service||'='||auth_value from access where client='$APP' order by service;" 2>&1)
    if [ -n "$rows" ]; then echo "$rows" | tr '\n' ' '; echo
    else echo "readback: no rows for $APP (nothing granted yet - expected for the control)"; fi
  fi
}

if [ "$mode" = readback ]; then
  echo "== privacy-ios.sh readback  udid=$udid  bundle=$APP"
  readback_block
  exit 0
fi

grant="${PRIVACY_GRANT:-off}"
case "$grant" in on|off) ;; *) echo "privacy-ios.sh: PRIVACY_GRANT must be on|off, got '$grant'" >&2; exit 0;; esac
mkdir -p out
t=$(python3 -c 'import time; print(time.time())')

{
  echo "== privacy-ios.sh  udid=$udid  grant=$grant  bundle=$APP"
  echo "== xcode: $(xcodebuild -version 2>/dev/null | head -n 1)"
  echo "== runtime: $(cat out/device.txt 2>/dev/null)"
  # Does the bundle exist yet? A grant against a missing app is a silent no-op, so
  # say so in the artifact instead of letting exit codes imply success.
  if xcrun simctl get_app_container "$udid" "$APP" app >/dev/null 2>&1; then
    echo "== install: present"
  else
    echo "== install: ABSENT - grants below are recorded but mean nothing"
  fi

  for s in $services; do
    if [ "$grant" = on ]; then
      err=$(xcrun simctl privacy "$udid" grant "$s" "$APP" 2>&1) && rc=0 || rc=$?
      echo "grant $s: exit=$rc ${err:+($err)}"
    else
      echo "grant $s: skipped (PRIVACY_GRANT=off)"
    fi
  done

  readback_block
} | tee out/privacy.txt

echo "privacy_s=$(python3 -c "import time;print(round(time.time()-$t,1))")" >> out/steps.txt
