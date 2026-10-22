// Ported from __e2e__/flows/mod-lists.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapCtrl, tapUntilConfirmed} from './support/app'

const test = bluesky('?users&follows&labels')

test('mod-lists', async ({screen}) => {
  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  // create a modlist
  await tapCtrl(screen, 'e2eGotoModeration')
  await screen.getByTestId('moderationlistsBtn').tap()
  await screen.getByText('New list').tap()
  const name = screen.getByTestId('editListNameInput')
  await name.tap()
  await name.pressSequentially('Muted Users')
  const description = screen.getByTestId('editListDescriptionInput')
  await description.tap()
  await description.pressSequentially('Shhh')
  await screen.getByText('Save').tap()

  // view modlist
  await expect(screen.getByText('Muted Users').first()).toBeVisible()
  await expect(screen.getByText('Shhh')).toBeVisible()

  // Mute, then unmute. The YAML taps three labels in a row and taps the
  // confirmation by its LABEL - `tapOn: "Mute list"`, a label the row behind the
  // "Mute these accounts?" dialog also carries (parity gap 8), and it has no
  // explicit confirm step at all. Two things were wrong with that, and the trace
  // of the failing run (`.e2e-bench/C-e2e-ios-t1-2/results/mod-lists-*/trace.md`)
  // settles which one actually bit:
  //   step 17  tap button "Mute list" (appeared after 548ms)  -> confirmModal +
  //            `button "Mute list" testid="confirmBtn"` in the after-diff, and
  //   step 18  waitFor getByText("Unmute") -> 85 reads, 17.1 s,
  //            `screen: unchanged since step 17`, the modal still open.
  // So the tap WAS dispatched at the confirm button, the button had JUST
  // appeared, the command reported success, and the app never processed it - the
  // same silently-dropped tap this suite already knows from the sign-in control
  // (E1/F1) and from the report dialog. A `waitFor(visible)` before the tap (the
  // first fix here, E5) cannot help: the button was visible; nothing after the
  // tap ever changed. `tapAtRest()`/`tapUntilConfirmed()` is the fix that
  // addresses the mechanism: tap the dialog's OWN confirm button by testID, so
  // the label collision the YAML gambles on is gone as well, and re-tap until
  // the state that tap produces (`unmuteBtn`/`unblockBtn`, both in
  // `src/screens/ProfileList/components/Header.tsx`) is actually on screen.
  // Costs ~1 extra read per step when nothing is dropped; every re-tap logs
  // itself. No assertion is relaxed - the `Unmute`/`Unblock` states the YAML
  // asserts by their labels are now the confirmation of the taps that cause them.
  const confirm = screen.getByTestId('confirmBtn')
  const unmute = screen.getByTestId('unmuteBtn')
  const unblock = screen.getByTestId('unblockBtn')

  await screen.getByText('Subscribe to this list').tap()
  await tapUntilConfirmed({
    screen,
    target: screen.getByText('Mute accounts'),
    confirmed: confirm,
    label: 'Mute accounts (menu item)',
  })
  await tapUntilConfirmed({
    screen,
    target: confirm,
    confirmed: unmute,
    label: 'confirmBtn (Mute these accounts?)',
  })
  await unmute.tap()

  await screen.getByText('Subscribe to this list').tap()
  await tapUntilConfirmed({
    screen,
    target: screen.getByText('Block accounts'),
    confirmed: confirm,
    label: 'Block accounts (menu item)',
  })
  await tapUntilConfirmed({
    screen,
    target: confirm,
    confirmed: unblock,
    label: 'confirmBtn (Block these accounts?)',
  })
  await unblock.tap()

  // the rest of the behaviors are tested in curate-lists
})
