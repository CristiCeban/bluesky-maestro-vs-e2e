#!/usr/bin/env bash
# One benchmark run on the booted device, with the backend and Metro already
# up (services.sh): the device prep of upstream's nightly, then the timed
# suite for $ARM (maestro or e2e) on $PLATFORM (android or ios).
# Writes out/result.env, out/steps.txt, out/stdout.log and the tool's JUnit.
set -uo pipefail

APP=xyz.blueskyweb.app
OUT="$PWD/out"
mkdir -p "$OUT"
now() { python3 -c 'import time; print(time.time())'; }
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }

# The 19 stable flows (phase 3 decision): all of __e2e__/flows except
# thread-muting, create-account and profile-screen-edit, which are red in
# upstream's nightly. The flow files are unmodified; the e2e port has the
# same 19 as tests/**/*.e2e.ts.
FLOWS=()
for f in __e2e__/flows/*.yml __e2e__/flows/report-dialog/*.yml; do
  case "$f" in
    *thread-muting*|*create-account*|*profile-screen-edit*) ;;
    *) FLOWS+=("$f") ;;
  esac
done

if [ "$PLATFORM" = android ]; then
  DEVICE=emulator-5554
  export E2E_ANDROID_DEVICE=$DEVICE
  t=$(now)
  adb -s "$DEVICE" shell settings put global hide_error_dialogs 1
  adb -s "$DEVICE" install -r app/bluesky-e2e.apk
  echo "install_s=$(since "$t")" >> "$OUT/steps.txt"
  # Upstream's nightly: the app reaches the PDS and Metro on the host's
  # localhost. (The fixture POSTs to :1986 run on the host.)
  adb -s "$DEVICE" reverse tcp:3000 tcp:3000
  adb -s "$DEVICE" reverse tcp:8081 tcp:8081
  # Let the freshly booted emulator's background work (Play services) settle,
  # as the 10tap benchmark does.
  sleep 90
  device="emulator api34 google_apis x86_64 pixel_6 720x1600@280"
  adb -s "$DEVICE" logcat -c || true
  adb -s "$DEVICE" logcat -v threadtime > "$OUT/logcat.log" 2>&1 &
  logcat_pid=$!
else
  DEVICE=$(cat "$OUT/udid.txt")
  export E2E_IOS_DEVICE=$DEVICE
  device="$(cat "$OUT/device.txt"); $(xcodebuild -version | head -n 1)"
fi

TIME=()
if [ -x /usr/bin/time ]; then
  if [ "$(uname)" = Darwin ]; then TIME=(/usr/bin/time -l -o "$OUT/time.txt"); else TIME=(/usr/bin/time -v -o "$OUT/time.txt"); fi
fi

# The timed suite: the tool's own command, driver/engine start included
# (Maestro's driver install, agent-device's runner build and install).
t=$(now)
started_at=$(date -u +%FT%TZ)
case "$ARM" in
  maestro)
    # Upstream's invocation (run-nightly-e2e.sh), with the 19 files listed
    # instead of `--config __e2e__/config.yml __e2e__`.
    "${TIME[@]}" maestro --udid "$DEVICE" test --format JUNIT --output "$OUT/junit.xml" \
      --debug-output "$OUT/maestro" --test-output-dir "$OUT/maestro" --flatten-debug-output \
      "${FLOWS[@]}" > "$OUT/stdout.log" 2>&1
    code=$?
    versions="maestro=$(maestro --version 2>/dev/null | tail -n 1)"
    ;;
  e2e)
    # CI is unset for e2e only: in CI mode e2e ignores `reuseExisting` and
    # would start a second Metro on 8081 (APP_ALREADY_RUNNING). The only other
    # CI-mode defaults (retries 1, workers 1) are set explicitly here and in
    # e2e.config.ts.
    env -u CI METRO_URL=http://localhost:8081 "${TIME[@]}" pnpm exec e2e run --target "$PLATFORM" --retries 0 \
      --reporter list,junit --output "$OUT/e2e" > "$OUT/stdout.log" 2>&1
    code=$?
    ver() { node -p "require('$1/package.json').version" 2>/dev/null; }
    versions="e2e=$(ver e2e);@e2e-dev/mobile=$(ver @e2e-dev/mobile);agent-device=$(ver agent-device)"
    ;;
  *)
    echo "unknown arm: $ARM" >&2
    exit 2
    ;;
esac
suite_s=$(since "$t")
[ -n "${logcat_pid:-}" ] && kill "$logcat_pid" 2>/dev/null

{
  echo "platform=$PLATFORM"
  echo "arm=$ARM"
  echo "run=$RUN"
  echo "started_at=$started_at"
  echo "suite_s=$suite_s"
  echo "exit=$code"
  echo "versions=$versions"
  echo "device=$device"
  echo "runner=${ImageOS:-}/${ImageVersion:-}"
  echo "app_sha256=$(cut -d' ' -f1 app/*.sha256)"
  echo "commit=${GITHUB_SHA:-}"
} > "$OUT/result.env"
cat "$OUT/steps.txt" "$OUT/result.env"
tail -n 80 "$OUT/stdout.log"
exit "$code"
