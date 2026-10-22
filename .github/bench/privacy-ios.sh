#!/usr/bin/env bash
# Answer the iOS first-launch permission prompts BEFORE the app ever asks, by
# writing the sim's TCC rows with `simctl privacy grant`.
#
# Why this is a harness (Category 1) concern and not a test concern: on a fresh
# simulator - which is what every GitHub runner is - the app's first-ever launch
# is the harness's own warm launch (`run-arm.sh`), which happens in device prep,
# before any test and before any engine exists. Nobody is there to answer a
# prompt at that moment, and the step terminates the app with an unanswered
# request still on screen. Published GHA run 39704588488 (iOS 26.5) shows the
# result: the photo-library prompt is on screen at 25 of the e2e arm's 86
# failures, and the Maestro arm has ZERO hits for the same string in the same
# run - Maestro's `launchApp` default (`permissions: all`, __e2e__/setupApp.yml)
# auto-answers it and the port has no equivalent. So this is an environment
# asymmetry between the arms, and closing it in the harness restores symmetry
# instead of buying either arm a capability.
#
# ARM SYMMETRY: the grant is a property of the simulator + bundle id, applied
# once in device prep. Both arms install the same bundle into a sim booted by
# the same script and are timed by the same caller, so both get exactly this
# environment; neither arm can see a prompt the other does not.
#
# WHY `privacy grant` AND NOT `grant all`: `grant all` writes a single
# `kTCCServiceAll` row (verified on iOS 26.2, Xcode 27.1: the access table gets
# one row, `kTCCServiceAll|2`) rather than the per-service rows an app's TCC
# checks read, so it is not the same thing as granting the services. Granting
# per service writes `kTCCServicePhotos|2`, `kTCCServiceCamera|2`, etc.
#
# WHY NOT `photos-add` INSTEAD OF `photos`: `photos-add` writes
# `kTCCServicePhotosAdd` only - it is the "add to library" permission, not the
# "full access to your Photo Library" prompt the suite trips over. Both are
# granted; `photos` is the one that matters, and Bluesky's Info.plist declares
# both NSPhotoLibraryUsageDescription and NSPhotoLibraryAddUsageDescription.
#
# WHAT CANNOT BE GRANTED, so no one should pretend otherwise (verified on the
# local host; re-verified on the runner every run and printed to the artifact):
#   notifications - `simctl privacy` refuses it on the simulator (exit 1). The
#       suite's own iOS target already omits it for the same reason
#       (e2e.config.ts). A first-launch notification prompt therefore CANNOT be
#       pre-granted from Category 1; it stays a known-possible alert.
#
# Exit status is NOT evidence: `simctl privacy grant` returns 0 for a bundle
# that is not installed (verified: granting `com.example.notinstalled` exits 0
# and writes a row), so a passing exit code cannot tell a real grant from a
# typo'd bundle id. Every run therefore reads the TCC database back and writes
# it to out/privacy.txt, in BOTH settings of PRIVACY_GRANT - the control gets
# the same diagnostic, which is what makes "the alert appeared with no grant
# present" a measurable statement instead of a story.
#
# Usage: privacy-ios.sh [<udid>]        UDID defaults to out/udid.txt.
# Env:   PRIVACY_GRANT=on|off          grant, or observe only (default off).
#        PRIVACY_SERVICES              override the service list.
# Writes out/privacy.txt. Never fails the job: this is device prep, and a
# runtime that refuses a service must be visible in the artifact, not a red
# build - the suite's own result is the measurement.
set -uo pipefail

udid="${1:-$(cat out/udid.txt 2>/dev/null || true)}"
[ -n "$udid" ] || { echo "privacy-ios.sh: no udid (pass one or run after boot-ios.sh)" >&2; exit 0; }
grant="${PRIVACY_GRANT:-off}"
case "$grant" in on|off) ;; *) echo "privacy-ios.sh: PRIVACY_GRANT must be on|off, got '$grant'" >&2; exit 0;; esac

APP="${APP_BUNDLE_ID:-xyz.blueskyweb.app}"
# `photos` before `photos-add`: the two write different rows, order is not load
# bearing, but doing the one that matters first means a runtime that dies
# halfway still has the important one applied.
services="${PRIVACY_SERVICES:-photos photos-add camera microphone contacts media-library}"
mkdir -p out
t=$(python3 -c 'import time; print(time.time())')

{
  echo "== privacy-ios.sh  udid=$udid  grant=$grant  bundle=$APP"
  echo "== xcode: $(xcodebuild -version 2>/dev/null | head -n 1)"
  echo "== runtime: $(cat out/device.txt 2>/dev/null)"
  # Does the bundle actually exist yet? A grant against a missing app is a
  # silent no-op, so say so explicitly rather than letting exit codes imply it.
  if xcrun simctl get_app_container "$udid" "$APP" app >/dev/null 2>&1; then
    echo "== install: present"
  else
    echo "== install: ABSENT - grants below would be recorded but mean nothing"
  fi

  for s in $services; do
    if [ "$grant" = on ]; then
      err=$(xcrun simctl privacy "$udid" grant "$s" "$APP" 2>&1) && rc=0 || rc=$?
      echo "grant $s: exit=$rc ${err:+($err)}"
    else
      echo "grant $s: skipped (PRIVACY_GRANT=off)"
    fi
  done

  # Read-back. The sim keeps its own TCC.db inside the device directory, not in
  # the app's data container; resolve the path from the device root so this
  # works whatever Xcode version the runner carries.
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
    rows=$(sqlite3 "$db" \
      "select service||'='||auth_value from access where client='$APP' order by service;" 2>&1)
    if [ -n "$rows" ]; then
      echo "$rows" | tr '\n' ' '; echo
    else
      echo "readback: no rows for $APP (nothing granted yet - expected for the control)"
    fi
  fi
} | tee out/privacy.txt

echo "privacy_s=$(python3 -c "import time;print(round(time.time()-$t,1))")" >> out/steps.txt
