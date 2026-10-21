// Ported from __e2e__/flows/mod-lists.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapCtrl} from './support/app'

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

  await screen.getByText('Subscribe to this list').tap()
  await screen.getByText('Mute accounts').tap()
  await screen.getByText('Mute list').tap()
  // "Mute list" opens a "Mute these accounts?" confirmation, which has to finish
  // dismissing before the list's own controls come back into the tree. Maestro's
  // `tapOn` polls for its target until it appears (that is what its ~17 s
  // waitUntilStabilityPeriod is), so the YAML needs no step here; a plain `.tap()`
  // fails fast instead. This wait is that polling made explicit - a wait, not an
  // assertion (the same reason `composerClosed()` exists). Observed as a real
  // failure, not a theory: at the engine's own default settle/transition (150/500)
  // this line failed with `getByText("Unmute")` matching no nodes, on screen
  // `other "Mute these accounts?"`.
  await screen.getByText('Unmute').waitFor({state: 'visible', timeout: 17_000})
  await screen.getByText('Unmute').tap()

  await screen.getByText('Subscribe to this list').tap()
  await screen.getByText('Block accounts').tap()
  await screen.getByText('Block list').tap()
  // Same confirmation dialog on the block side.
  await screen.getByText('Unblock').waitFor({state: 'visible', timeout: 17_000})
  await screen.getByText('Unblock').tap()

  // the rest of the behaviors are tested in curate-lists
})
