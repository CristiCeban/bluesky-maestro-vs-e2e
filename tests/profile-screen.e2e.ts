// Ported from __e2e__/flows/profile-screen.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapAtPercent} from './support/app'

const test = bluesky('?users&posts&feeds')

test('profile-screen', async ({device, platform, screen}) => {
  await signIn(screen)

  // Navigate to another user profile
  await expect(screen.getByTestId('bottomBarSearchBtn')).toBeVisible()
  await screen.getByTestId('bottomBarSearchBtn').tap()
  // pressSequentially focuses the field itself; a separate tap first leaves the
  // keyboard up and the field out of agent-device's next snapshot.
  await screen.getByTestId('searchScreenInput').pressSequentially('b')
  await screen.getByTestId('searchAutoCompleteResult-bob.test').tap()
  await expect(screen.getByTestId('profileView')).toBeVisible()

  // Can follow/unfollow another user
  await screen.getByTestId('followBtn').tap()
  // dismiss the subscribe prompt
  await tapAtPercent({device, platform, screen}, 65, 35)
  await screen.getByTestId('unfollowBtn').tap()

  // Can mute/unmute another user
  await screen.getByTestId('profileHeaderDropdownBtn').tap()
  await screen.getByText(/^Mute account$/i).tap()
  await expect(screen.getByText(/^Account muted$/i)).toBeVisible()
  await screen.getByTestId('profileHeaderDropdownBtn').tap()
  await screen.getByText(/^Unmute account$/i).tap()
  await expect(screen.getByText(/^Account muted$/i)).toBeHidden()
})
