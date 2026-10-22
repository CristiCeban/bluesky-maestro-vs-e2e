import type {App, Locator, Screen} from 'e2e'
import {expect} from 'e2e'
import type {Device} from '@e2e-dev/mobile'
import {test as base} from '@e2e-dev/mobile'
import {BUNDLE_ID, METRO_URL} from '../../e2e.config'
import {androidScreenSize} from './android'
import {setupServer} from './server'

type Ctx = {app: App; device: Device; platform: string; screen: Screen}

/**
 * Ported from __e2e__/setupApp.yml: a fresh launch with cleared state, then
 * wait for "Sign in". The permissions the flow names (Android) are the
 * targets' `app.permissions` in e2e.config.ts, set before every fresh launch.
 * `waitForAnimationToEnd` has no step of its own: the mobile engine waits out
 * a control's transition before acting on it (`mobile({ transition })`).
 */
export async function setupApp({app, device, platform, screen}: Ctx) {
  await app.clearState()
  const signInScreen = screen.getByText('Sign in').first()
  // 180 s for the app's own first screen, the budget `setupApp.yml`'s
  // `extendedWaitUntil` uses - but looked at PROPERLY. The published version of
  // this line was a blind `expect().toBeVisible({timeout: 180_000})`, and on a
  // CI host that is a wait on a screen the test can never act on:
  //  - iOS 26 asks for full photo-library access on the FIRST launch after a
  //    state reset, whatever the test does (`app.clearState()` drops the
  //    target's `photos: 'grant'`, which on iOS is TCC state, not app data),
  //    and the alert is a separate window that REMOVES the app's nodes -
  //    25 of the `e2e` arm's 86 failures in GHA run 39704588488 have it on
  //    screen, 15 of 19 in one run, on tests that never touch media. The local
  //    cell cannot see this: the bench sim already has full access persisted
  //    and `clearState` does not undo that. Maestro is immune because its
  //    iOS `launchApp` default is `permissions: all`, which auto-taps system
  //    prompts (`__e2e__/setupApp.yml`); `allowPhotoLibrary()` only covered the
  //    two flows that reach media (gap 2).
  //  - on a starved runner the dev launcher sits on "Searching for development
  //    servers..." even though the launch arguments carry `--initialUrl`: 7 of
  //    the same 86 failures plus all 53 of Maestro's "Sign in is visible"
  //    failures are that screen. Opening the Metro link is what F2 does for
  //    Maestro on Android; this is the same recovery, both platforms.
  // Both recoveries are waits, not assertions - nothing is weakened, and a
  // healthy launch costs one extra 250 ms read and logs nothing. Every firing
  // logs itself so the host problem stays countable per run.
  await waitForAppScreen({device, platform, screen}, signInScreen)
  // LOAD-BEARING. This wait looks like a `// EXPERIMENT` and I deleted it as an
  // optimisation, so probe t6 measured what it actually buys: without it, 14 of
  // 18 tests in a suite dropped their sign-in tap (sign-in attempt 2 fired at
  // ~15.4 s each, ~+170 s) and mod-lists failed outright. "Sign in" is visible
  // while Bluesky's splash is still animating out, and a tap dispatched in that
  // window is swallowed - the command still completes, and TestCtrls.e2e.tsx:30
  // then never runs, so there is simply no session. This is the same race Maestro
  // names directly: setupApp.yml's last step is `waitForAnimationToEnd`, and the
  // fixed copy additionally wraps the tap in `retry: maxRetries: 4` (F1).
  //
  // It costs ~3 s x 18 tests. `signIn`'s retry is NOT a substitute for it: with
  // only the retry, detecting and recovering each dropped tap cost ~5x what
  // preventing it costs. Cheap prevention, expensive insurance - both kept.
  await new Promise(resolve => setTimeout(resolve, 3000))
}

/**
 * `tapOn: e2eSignInAlice`, and the wait the flow's own next step does anyway.
 *
 * "Sign in" is on screen while Bluesky's splash is still animating out, and a
 * sign-in tap dispatched in that window does nothing - the tap command still
 * completes, and `TestCtrls.e2e.tsx:27` awaits a real network login, so a
 * dropped tap simply means no session. Maestro hit exactly this (4 iOS failures
 * in the baseline, cause 1 of results-3-bsky-maestro.md) and its fixed copy
 * wraps the tap and the flow's next wait in `retry: maxRetries: 4` (F1).
 *
 * This is the same shape, and it replaces a fixed 3 s settle that this file used
 * to pay before EVERY test on BOTH platforms: poll for a logged-in marker after
 * the tap, and tap again if it does not arrive. A run where the first tap landed
 * costs one extra observation instead of three seconds; a run where it was dropped
 * recovers, which a fixed wait could not always do.
 *
 * THE WINDOW HAS TO BE LONGER THAN THE LOGIN, OR THE RETRY IS PURE COST.
 * `TestCtrls.e2e.tsx:27` awaits a real network login against the dev PDS, and
 * probe t4 measured that taking 2.8 s on a good run and over 4 s routinely. A
 * first version of this helper polled 4 s and re-tapped, and it fired on 3 of 4
 * tests - ~4.5 s BURNED per test on a race that never happened, because the tap
 * had landed and its login was simply still in flight. That is slower than the
 * settle it replaced, so it is not a fix. 12 s now: comfortably past the observed
 * login time, and a genuinely dropped tap still costs only the 12 s before it is
 * retried, once, against the caller's own 17 s assertionTimeout afterwards.
 *
 * The marker has to be one that only exists WITH a session - the logged-out
 * shell also has a tab bar, so `bottomBarHomeBtn` would read as "signed in"
 * after a dropped tap and the retry would never retry. `viewHeaderHomeFeedPrefsBtn`
 * is the home-feed header control, and it is what the flows themselves assert
 * immediately after signing in (composer, mod-lists, onboarding, shared-prefs,
 * curate-lists, post-report-flow, composer-self-label all do), so it is a check
 * the suite already performs, not a new one. A caller whose first target differs
 * can pass its own marker.
 */
export async function signIn(
  screen: Screen,
  testId = 'e2eSignInAlice',
  marker?: Locator,
): Promise<void> {
  const loggedIn = marker ?? screen.getByTestId('viewHeaderHomeFeedPrefsBtn')
  for (let attempt = 0; attempt < 2; attempt++) {
    await tapCtrl(screen, testId)
    // The same 12 s window as before, through `waitVisiblePastPrompts` so an
    // iOS photo-library prompt that arrives AFTER "Sign in" was already visible
    // cannot sit over the app for the whole window: GHA run 39704588488 run 1,
    // `login` - "Sign in" passed at 25.6 s, the alert appeared after it and the
    // change list reads `removed application "Blue Sky"`.
    if (await waitVisiblePastPrompts(screen, loggedIn, 12_000)) return
  }
  // Two dropped taps is not a dropped-tap race any more; report it the way the
  // caller would have, rather than returning a session-less screen.
  await expect(loggedIn).toBeVisible()
}

/** The iOS 26 system prompt for full photo-library access, by its button label. */
const PHOTO_ALERT_ALLOW = 'Allow Full Access'

/** How often the prompt may be probed, anywhere in the suite, in ms. */
const PROMPT_PROBE_MS = 2_000
let nextPromptProbe = 0

/**
 * One look at the iOS photo-library prompt, tapped away if it is up.
 * See `setupApp` for why this runs on every launch rather than only in the
 * flows that reach media. `device.alert` cannot reach this one (gap 2: it does
 * not see the "Allow Full Access" button), so it is tapped by its label.
 * Returns whether a prompt was dismissed - callers log it so the recovery's
 * firing rate stays countable per run.
 *
 * IT THROTTLES ITSELF, AND IT HAS TO. One `isVisible()` is one snapshot round
 * trip through the engine, and every caller here sits in a poll loop; probing
 * per poll would add a snapshot per poll and buy nothing, in a study whose
 * subject is speed. So a probe is only performed once per `PROMPT_PROBE_MS`
 * suite-wide, and every other call is free. A prompt is up for as long as
 * nobody taps it, so a 2 s look costs at most 2 s of recovery, against the
 * 25 failures one unanswered prompt caused in the published CI run.
 */
export async function dismissPhotoLibraryPrompt(
  screen: Screen,
): Promise<boolean> {
  const now = Date.now()
  if (now < nextPromptProbe) return false
  nextPromptProbe = now + PROMPT_PROBE_MS
  const allow = screen.getByText(PHOTO_ALERT_ALLOW)
  // The button alone is the trigger: while the alert is up it is a separate
  // window that removes the app's own nodes, so matching on the app or on the
  // prompt title in addition would only add a way to miss it.
  if (!(await allow.isVisible())) return false
  await allow.tap()
  return true
}

/**
 * Poll a caller-supplied probe until it says yes, dismissing the iOS
 * photo-library prompt whenever it is in the way, and say whether it ever did.
 *
 * `waitFor({state:'visible'})` cannot do this: on iOS the alert is a separate
 * window that removes the app's nodes from the tree (GHA run 39704588488,
 * `login` run 1: the alert arrives 25 s AFTER "Sign in" passed, and the change
 * list reads `removed application "Blue Sky"`), so waiting harder just waits
 * longer on a screen the test can never act on. A wait, not an assertion - the
 * caller's `expect()` stays the only check.
 *
 * The probe is a predicate rather than a locator because the right question
 * differs per caller and the wrong question would ADD failures: `isVisible()`
 * is right for "is the app's first screen up", and wrong for a dialog row that
 * is mounted but scrolled below the fold, which would read as not-visible and
 * trigger a re-tap a passing run never needed. `tapUntilConfirmed` therefore
 * asks for PRESENCE (`count() > 0`), which is the exact condition the observed
 * failures report - `locator matched no nodes within
 * getByTestId("report:option:Spam")`, match count 0 - and which the screen dump
 * confirms is a real state change: the option rows do not exist in the tree
 * until a category is selected.
 */
export async function waitForPastPrompts(
  screen: Screen,
  probe: () => Promise<boolean>,
  timeout: number,
  pollMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await probe()) return true
    if (await dismissPhotoLibraryPrompt(screen)) {
      console.log(
        '[recovery] dismissed the iOS photo-library prompt while waiting for a locator',
      )
      continue
    }
    const left = deadline - Date.now()
    if (left <= 0) return false
    await new Promise(r => setTimeout(r, Math.min(left, pollMs)))
  }
}

/** `waitForPastPrompts` asking whether a locator is on screen. */
export const waitVisiblePastPrompts = (
  screen: Screen,
  locator: Locator,
  timeout: number,
): Promise<boolean> =>
  waitForPastPrompts(screen, () => locator.isVisible(), timeout)

/**
 * `waitForPastPrompts` asking whether a locator is in the tree at all. The poll
 * is 500 ms, not the 250 ms `signIn` measures with: this is called from
 * `tapUntilConfirmed` with a small per-attempt budget, and each read is an
 * engine snapshot on a 3-core host. For scale, the step this replaces polled at
 * ~200 ms internally for its full 17-30 s ("waitFor gave up after 85 reads in
 * 17.1s"), so a failing tap here costs fewer reads than it used to, and a
 * healthy one costs exactly one.
 */
export const waitPresentPastPrompts = (
  screen: Screen,
  locator: Locator,
  timeout: number,
): Promise<boolean> =>
  waitForPastPrompts(
    screen,
    async () => (await locator.count()) > 0,
    timeout,
    500,
  )

/**
 * Tap something and PROVE the app took it, tapping again if it did not.
 *
 * The report-dialog family fails as a silently-dropped tap: the tap command
 * completes (`tap button "Create report for Misleading" (appeared after 609ms)
 * (1.2s)`) and the app never advances a single node - `screen: unchanged since
 * step 6`, then the next locator's 30 s lookup dies on a dialog still on step
 * 1. Screenshot-proven in `phase4/STATUS-4-v31-local.md`, and the same race the
 * suite already names for the sign-in tap (E1/F1) and `mod-lists` (gap 8), on a
 * button that had just appeared.
 *
 * "Confirmed" is the state the very next step needs anyway (here: the reason
 * list that only the category tap can open), so a healthy tap costs ONE extra
 * read - the confirmation is already on screen - and no timeout is inflated.
 * Every re-tap logs itself, which keeps the underlying drop countable per run:
 * `grep -c '\[recovery\] re-tapped' <run>/stdout.log` is the drop rate, so
 * making the suite green does not hide what the engine did.
 *
 * THE RE-TAP MUST NOT BE A SECOND ACTION ON AN APP THAT ALREADY MOVED ON.
 * A tap that landed SLOWLY also shows no confirmation inside the budget, and by
 * then the target may be gone (the menu it lived in has closed). Tapping
 * something that is not there would fail the test outright and turn a
 * slow-but-correct run into a new red one, so before any re-tap the target is
 * looked for: when it is gone, this waits out one more budget and returns rather
 * than tapping. Call sites additionally choose confirmations whose producing
 * tap is idempotent (selecting the same report category twice is the same
 * state), and no call site taps a submit/publish control.
 */
export async function tapUntilConfirmed(options: {
  screen: Screen
  target: Locator
  confirmed: Locator
  label: string
  attempts?: number
  /** Budget per attempt to see the confirmation before re-tapping. */
  perAttempt?: number
}): Promise<void> {
  const {screen, target, confirmed, label} = options
  const attempts = options.attempts ?? 3
  const perAttempt = options.perAttempt ?? 8_000
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1 && (await target.count()) === 0) {
      console.log(
        `[recovery] ${label}: target gone before re-tap, waiting once more instead of tapping twice`,
      )
      if (await waitPresentPastPrompts(screen, confirmed, perAttempt)) return
      break
    }
    await target.tap()
    if (await waitPresentPastPrompts(screen, confirmed, perAttempt)) {
      if (attempt > 1) {
        console.log(
          `[recovery] re-tapped ${label} on attempt ${attempt}: the app never received tap ${attempt - 1}`,
        )
      }
      return
    }
  }
  // Out of taps. Report it the way the caller would have, on the confirmation
  // the app was supposed to reach - not on whatever locator comes next.
  await expect(confirmed).toBeVisible()
}

/**
 * The wait `setupApp` performs for the app's own first screen: the 180 s budget
 * of `setupApp.yml`'s `extendedWaitUntil`, but with the two recoveries a CI host
 * needs (see `setupApp`) folded in. Returns when `appScreen` is visible; fails
 * the way the caller would have if it never is.
 */
async function waitForAppScreen(
  {device, platform, screen}: Omit<Ctx, 'app'>,
  appScreen: Locator,
  timeout = 180_000,
): Promise<void> {
  const launcher = screen.getByText(/^development servers$/i)
  const deadline = Date.now() + timeout
  let opened = false
  for (;;) {
    if (await waitVisiblePastPrompts(screen, appScreen, 2_000)) return
    // The dev launcher never got a Metro answer even though the launch carries
    // `--initialUrl` (GHA run 39704588488: this screen at 7 `e2e` failures and
    // at all 53 of Maestro's "Sign in" failures). `openLink` is the same
    // recovery F2 performs for Maestro on Android. One open per launch: if the
    // launcher is still up after it, keep waiting out the budget - the launcher
    // may just be slow, and hammering openLink would not help.
    if (!opened && (await launcher.isVisible())) {
      console.log(
        '[recovery] dev launcher still searching for development servers, opening the Metro link',
      )
      await device.openLink(
        `exp+bluesky://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`,
        {app: BUNDLE_ID},
      )
      opened = true
      continue
    }
    if (Date.now() >= deadline) break
    await new Promise(r => setTimeout(r, 250))
  }
  await expect(appScreen).toBeVisible({timeout})
}

/**
 * Points a freshly launched development build at Metro, which CI's Maestro run
 * gets from `launchApp` alone (Metro on the default 8081). On iOS the target's
 * launch arguments normally carry `--initialUrl`; Android's dev launcher ignores
 * them, so the link is the only channel it has. Kept non-throwing on purpose:
 * `following-restore` calls it after a mid-test relaunch and then asserts the
 * screen itself. `setupApp` uses `waitForAppScreen`, which is this with the
 * 180 s budget and the photo-library prompt folded in.
 */
export async function openDevClient(
  {device, platform, screen}: Omit<Ctx, 'app'>,
  appScreen: Locator,
) {
  const launcher = screen.getByText(/^development servers$/i)
  await expect
    .poll(
      async () => {
        if (platform === 'ios' && (await dismissPhotoLibraryPrompt(screen))) {
          console.log(
            '[recovery] dismissed the iOS photo-library prompt in openDevClient',
          )
        }
        return (await launcher.isVisible()) || (await appScreen.isVisible())
      },
      {timeout: 60_000},
    )
    .toBe(true)
  if (await launcher.isVisible()) {
    await device.openLink(
      `exp+bluesky://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`,
      {app: BUNDLE_ID},
    )
  }
}

/**
 * setupServer.js + setupApp.yml as one fixture. `serverPath` is the flow's
 * SERVER_PATH (a list posts one after another, as the flow's `runScript`s
 * did); the fixture runs before the test body, for every test of the file.
 */
export function bluesky(serverPath: string | string[]) {
  return base.extend<{signedOut: void}>({
    signedOut: async ({app, device, platform, screen}, use) => {
      for (const p of [serverPath].flat()) await setupServer(p)
      await setupApp({app, device, platform, screen})
      await use()
    },
  })
}

/**
 * Maestro's `point: "x%,y%"`: a point at a share of the screen. e2e takes
 * viewport points only and has no viewport-size read, so the size is the
 * application node's box on iOS and `adb shell wm size` on Android
 * (agent-device's Android points are physical pixels).
 */
export async function tapAtPercent(
  {device, platform, screen}: Omit<Ctx, 'app'>,
  xPct: number,
  yPct: number,
) {
  const box = await screenBox(device, platform)
  await screen.tapAt({
    x: box.x + (box.width * xPct) / 100,
    y: box.y + (box.height * yPct) / 100,
  })
}

export async function screenBox(device: Device, platform: string) {
  const box =
    platform === 'android'
      ? await androidScreenSize()
      : await device.locator('role=application').boundingBox()
  if (!box) throw new Error('no screen size')
  return box
}

/** Maestro's `swipe: { start: "x%,y%", end: "x%,y%", duration }`. */
export async function swipePercent(
  {device, platform, screen}: Omit<Ctx, 'app'>,
  from: [number, number],
  to: [number, number],
  duration: number,
) {
  const box = await screenBox(device, platform)
  const at = ([x, y]: [number, number]) => ({
    x: box.x + (box.width * x) / 100,
    y: box.y + (box.height * y) / 100,
  })
  await screen.swipe({from: at(from), to: at(to), duration})
}

/**
 * Maestro's `waitForAnimationToEnd`, which the mobile engine has no step for:
 * the engine only checks that the *tapped* control stopped moving
 * (`mobile({ transition })`), so a neighbour still sliding in from a re-render
 * makes the tap fail with "Ref ... had no confirmed resting position when the
 * transition window ran out" before anything is dispatched. Poll the node's box
 * until two reads agree, then hand it to a plain tap. Nothing is asserted about
 * the app here; it is a settle, not a check.
 */
export async function tapAtRest(locator: Locator, options?: {tries?: number}) {
  const box = async () => {
    const b = await locator.boundingBox()
    return b && [b.x, b.y, b.width, b.height]
  }
  let last = await box()
  for (let i = 0; i < (options?.tries ?? 20); i++) {
    await new Promise(r => setTimeout(r, 250))
    const now = await box()
    if (now && last && now.every((v, j) => Math.abs(v - last![j]) < 1)) break
    last = now
  }
  await locator.tap()
}

/**
 * The e2e build's hidden controls (`TestCtrls.e2e.tsx`) are 1x1 buttons stacked
 * one point apart. agent-device taps a node's centre, (x + 0.5, y + 0.5), which
 * lands on the neighbour below, so the tap goes to the node's top-left corner.
 */
export async function tapCtrl(screen: Screen, testId: string) {
  await screen.getByTestId(testId).tap({position: {x: 0, y: 0}})
}

/**
 * Waits for the composer sheet to go away after publishing. The source asserts
 * only `composeFAB`, and on Android that already passes while the sheet is still
 * on screen in "Processing..." - the FAB sits *behind* it - so the next
 * `composeFAB` tap lands on the dismissing sheet and is swallowed (the composer
 * never opens; `composerTextInput` then never appears). A wait, not a check: the
 * flow asserts nothing about it.
 */
export async function composerClosed(screen: Screen) {
  await screen
    .getByTestId('composePostView')
    .waitFor({state: 'hidden', timeout: 30_000})
}

/**
 * Taps the composer's media button. On iOS the first use asks for the photo
 * library even though the target grants `photos` (the grant does not stick
 * across `clearState`); the system alert hides the app and `device.alert`
 * does not find its "Allow Full Access" button, so it is tapped by its label.
 */
export async function openMedia(screen: Screen) {
  await screen.getByTestId('openMediaBtn').tap()
  await allowPhotoLibrary(screen, screen.getByTestId('selectedPhotosView'))
}

/** Waits for `next` or the photo-library alert, and allows the alert. */
export async function allowPhotoLibrary(screen: Screen, next: Locator) {
  const allow = screen.getByText('Allow Full Access')
  await expect
    .poll(async () => (await allow.isVisible()) || (await next.isVisible()), {
      timeout: 10_000,
    })
    .toBe(true)
  if (await allow.isVisible()) await allow.tap()
}

/**
 * Maestro's `inputText`, measured against it and LOSING.
 *
 * The obvious move is `fill`, which reads as the one-call equivalent of Maestro's
 * bulk insert. Probe t4/t5 measured it on the device and it is not: on iOS `fill`
 * is ONE agent round-trip that types into the field, not a paste, and it costs
 * MORE than typing - 3.9 s for 14 chars and 7.1 s for 41, against 3.6 s and 5.9 s
 * for the same strings through `pressSequentially`. Nine calls: 49.0 s with
 * `fill`, 38.9 s with keystrokes, and composer itself 174.2 s vs 127.6 s. So the
 * suite keeps the keystroke path and this helper exists to say so in one place.
 * Maestro's `inputText` really is bulk on Android (`adb shell input text`); on an
 * iOS simulator there is no bulk-insert channel to reach, which is why the same
 * mapping loses on iOS and won on Android.
 *
 * Keystroke typing is not an `s` on this project's parity scale, on either arm.
 */
export async function inputText(locator: Locator, text: string) {
  await locator.pressSequentially(text)
}

/**
 * The onboarding pager's last step, reached after the flow's two swipes.
 *
 * `onboarding.yml` swipes twice and asserts "Complete onboarding and start
 * using your account". That string is NOT on the last page - it is the label
 * of the `onboardingFinish` button, and StepFinished/index.tsx:335 renders it
 * only while its `subStep` state is 2. The pager (ValuePropositionPager.tsx)
 * tracks pages through PagerView's `onPageSelected`, which on iOS sometimes
 * does not fire for the final page, so the view shows page 2 while the app's
 * state says page 1 and the button still reads "Next". The assert then can
 * never pass, whatever the gesture does - the benchmark hit this in 2 of 3
 * iOS runs, in both onboarding tests, on `match count 0`.
 *
 * A probe replayed it and four more swipes in a row changed nothing: the
 * horizontal scroll bar stayed at value="0%" and the button stayed "Next".
 * Extra gestures can't fix a state the gestures already moved past. What does
 * is the screen's own control: pressing "Next" runs StepFinished's `onPress`,
 * which advances `subStep` the same way a page selection would. So press it
 * until the step below is on screen - at most the two presses the two swipes
 * stood for. Nothing is asserted here and no check is weakened: the caller's
 * `expect(finish).toBeVisible()` stays the only check and a run that needs no
 * recovery (the normal case, both swipes landed) executes zero extra steps.
 */
export async function recoverOnboardingFinishStep(screen: Screen) {
  const finish = screen.getByText(
    'Complete onboarding and start using your account',
  )
  const next = screen.getByTestId('onboardingFinish')
  for (let i = 0; i < 2 && !(await finish.isVisible()); i++) {
    if (!(await next.isVisible())) break
    await next.tap()
  }
  return finish
}
