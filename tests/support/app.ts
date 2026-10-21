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
  await openDevClient(
    {device, platform, screen},
    screen.getByText('Sign in').first(),
  )
  await expect(screen.getByText('Sign in').first()).toBeVisible({
    timeout: 180_000,
  })
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
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      if (await loggedIn.isVisible()) return
      await new Promise(r => setTimeout(r, 250))
    }
  }
  // Two dropped taps is not a dropped-tap race any more; report it the way the
  // caller would have, rather than returning a session-less screen.
  await expect(loggedIn).toBeVisible()
}

/**
 * Points the freshly launched development build at Metro, which CI's Maestro
 * run gets from `launchApp` alone (Metro on the default 8081). On iOS the
 * target's launch arguments carry `--initialUrl`; Android's dev launcher
 * ignores them, so the link opens the server.
 */
export async function openDevClient(
  {device, platform, screen}: Omit<Ctx, 'app'>,
  appScreen: Locator,
) {
  if (platform !== 'android') return
  const launcher = screen.getByText(/^development servers$/i)
  await expect
    .poll(
      async () => (await launcher.isVisible()) || (await appScreen.isVisible()),
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
