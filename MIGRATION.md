# Migration to e2e

Source: Maestro, `__e2e__/flows/**` (config `__e2e__/config.yml`, setup `setupServer.js` + `setupApp.yml`; guide: https://e2e.tester.army/docs/migrate/maestro.md, engine: https://e2e.tester.army/docs/mobile.md)
e2e: `e2e.config.ts`, tests `tests/**/*.e2e.ts`, helpers `tests/support/`
Start dependencies: the dev-env mock backend (`pnpm e2e:mock-server`, ports 5433/6380/1986/3000) and Metro on 8096 (`EXPO_PUBLIC_ENV=e2e NODE_ENV=development RN_SRC_EXT=e2e.ts,e2e.tsx pnpm exec expo start --dev-client --port 8096`). The app must already be installed as the **e2e-profile development build**: `pnpm e2e:build` (iOS) / `pnpm e2e:build-android` (Android) — full recipes and durations in `../../results-3-bsky-build.md`. Android also needs `adb reverse tcp:3000/1986/8096` plus `tcp:8081→8096`.
Run old: `maestro test __e2e__/flows` (Maestro **2.10.0**, the repo's CI pin, installed at `phase3/tools/maestro-2.10.0`; the `maestro` on PATH is 2.2.0 and is NOT the baseline binary)
Run new: `pnpm exec e2e run --target ios` / `--target android` (`E2E_IOS_DEVICE` / `E2E_ANDROID_DEVICE` pick the device; `METRO_URL=http://localhost:8096`; on this machine also `AGENT_DEVICE_STATE_DIR=<private dir>` — see Gaps)
Harness: done — `phase4/scripts/bsky-arm.sh` + `bs-batch.sh` to HARNESS v2, rows in `phase4/data/bluesky.csv`
Defect check: off (no user to agree to a planted bug; recorded as a deviation)

Scope: **the 19 stable flows only**. Excluded (their YAML stays in the repo, unrun by either arm): `thread-muting`, `create-account` (both already red upstream), `profile-screen-edit` (**passed** in the Maestro baseline on both platforms — open porting work, no blocker).

Assertions counted as `a` (explicit: assertVisible, assertNotVisible, non-optional extendedWaitUntil; each file carries +1a for setupApp's "Sign in" wait) + `s` (steps that fail when the target is missing: tapOn/scrollUntilVisible; typing is not counted on either side) + `pt` (coordinate taps/swipes, which check nothing), subflows expanded, platform-gated blocks counted per platform. Tool: `phase3/tools/count-e2e-bsky.mjs` (its `HELPERS` table carries `tapCtrl`/`tapAtRest`/`openMedia`/`allowPhotoLibrary`). Full matrix + the per-flow evidence: `phase4/parity-bsky.md`.

| Source | e2e | Status | Assertions (source → e2e) | Passing | Defect check | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| flows/login.yml | tests/login.e2e.ts | ported | 2a+9s → 2a+9s | ios 3/3, android 2/3 | | android flake shared with Maestro (fixture reset) |
| flows/home-screen.yml | tests/home-screen.e2e.ts | ported | 4a+18s → 6a+18s | ios 3/3, android 3/3 | | +2a; 3 taps moved to `tapAtRest()` (the tab-bar taps leave the list settling) |
| flows/search-screen.yml | tests/search-screen.e2e.ts | ported | 4a+4s → 4a+3s | ios 3/3, android 3/3 | | −1s: `tapOn input` + `inputText` → one `pressSequentially` (see Gaps) |
| flows/profile-screen.yml | tests/profile-screen.e2e.ts | ported | 5a+10s+1pt → 5a+9s+1pt | ios 3/3, android 3/3 | | same −1s merge; the subscribe prompt still dismissed at 65%,35% |
| flows/thread-screen.yml | tests/thread-screen.e2e.ts | ported | 9a+14s → 11a+14s | ios 3/3, android 3/3 | | +2a: the repost sheet is scoped to bob's post (the YAML's lands on carla's) |
| flows/composer.yml | tests/composer.e2e.ts | ported | 18a+27s → 21a+27s | ios 3/3, android 2/3 | | +3a from `composerClosed()`; the slowest flow in the benchmark on iOS |
| flows/composer-self-label.yml | tests/composer-self-label.e2e.ts | ported | 6a+8s → 7a+8s | ios 3/3, android 3/3 | | |
| flows/feed-reorder.yml | tests/feed-reorder.e2e.ts | ported | ios 13a+25s → 15a+25s; android 9a+18s → 9a+18s | ios 3/3, android 3/3 | | iOS +2a: the combined check split per platform; `openFeedsEditor`/`dragFeedDown` helpers |
| flows/following-restore.yml | tests/following-restore.e2e.ts | ported | 8a+2s → 8a+2s | ios 3/3, android 3/3 | | |
| flows/mod-lists.yml | tests/mod-lists.e2e.ts | ported | 4a+15s → 4a+15s | ios 3/3, android 3/3 | | |
| flows/onboarding.yml | tests/onboarding.e2e.ts | ported | ios 8a+10s+3pt → 9a+11s+4pt; android 6a+9s+2pt → 6a+9s+3pt | ios 3/3 (after the swipe fix; 1/3 before), android 3/3 | | iOS photo-library alert + crop-editor confirm; Android `device.back()` for the picker |
| flows/onboarding-avatar-creator.yml | tests/onboarding-avatar-creator.e2e.ts | ported | ios 6a+14s+3pt → 6a+14s+4pt; android 8a+14s+5pt → 8a+14s+6pt | ios 3/3 (after the swipe fix; 1/3 before), android 3/3 | | Android drags the half-expanded sheet up (`swipePercent`) |
| flows/post-report-flow.yml | tests/post-report-flow.e2e.ts | ported | 2a+6s+1pt → 2a+6s+1pt | ios 3/3, android 3/3 | | |
| flows/report-dialog/account.default.yml | tests/report-dialog/account.default.e2e.ts | ported | 3a+7s → 3a+7s | ios 3/3, android 3/3 | | |
| flows/report-dialog/post.default.yml | tests/report-dialog/post.default.e2e.ts | ported | 3a+6s → 3a+6s | ios 3/3, android 3/3 | | |
| flows/report-dialog/post.edit-reason.yml | tests/report-dialog/post.edit-reason.e2e.ts | ported | 7a+10s → 7a+10s | ios 3/3, android 3/3 | | |
| flows/report-dialog/post.reason-other.yml | tests/report-dialog/post.reason-other.e2e.ts | ported | 4a+7s → 4a+7s | ios 3/3, android 3/3 | | |
| flows/shared-prefs.yml | tests/shared-prefs.e2e.ts | ported | 9a+9s → 9a+9s | ios 3/3, android 2/3 | | android: Storybook body renders blank for Maestro (its F5 nudge didn't help) |
| flows/curate-lists.yml | tests/curate-lists.e2e.ts | ported | 29a+52s+2pt → 31a+53s+1pt | **blocked** on ios (both arms), android 2/3 | | `Delete List` never reached; kept, never weakened; excluded from benchmark scope on both arms |
| flows/thread-muting.yml | — | not ported | 23a+29s | | | out of scope: `notifsFeed` absent deterministically, both platforms |
| flows/create-account.yml | — | not ported | ios 4a+14s+2pt; android 3a+17s+2pt | | | out of scope: red upstream |
| flows/profile-screen-edit.yml | — | not ported | 19a+28s | | | out of scope; **passed** in the Maestro baseline — the obvious next port |

## Shared helpers

| Source | e2e | Used by |
| --- | --- | --- |
| `setupServer.js` + `setupApp.yml` | `tests/support/app.ts` `bluesky()` → `setupServer()` + `setupApp()` (fixture, every test) | every test |
| `setupApp.yml`'s dev-client launch | `openDevClient()` (Android needs the `exp+bluesky://` link; iOS gets `--initialUrl`) | every test |
| `tapOn: e2eSignIn*` (1×1 stacked controls) | `tapCtrl()` — taps the node's **top-left corner**, because agent-device rounds a 1×1 centre onto the neighbour | every test |
| `waitForAnimationToEnd` before a moving control | `tapAtRest()` (poll `boundingBox` until two reads agree) | home-screen, composer, curate-lists |
| `assertVisible: composeFAB` after publish | `composerClosed()` (Android's FAB is visible *behind* the Processing sheet) | composer, composer-self-label |
| `tapOn: openMediaBtn` + the iOS alert | `openMedia()` / `allowPhotoLibrary()` | composer, onboarding |
| `point: "x%,y%"` | `tapAtPercent()` (iOS: the application node's box; Android: `adb shell wm size`) | onboarding*, profile-screen, post-report-flow |
| `swipe: {start, end, duration}` | `swipePercent()` | onboarding-avatar-creator |

## Gaps

- **Android's `composeFAB` lies.** `assertVisible: composeFAB` passes while the "Processing…" sheet is still on screen with the FAB *behind* it, so the next FAB tap is swallowed. Maestro lives with this because its own tap retries; `e2e` needs `composerClosed()`. This is why composer is +3a and why it is the slowest flow in the benchmark on iOS (9 publish cycles × a hidden-wait + a resting-poll).
- **"Type into whatever has focus" doesn't exist.** `inputText` with no target became `pressSequentially` on the field itself, which merges 2 YAML steps into 1 (`profile-screen`, `search-screen`): tapping the field first leaves the keyboard up and drops the field out of agent-device's next snapshot.
- **iOS photo-library alert.** `photos: grant` doesn't survive `clearState`, and `device.alert` can't see the alert's "Allow Full Access" button, so `allowPhotoLibrary()` polls for it by label and taps it. Without this, one stuck alert poisoned every later iOS test (193 s "Sign in" timeouts).
- **Android system photo picker** shows MediaStore photos, which the fixtures don't seed (media is seeded app-scoped for the composer's mocked picker), so `onboarding` dismisses it with `device.back()` — the same step the YAML takes.
- **The avatar-creator bottom sheet opens half-expanded** on the 720×1600 e2e AVD; `swipePercent` drags it up before the emoji grid assert. Maestro's `waitForAnimationToEnd` happened to cover this.
- **iOS 26.2 `simctl privacy` cannot set notifications** (`UNSUPPORTED_CAPABILITY`), so the iOS target grants the rest.
- **The onboarding pager swallows the second swipe** on iOS sometimes → `getByText("Complete onboarding…")` at match count 0 (arm C failed 2 of 3 benchmark runs, both onboarding tests, run 2 passed). Fixed by repeating the flow's own gesture ≤2 extra times with the `expect()` left as the only check. `mobile()`'s `settle`/`transition` were measured as an alternative lever and rejected — `settle` applies only to *agent* actions, never to a test's own steps.
- A global agent-device daemon of another version on this machine owns `~/.agent-device`; every `e2e`/agent-device run needs `AGENT_DEVICE_STATE_DIR=/Users/cristian.ceban/Desktop/maestro-vs-e2e/phase3/agent-device-state`.
- **`e2e` ignores `reuseExisting: true` when `CI` is set** — it then demands its own Metro and dies with `APP_ALREADY_RUNNING` if 8096 is already up. That cost 4 benchmark runs. Don't export `CI` for `e2e` runs here.

## Next

- `profile-screen-edit` is the one baseline-green flow left unported.
- `setupApp()`'s 3 s settle is **load-bearing, not experimental** (the `// EXPERIMENT` marker is gone; the reason is now in the code). Removing it as an optimisation cost a whole suite run: 14 of 18 tests dropped their sign-in tap (~15.4 s each) and `mod-lists` failed. It is e2e's equivalent of `setupApp.yml`'s `waitForAnimationToEnd`. Do not remove it on the strength of a solo-flow probe — solo runs are cold starts and cannot see this race; only a full-suite A/B can.
- `curate-lists` on iOS stays `blocked` on both arms; it needs an app-side or fixture-side change, not a weaker assertion.
- Suggested feedback (drafted with `npx e2e feedback --dry-run`, **not sent**): see `phase3/STATUS-3-bsky-e2e.md`.
- No Maestro flow was deleted — the user decides that.
