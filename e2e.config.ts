import type {E2EConfig} from 'e2e'
import {mobile} from '@e2e-dev/mobile'

// Ported from __e2e__/config.yml (`flows/**`), the flows' `appId:
// xyz.blueskyweb.app`, and .github/workflows/nightly-e2e.yml. The flows run
// against the installed `e2e`-profile development build (EXPO_PUBLIC_ENV=e2e,
// RN_SRC_EXT=e2e.ts,e2e.tsx) on a Metro bundle (`METRO_URL`; CI uses 8081,
// this machine 8096; Android reaches it through `adb reverse`), and the
// dev-env backend from `dev-env/` (see MIGRATION.md).
export const BUNDLE_ID = 'xyz.blueskyweb.app'
export const METRO_URL = process.env.METRO_URL ?? 'http://localhost:8081'
const port = new URL(METRO_URL).port || '8081'

// The engine's two waits: `settle` is applied after an agent action, `transition`
// is the per-control wait for something that just appeared or moved. MEASURED DOWN
// from the 500/1000 this suite was originally tuned to: two full 18-flow iOS suites,
// one per pair, 15 of 17 common flows faster and -43.9 s overall (0.94x) at
// 150/500 - which is simply the ENGINE's own default, i.e. the values the engine
// runs with when a config says nothing. The 500/1000 were caution, not measurement.
// Maestro has the same class of knob (`waitUntilStabilityPeriod`) and its shipped
// flows never tune it, so this is not an unfair lever - but it IS a config change
// and it is reported as one (phase4/results-bluesky.md, deviations).
// One known cost, fixed in tests/mod-lists.e2e.ts: with less settling, a
// confirmation dialog can still be on screen when the next tap is dispatched, so
// two taps there now wait for their target the way Maestro's `tapOn` implicitly does.
// Env-overridable so a timing study can re-measure them; an unset env keeps these
// values. Not `undefined` when unset: `undefined` means "engine default", not "ours".
const waitMs = (v: string | undefined, dflt: number) =>
  v === undefined || v === '' ? dflt : Number(v)
const E2E_SETTLE = waitMs(process.env.E2E_SETTLE, 150)
const E2E_TRANSITION = waitMs(process.env.E2E_TRANSITION, 500)

// Metro serves the development build (skill: the one process that serves the
// app becomes `app.command`); an already running Metro is reused. It gets only
// the e2e profile's env, since `app.command` sees nothing of the shell's.
const metro = {
  command: {
    executable: 'pnpm',
    args: ['exec', 'expo', 'start', '--dev-client', '--port', port],
    env: {
      EXPO_PUBLIC_ENV: 'e2e',
      NODE_ENV: 'development',
      RN_SRC_EXT: 'e2e.ts,e2e.tsx',
    },
    reuseExisting: true,
    startupTimeout: 120_000,
    log: '.e2e/logs/metro.log',
  },
  readyUrl: `${METRO_URL}/status`,
}

// setupApp.yml grants the Android permissions by name; `launchApp` on iOS
// uses Maestro's default, all allowed.
const permissions = {
  notifications: 'grant',
  camera: 'grant',
  microphone: 'grant',
  photos: 'grant',
  contacts: 'grant',
} as const

// `simctl privacy` on the iOS 26.2 runtime cannot set notifications
// (UNSUPPORTED_CAPABILITY), so the iOS target grants the rest.
const {notifications: _notifications, ...iosPermissions} = permissions

export default {
  tests: 'tests/**/*.e2e.ts',
  // Maestro has no per-flow limit; the longest flows (composer, curate-lists)
  // run a few minutes, and setupApp waits up to 180 s for the first bundle.
  timeout: 900_000,
  // Maestro polls every assertVisible / extendedWaitUntil / tapOn for about
  // 17 s before it fails; e2e's default expect timeout is 5 s. Signing in
  // against a just-reset backend takes longer than that.
  assertionTimeout: 17_000,
  targets: [
    {
      name: 'ios',
      engine: mobile({
        platform: 'ios',
        device: process.env.E2E_IOS_DEVICE,
        // Env-overridable so a timing study can measure them without editing
        // the suite (see phase3/STATUS-3-bsky-e2e.md). Unset = the values the
        // suite was tuned with, so normal runs are unchanged.
        settle: E2E_SETTLE,
        transition: E2E_TRANSITION,
      }),
      app: {
        bundleId: BUNDLE_ID,
        permissions: iosPermissions,
        // The dev launcher opens this server by itself on iOS.
        launchArguments: [
          '--initialUrl',
          METRO_URL,
          '-EXDevMenuShowsAtLaunch',
          'NO',
          '-EXDevMenuIsOnboardingFinished',
          'YES',
          '-EXDevMenuShowFloatingActionButton',
          'NO',
        ],
        ...metro,
      },
    },
    {
      name: 'android',
      engine: mobile({
        platform: 'android',
        device: process.env.E2E_ANDROID_DEVICE,
        settle: 500,
        transition: 1000,
      }),
      app: {bundleId: BUNDLE_ID, permissions, ...metro},
    },
  ],
  workers: 1,
  reporters: ['list', 'junit'],
} satisfies E2EConfig
