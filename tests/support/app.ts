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

/**
 * Answer the deep-link handoff the way iOS wants it answered, immediately after
 * THIS SUITE opened the link, without reading the accessibility tree first.
 *
 * `dismissBlockingPrompt` finds the same dialog by locator, and that works - GHA run
 * 39840373292 traces show `tap getByRole("button", "Open") ✓` recovering a `login`
 * that had never got past the launcher on CI before. What it cannot do is answer a
 * prompt on a host that will not give it a tree to look at, and that is a real
 * failure mode here: two of the three jobs in run 39840373292 died in `beforeEach`
 * with `snapshot failed: app 'xyz.blueskyweb.app' is not running … if a system
 * prompt such as a deep-link confirmation holds its launch, answer it with alert
 * accept`.
 * The engine is describing this exact situation and naming the call that survives
 * it: `device.alert` is a direct native command, not a read of the tree that just
 * failed.
 *
 * WHY CALLING `accept` BLINDLY IS ACCEPTABLE HERE, which it would not be generally.
 * It runs in the ~5 s window after our own `openLink`, where the only dialog iOS
 * raises is the handoff one (that is what the 8-of-8-vs-0-of-86 count in FINDING 7
 * established). If some other prompt were up instead, the only candidate is the
 * photo-library one, and accepting it grants exactly what the target already asks
 * for (`app.permissions` includes photos; the Maestro arm auto-confirms every
 * prompt via `launchApp permissions: all` and passes with that grant). Accepting is
 * therefore the intended outcome for every alert that can be up in this window;
 * there is no alert here whose "Cancel" the suite wants.
 *
 * It is un-throttled by design, unlike the locator probe, because it costs no
 * snapshot: one native command, at most once per launch (the caller's `opened` flag
 * admits one `openLink` per launch). Its one honest cost: the call takes the
 * daemon's own timeout when the daemon is the thing that is wedged, so on a host
 * already failing this way it can add tens of seconds to a launch. That is accepted
 * for the same reason `openLink` itself is - the alternative is a 180 s wait on a
 * screen the test cannot act on, and it only happens on runs that were going to fail.
 *
 * Two outcomes are logged SEPARATELY, and that is the whole point of the shape.
 * Whether `device.alert('accept')` throws or returns quietly when no alert is up is
 * a detail of the current daemon that this file must not depend on, so it is never
 * reported as a success on the strength of the call returning. A prompt we could
 * SEE is reported as seen-and-tapped by the locator path in `dismissBlockingPrompt`;
 * this blind call reports only that it was ATTEMPTED, which stays true and countable
 * whichever way the daemon behaves. A run whose counters show blind attempts but no
 * seen prompts is telling us the tree is unreadable, not that prompts were cleared.
 */
async function acceptLaunchHandoff(device: Device): Promise<void> {
  try {
    await device.alert('accept')
    console.log(
      '[recovery] blind-accepted the launch prompt after opening the Metro link',
    )
  } catch {
    // The daemon refused: most likely no alert is up (the normal case on iOS 26.2,
    // where the handoff is auto-confirmed or never raised). The caller's own wait is
    // what decides whether the launch worked, so this is not a failure to report.
    console.log(
      '[recovery] blind launch-prompt accept found no prompt to answer',
    )
  }
}

/** The iOS 26 system prompt for full photo-library access, by its button label. */
const PHOTO_ALERT_ALLOW = 'Allow Full Access'

/** What `dismissBlockingPrompt` removed, so callers can log/count each kind. */
export type BlockedBy = 'photo-library' | 'open-in-app'

/** How often the prompt may be probed, anywhere in the suite, in ms. */
const PROMPT_PROBE_MS = 2_000
let nextPromptProbe = 0

/**
 * One look at a BLOCKING iOS system prompt, tapped away if it is up. Returns
 * which prompt it dismissed, or false when it saw nothing to do.
 *
 * IT THROTTLES ITSELF, AND IT HAS TO. One `isVisible()` is one snapshot round
 * trip through the engine, and every caller here sits in a poll loop; probing
 * per poll would add a snapshot per poll and buy nothing, in a study whose
 * subject is speed. So a probe is only performed once per `PROMPT_PROBE_MS`
 * suite-wide, and every other call is free. A prompt is up for as long as
 * nobody taps it, so a 2 s look costs at most 2 s of recovery, against the
 * 25 failures one unanswered prompt caused in the published CI run.
 *
 * `appIsReady` is the caller's own "is the thing I'm waiting for there yet"
 * probe, and it is what makes the second branch safe. See below.
 */
export async function dismissBlockingPrompt(
  screen: Screen,
  appIsReady: () => Promise<boolean>,
): Promise<BlockedBy | false> {
  const now = Date.now()
  if (now < nextPromptProbe) return false
  nextPromptProbe = now + PROMPT_PROBE_MS

  const allow = screen.getByText(PHOTO_ALERT_ALLOW)
  // The button alone is the trigger: while the alert is up it is a separate
  // window that removes the app's own nodes, so matching on the app or on the
  // prompt title in addition would only add a way to miss it.
  if (await allow.isVisible()) {
    await allow.tap()
    return 'photo-library'
  }

  // THE iOS DEEP-LINK HANDOFF CONFIRMATION: `alert "Open in "Bluesky"??"` with
  // `button "Cancel"` and `button "Open"`. It appears ONLY as a result of this
  // suite's own recovery calling `device.openLink` (GHA run 39829436248: 8 of
  // the 8 failures in it, and 0 occurrences across all 86 failures of the two
  // published runs on either engine), because iOS asks the user before handing a
  // `exp+bluesky://` link to the app. Maestro does not see it because its
  // `launchApp permissions: all` auto-confirms prompts, the same parity gap the
  // photo-library prompt is.
  //
  // It is worse than the photo prompt in one way: it is MODAL AND STICKY. The
  // failing runs show it surviving `app.clearState()` onto the NEXT test's
  // screen - 5 of the 8 tests whose failure screen shows it never called
  // `openLink` themselves (their traces stop at `app.clearState`) - so one
  // unanswered handoff poisons the rest of the suite.
  //
  // WHY `appIsReady` IS MANDATORY, not defensive padding. The app itself has
  // menu items whose labels start with "Open in" (`Open in Google Translate`,
  // PostMenuItems.tsx:572), and a test frozen mid-tap on a post menu would look
  // superficially similar: interesting button, no confirmation yet. Tapping
  // Google Translate would be an app action, launched by the test harness, in a
  // flow that never asked for it - the exact class of thing this file must not
  // do. So the handoff is confirmed only when (a) the node really is an `alert`
  // - a system alert, not the app's own row, which is a cell - AND (b) the
  // button is named exactly "Open", not merely containing it, AND (c) the
  // caller's own probe says the app has NOT presented what it was waiting for.
  // In that state there is nothing else the test can act on, so confirming the
  // handoff strictly beats waiting 180 s for a dialog that never closes itself.
  const handoff = screen.getByRole('alert')
  if ((await handoff.count()) === 0) return false
  if (await appIsReady()) return false
  const open = screen.getByRole('button', 'Open')
  if ((await open.count()) === 0) return false
  await open.first().tap()
  return 'open-in-app'
}

/**
 * The photo-library prompt on its own, for callers that have no readiness probe
 * to offer. `waitForPastPrompts` and `openDevClient` use `dismissBlockingPrompt`
 * directly so they also clear the deep-link handoff.
 */
export async function dismissPhotoLibraryPrompt(
  screen: Screen,
): Promise<boolean> {
  return (
    (await dismissBlockingPrompt(screen, async () => true)) === 'photo-library'
  )
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
    // `probe` doubles as the readiness check rather than `async () => false`:
    // one more read is what tells "the app has what I need, carry on" apart from
    // "something is on top of it", and `dismissBlockingPrompt` refuses to confirm
    // a deep-link handoff while the former is true.
    const blocked = await dismissBlockingPrompt(screen, probe)
    if (blocked) {
      console.log(
        `[recovery] dismissed the ${blocked} prompt while waiting for a locator`,
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
      // iOS answers the handoff with a modal that removes the app's nodes, and on a
      // host whose accessibility reads are already timing out there is no tree for
      // `dismissBlockingPrompt` to find it in. Answer it blind, right here, where it
      // is the only prompt that can be up.
      await acceptLaunchHandoff(device)
      opened = true
      continue
    }
    if (Date.now() >= deadline) break
    await new Promise(r => setTimeout(r, 250))
  }
  // The loop above already spent the budget, so this is the REPORTING read, not
  // a second wait: an unqualified `toBeVisible({timeout})` here would double the
  // latency of a genuinely broken launch to 180 s + 180 s per test. 5 s keeps the
  // failure message (`expected: visible, observed: …`) that the published line
  // produced while adding 5 s, not 3 min, to a dead host.
  await expect(appScreen).toBeVisible({timeout: 5_000})
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
        const ready =
          (await launcher.isVisible()) || (await appScreen.isVisible())
        if (platform === 'ios' && !ready) {
          const blocked = await dismissBlockingPrompt(
            screen,
            async () =>
              (await launcher.isVisible()) || (await appScreen.isVisible()),
          )
          if (blocked) {
            console.log(
              `[recovery] dismissed the ${blocked} prompt in openDevClient`,
            )
          }
        }
        return ready
      },
      {timeout: 60_000},
    )
    .toBe(true)
  if (await launcher.isVisible()) {
    await device.openLink(
      `exp+bluesky://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`,
      {app: BUNDLE_ID},
    )
    // Same reasoning as in `waitForAppScreen`: this openLink can raise the handoff,
    // and it is called from the middle of a test (`following-restore`'s relaunch),
    // where an unanswered modal blocks whatever step comes next.
    if (platform === 'ios') await acceptLaunchHandoff(device)
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
 * Tap a control, sending the keyboard away first if - and only if - the engine
 * says the keyboard is why it will not tap.
 *
 * A PARITY DEVIATION, not a test improvement, and it has to be one. `login.yml`
 * hides the keyboard on Android only, and the port mirrors that (`login.e2e.ts`
 * still does). On iOS the two arms then differ because of the DRIVERS, not the
 * flows: at this same tap Maestro's driver reports a step that produced no
 * navigation (its own `out/maestro/login/` artifacts: step 13 `tapOn
 * selectServiceButton` COMPLETED, step 14 then cannot find `manualSelectBtn`, which
 * only exists inside the sheet that never opened), while this engine refuses the tap
 * outright (`perform tap failed: Ref @e70 is behind the visible keyboard and cannot
 * be tapped safely`) because a tap that lands on the keyboard would be dispatched
 * somewhere the test never aimed. WHY IT REFUSES, NOT WHY MAESTRO DID NOT: the
 * engine's stated reason is the keyboard, and this function takes that verdict as
 * its trigger. Whether the keyboard was geometrically over the button is NOT
 * established - the published arm's hierarchy at its NEXT step puts the button's
 * bottom at y557 and the keyboard's top at y566, and geometry after a keyboard
 * animation can differ from geometry at the tap. So this reacts to a refusal, which
 * is what it can actually observe, and does not claim to have proven the cause.
 * GHA run 39840373292 shows the
 * consequence: `login` reached `selectServiceButton` for the first time on CI in that
 * cell (2 of its 3 jobs died there; the third died in the engine) and failed on
 * exactly that refusal. In the published cell the flow never got this far at all -
 * its failures were `e2eOpenLoggedOutView` / `Sign in` never appearing - but that
 * cell also ran iOS 26.5 rather than 26.2, so how much of the new depth is the
 * handoff fix and how much is the runtime pin is NOT separated by this data. What it
 * does show is the step the arm now stops at, which is what this function targets.
 *
 * WHAT THIS FIX DOES NOT CLAIM. An earlier draft of this comment said `login` was
 * "5/5 on Maestro" on the same host, which would have made this the only gap between
 * the arms. It is not: the published cell's Maestro `login` is 0/5 as well
 * (`Assertion is false: "Sign in" is visible` twice, `Element not found:
 * manualSelectBtn` three times, run 39704588488). So `login` is red on CI for BOTH
 * arms and for two different reasons, and the keyboard parity gap is only the reason
 * the `e2e` arm now fails at that particular step. The keyboard fix removes one
 * blocker on this arm; it is not what will make `login` green, and the flow should
 * not be reported as comparable until both arms' remaining causes are understood.
 *
 * Reacting to the error is deliberate. The obvious alternative - dismiss the
 * keyboard unconditionally on iOS - is a drag gesture on the screen
 * (`surface.dismissKeyboard` falls back to `dismissKeyboardByGesture` on iPhone,
 * which has no dismiss key), so on a screen with no keyboard up it is a stray swipe
 * that can scroll the very view the next step reads. Triggering it on the engine's
 * own complaint means the gesture happens exactly when the alternative was a hard
 * failure. One retry, no loop: if the keyboard is still in the way after being
 * dismissed, that is a finding, and the second error is the honest one.
 */
export async function tapPastKeyboard(
  device: Device,
  platform: string,
  locator: Locator,
  label: string,
) {
  try {
    await locator.tap()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      platform !== 'ios' ||
      !/behind the visible keyboard/i.test(msg) ||
      (await locator.count()) === 0
    ) {
      throw e
    }
    console.log(
      `[recovery] dismissed the keyboard to tap ${label}: the engine refused while it was up`,
    )
    await device.dismissKeyboard()
    await locator.tap()
  }
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
