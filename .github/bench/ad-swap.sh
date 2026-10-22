#!/usr/bin/env bash
# ad-swap.sh <install_dir> <agent-device-version>
#
# Replace the hoisted agent-device copy inside an already-installed node_modules tree,
# with NO lockfile change.
#
# Why this exists instead of a pnpm/yarn override:
#   @e2e-dev/mobile pins `agent-device` EXACTLY (0.21.28), so the engine cannot be raised
#   by editing a version range. Adding an override makes pnpm/yarn re-resolve the whole
#   graph: on Bluesky that rewrote ~20 unrelated peer-dependency entries and the pinned
#   node runtime in pnpm-lock.yaml, which would have made the "0.21.31" arm differ from
#   the published 0.21.28 rows by far more than the engine. Same for yarn `resolutions`
#   on 10tap. agent-device 0.21.28 and 0.21.31 have identical dependencies /
#   peerDependencies / peerDependenciesMeta / engines / exports / bin / files fields
#   (verified against the npm registry on 2026-10-22), so the directory swap moves the
#   engine and nothing else. The lockfile stays byte-identical and a plain
#   `install --frozen-lockfile` restores the pinned 0.21.28 exactly.
#
# Layouts handled (both verified on 2026-10-22):
#   Bluesky  pnpm  nodeLinker: hoisted  -> node_modules/agent-device, one copy;
#                                         @e2e-dev/mobile/node_modules holds only zod.
#   10tap    yarn3 node-modules + nmHoistingLimits: workspaces
#                                     -> example/node_modules/agent-device and
#                                        example-expo/node_modules/agent-device.
#
# It also stops a running agent-device daemon: the benchmark starts one per run and a
# live old-version daemon would silently keep being used.
set -uo pipefail

DIR="${1:?usage: ad-swap.sh <install_dir> <version>}"
VER="${2:?usage: ad-swap.sh <install_dir> <version>}"
[ -d "$DIR" ] || { echo "ad-swap: no such dir: $DIR" >&2; exit 2; }
command -v npm >/dev/null || { echo "ad-swap: npm not on PATH" >&2; exit 2; }

# Stop the daemon before touching files (best effort, never fatal).
[ -x "$DIR/node_modules/.bin/agent-device" ] && "$DIR/node_modules/.bin/agent-device" daemon stop >/dev/null 2>&1
pkill -f 'agent-device.*daemon' >/dev/null 2>&1

# Kept OUTSIDE the repo by default so `git status` stays clean (the parity docs prove the
# source trees are unmodified, and nothing should add noise to that). No `shasum` in the
# default path: it is a perl script that is not reliably present on ubuntu runners. The
# cached tarball is version-keyed, so two installs sharing it is harmless (identical
# bytes) and the unpack dir below is PID-unique, so concurrent runs cannot race.
WORK="${AD_SWAP_WORK:-${TMPDIR:-/tmp}/ad-swap/$VER}"
TARBALL="$WORK/agent-device.tgz"
# Do NOT wipe $WORK: it holds the version-keyed tarball this script reuses. Only stale
# per-process stage dirs are pruned (older than a day, and only ours).
mkdir -p "$WORK" || exit 1
find "$WORK" -maxdepth 1 -type d -name 'stage-*' -mmin +60 -exec rm -rf {} + 2>/dev/null

adver() { node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$1/package.json" 2>/dev/null || echo unknown; }

# find + newline-separated loop: macOS ships bash 3.2 (no `mapfile`) and the same script
# must work on the ubuntu CI runners (bash 5). node_modules paths have no spaces.
TARGETS=$(find "$DIR" -maxdepth 3 -type d -name agent-device \
            -path '*/node_modules/*' -not -path "$WORK/*" 2>/dev/null | sort)
[ -n "$TARGETS" ] || { echo "ad-swap: found no agent-device under $DIR" >&2; exit 3; }

NEED_FETCH=1
for T in $TARGETS; do [ "$(adver "$T")" = "$VER" ] || NEED_FETCH=0; done
if [ "$NEED_FETCH" = 0 ] && [ ! -f "$TARBALL" ]; then
  # Pack inside a PID-unique subdir, then `mv` into place: mv is atomic on one
  # filesystem, so two workstreams bumping the same version concurrently can never
  # read a half-written tarball.
  RAW="$WORK/raw-$$"; mkdir -p "$RAW"
  ( cd "$RAW" && npm pack "agent-device@$VER" --silent --pack-destination "$RAW" >/dev/null ) || {
    echo "ad-swap: npm pack agent-device@$VER failed" >&2; rm -rf "$RAW"; exit 4; }
  SRC=$(ls -1 "$RAW"/agent-device-*.tgz 2>/dev/null | head -1)
  [ -n "$SRC" ] || { echo "ad-swap: tarball missing after pack" >&2; rm -rf "$RAW"; exit 4; }
  mv "$SRC" "$TARBALL" 2>/dev/null || cp "$SRC" "$TARBALL"
  rm -rf "$RAW"
  [ -f "$TARBALL" ] || { echo "ad-swap: could not stage $TARBALL" >&2; exit 4; }
fi

for T in $TARGETS; do
  BEFORE=$(adver "$T")
  if [ "$BEFORE" = "$VER" ]; then echo "ad-swap: $T already $VER (skipped)"; continue; fi

  STAGE="$WORK/stage-$$"
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  tar xzf "$TARBALL" -C "$STAGE" || { echo "ad-swap: tar failed for $T" >&2; exit 5; }
  [ -d "$STAGE/package" ] || { echo "ad-swap: unexpected tarball shape in $TARBALL" >&2; exit 5; }

  # Replace the whole directory rather than globbing its contents away: an out-of-range
  # glob on `rm -rf` is a footgun we are not taking next to a 1.4 GB node_modules.
  rm -rf "$T" || { echo "ad-swap: could not remove $T" >&2; exit 6; }
  mkdir -p "$T"
  cp -R "$STAGE/package/." "$T/" || { echo "ad-swap: copy into $T failed" >&2; exit 6; }
  chmod -R u+rwX "$T"

  AFTER=$(adver "$T")
  echo "ad-swap: $T  $BEFORE -> $AFTER"
  [ "$AFTER" = "$VER" ] || { echo "ad-swap: version mismatch after swap at $T" >&2; exit 7; }
done

# Guard the two things that matter:
#  (a) @e2e-dev/mobile still LOADS. It imports agent-device at module scope, so a broken
#      engine surface fails right here instead of 20 minutes into a timed suite.
#  (b) which agent-device directory node reaches from mobile's dist/, via the same
#      node_modules walk-up node itself performs.
ADVERIFY_DIR="${AD_VERIFY_DIR:-$DIR}" node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
const dir = process.env.ADVERIFY_DIR;
const modDir = path.join(dir, "node_modules", "@e2e-dev", "mobile");
if (!fs.existsSync(modDir)) { console.log("ad-swap-verify: no @e2e-dev/mobile under this dir, skipped"); process.exit(0); }
let d = path.join(modDir, "dist"), found = null;
for (;;) {
  const c = path.join(d, "agent-device");
  if (fs.existsSync(path.join(c, "package.json"))) { found = c; break; }
  const up = path.dirname(d); if (up === d) break; d = up;
}
const ver = found ? JSON.parse(fs.readFileSync(path.join(found, "package.json"), "utf8")).version : "UNRESOLVED";
const mp = JSON.parse(fs.readFileSync(path.join(modDir, "package.json"), "utf8"));
const entry = (mp.exports && mp.exports["."] && (mp.exports["."].import || mp.exports["."].default)) || mp.module || mp.main;
let loaded = "no-entry";
try {
  const m = await import("file://" + path.join(modDir, entry));
  loaded = String(!!(m.mobile || m.test || m.describe));
} catch (e) { loaded = "FAIL: " + String(e.message).split("\n")[0]; }
console.log("ad-swap-verify: mobile loads=" + loaded + "  resolves agent-device=" + ver + "  at " + found);
if (!loaded.startsWith("true")) process.exit(1);
'
VERIFY_RC=$?

BIN="${AD_VERIFY_DIR:-$DIR}/node_modules/.bin/agent-device"
[ -x "$BIN" ] && echo "ad-swap: cli --version = $("$BIN" --version 2>&1 | tail -1)"

exit $VERIFY_RC
