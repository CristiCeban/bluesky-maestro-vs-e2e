# Benchmark: Maestro vs e2e (Bluesky social-app, Android and iOS)

This repo is a **single snapshot commit** of
[bluesky-social/social-app](https://github.com/bluesky-social/social-app) at
[`9af1cb0b`](https://github.com/bluesky-social/social-app/commit/9af1cb0bb0856a8ffa8a015f37e84aab981a934a)
(no upstream history; the tree is upstream's, byte for byte, except for the
files listed below). It adds the `e2e` port of Bluesky's Maestro suite and two
workflows. Upstream's workflows (deploys, bundle size, lint, nightly, ...)
and `dependabot.yml` were removed, so nothing of Bluesky's runs here.

Added or changed on top of `9af1cb0b`:
- the `e2e` port: `tests/**`, `e2e.config.ts`, `MIGRATION.md`, the `e2e` and
  `@e2e-dev/mobile` dev dependencies and `test:e2e` script in `package.json`,
  `pnpm-lock.yaml`, and `.e2e/` ignores in `.gitignore`;
- `.github/workflows/{build,bench}.yml`, `.github/bench/**`, this file.

Bluesky's Maestro flows (`__e2e__/`) are unmodified.

## Workflows

1. **Build apps** (`build.yml`) builds the apps once and publishes them as
   assets of the `bench-apps` release, each with a SHA-256:
   - Android: `bluesky-e2e.apk`, the debug development client for x86_64, on
     `ubuntu-latest`.
   - iOS: `Bluesky.app.zip`, the Debug simulator development client (arm64),
     on `macos-26` with Xcode 26.4 (upstream's nightly pin).

   Upstream's nightly builds the same `e2e` EAS profile with
   `pnpm eas build --profile e2e --local`, which needs an `EXPO_TOKEN`. This
   repo has no secrets, so the build runs what the profile sets by hand:
   `expo prebuild` + Gradle / xcodebuild with `EXPO_PUBLIC_ENV=e2e`,
   `NODE_ENV=development`, `RN_SRC_EXT=e2e.ts,e2e.tsx` and a development
   client.
2. **Bench** (`bench.yml`) runs each arm N times (default 5) per platform,
   one fresh runner per run, arms interleaved, retries off. The jobs download
   the prebuilt app (SHA-256 checked) and never build.

Arms (both run the same 19 flows, see below):
- `maestro`: Maestro **2.10.0** (upstream's pin, installed from the release
  zip with upstream's checksum and env), upstream's `maestro test` invocation
  with the 19 flow files listed.
- `e2e`: `pnpm exec e2e run --target <platform> --retries 0` (e2e 0.21.2,
  @e2e-dev/mobile 0.12.3, agent-device 0.21.28 from the lockfile).

## Design decisions

- **Build type: debug development client + Metro**, as upstream's nightly.
  The app loads its JS from Metro, so Metro runs in every bench job. It is
  started on 8081 (upstream's port, which the dev launcher finds by itself for
  Maestro) and pre-warmed with one bundle request **before** the timed suite:
  its start-up is setup time (`metro_prewarm_s`), not suite time. Both arms
  use the same Metro: `e2e.config.ts` has `reuseExisting: true`, and `CI` is
  unset for the `e2e` command only, because in CI mode `e2e` ignores
  `reuseExisting` and would try to start a second Metro on the busy port
  (`APP_ALREADY_RUNNING`). The other CI-mode defaults of `e2e` (retries 1,
  workers 1) are set explicitly (`--retries 0`, `workers: 1`).
- **Mock backend**, as upstream's nightly (`.github/scripts/run-nightly-e2e.sh`,
  kept in this repo): the `dev-env` mock server on `@atproto/dev-env`
  (fixture manager :1986, PDS :3000 after the first fixture POST) with
  PostgreSQL :5433 and Redis :6380. No third-party services, no secrets.
  - Android (`ubuntu-latest`, has Docker): `pnpm --dir dev-env start`
    (`docker compose dev-env/dev-infra`).
  - iOS (GitHub's macOS runners have no Docker): native, the same way
    upstream's iOS nightly does it: `brew install postgresql@14`, Redis 7.4.7
    built from source (checksum checked), then
    `pnpm --dir dev-env start:external`.
  - Backend start-up is setup time (`backend_s`).
  - Android reaches the PDS and Metro through `adb reverse tcp:3000` and
    `tcp:8081` (upstream's nightly); the fixture POSTs run on the host.
- **Devices**, as upstream's nightly, on the free standard runners:
  - Android: `ubuntu-latest` + KVM + `reactivecircus/android-emulator-runner`,
    API 34 google_apis x86_64, `pixel_6` at 720x1600@280 (set in
    `avd-config.sh`), 6 GB, 4 cores, heap 512 MB, SwiftShader with Vulkan off,
    animations off. Upstream runs this on a 32-core larger runner; here it is
    the standard 4-vCPU runner.
  - iOS: `macos-26` (standard arm64 runner; upstream uses the paid
    `macos-26-xlarge`), Xcode 26.4, an iPhone 17. **The simulator runtime is a
    workflow input, `ios_runtime`, and defaults to
    `com.apple.CoreSimulator.SimRuntime.iOS-26-2`; there is no fallback** — if
    the image does not have it, `boot-ios.sh` prints `xcrun simctl list
    runtimes` into `out/runtimes.txt` and fails. Earlier runs of this workflow
    asked for "iOS 26.5, else the newest iOS 26.x" and therefore measured
    26.5 while the local and 10tap cells measured 26.2, which a result row
    could not reveal after the fact. The resolved runtime is recorded in every
    row's `device` column. Password AutoFill off.
  - **`flow_list`** (input): space-separated flow names to narrow the suite for
    a validation dispatch; empty = all 19 stable flows. It applies to both arms,
    so a subset stays a like-for-like comparison, and the row carries
    `flow_list` and `flows_run` so it is never pooled with a full-suite row.
  - Device prep (setup, not suite time), the same for both arms:
    - Android: install the APK, `adb reverse`, the **ANR guard** (below),
      90 s for the fresh emulator's background work (as the 10tap benchmark),
      then a warm launch.
    - iOS: boot, AutoFill off, install, then a warm launch.
    - **Warm launch**: start the dev client pointed at Metro (Android: the
      `exp+bluesky://expo-development-client/?url=…` link; iOS:
      `--initialUrl http://localhost:8081`, the launch argument
      `e2e.config.ts` uses) and wait until Metro has built the app's own full
      bundle (max 900 s), then stop the app. Without it, the smoke runs built
      that bundle inside the first tests (iOS: 298–621 s), because the app's
      bundle request differs from the pre-warm URL (`warm_launch_s`).
    - Both tools clear the app's state at the start of each test (Maestro
      `launchApp clearState`), so the warm launch leaves nothing behind.
  - **ANR guard** (Android, input `anr_guard`, default `on`; copied from the
    10tap benchmark): on these runners the emulator's launcher ANRs ("Pixel
    Launcher isn't responding") and its dialog, or the launcher itself, takes
    over the screen; in the first full Android run (no guard) 2 of 5 `e2e`
    runs lost all 19 tests to taps landing on the launcher. The guard disables
    `com.google.android.apps.nexuslauncher` (the tests never use it) and a
    3-second watcher force-stops any other app that shows an "Application Not
    Responding" window, logging it to `anr.log`. `result.env` and `bench.csv`
    record `anr_guard` and `anr_events`.
- **Flow set**: the 19 stable flows, i.e. `__e2e__/flows/**` minus
  `thread-muting`, `create-account` and `profile-screen-edit` (red in
  upstream's nightly at the pinned commit). No flow is platform-gated.
- **`e2e`-arm recoveries** (`tests/support/app.ts`, all logged): on this host
  the iOS photo-library system prompt appears on the first launch after a state
  reset and stays over the app for the rest of the suite (25 of the 86 `e2e`
  failures in run 39704588488), and the dev launcher sits on "Searching for
  development servers…" when Metro cannot answer discovery (7 more, plus all 53
  of Maestro's `"Sign in" is visible` failures). The port now dismisses the
  prompt and opens the Metro link when either is on screen, and taps that need
  a state change (`tapUntilConfirmed`) re-tap until the app has actually
  received them. Maestro already had the first two (`launchApp permissions:
  all`, and fix **F2** in the fixed flow copy), so this brings arm C to the same
  footing rather than ahead of it. Each recovery logs one `[recovery]` line and
  `bench.csv` carries `recoveries` and `dropped_taps` per run: a run that is
  green because it recovered 40 times is not reported as a clean run.
- **Suite time** is the wall time of the tool's command, driver/engine start
  included (Maestro's driver install, agent-device's runner build on iOS).

## Summary columns

The summarize job writes a table per platform to the run summary and uploads
`bench.csv` (one row per run):
- `suite_s`: wall time of the tool's command.
- `shared_test_sum_s`: the sum of the per-test JUnit times over the tests that
  every run of both arms reported on that platform (like for like).
- `reliable_both_sum_s`: the same over the 3 flows that passed both local
  Maestro baseline passes on both platforms (`composer-self-label`,
  `home-screen`, `mod-lists`); `reliable_platform_sum_s` over the platform's
  reliable set (iOS 13, Android 5).
- `job_s`: the whole job, including setup, backend, Metro and device boot.
- Green runs, tests passed per run, and every failed test with its message.
  Failures are recorded, never dropped.
