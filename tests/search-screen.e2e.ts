// Ported from __e2e__/flows/search-screen.yml
import {expect} from 'e2e'
import {bluesky, signIn} from './support/app'

const test = bluesky('?users')

test('search-screen', async ({screen}) => {
  await signIn(screen)

  // Navigate to another user profile via autocomplete
  await expect(screen.getByTestId('bottomBarSearchBtn')).toBeVisible()
  await screen.getByTestId('bottomBarSearchBtn').tap()
  await expect(screen.getByTestId('searchScreenInput')).toBeVisible()
  // pressSequentially focuses the field itself; a separate tap first leaves the
  // keyboard up and the field out of agent-device's next snapshot.
  await screen.getByTestId('searchScreenInput').pressSequentially('b')
  await screen.getByTestId('searchAutoCompleteResult-bob.test').tap()
  await expect(screen.getByTestId('profileView')).toBeVisible()
})
