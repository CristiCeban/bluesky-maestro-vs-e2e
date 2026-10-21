// Ported from __e2e__/flows/following-restore.yml
import {expect} from 'e2e'
import {setupServer} from './support/server'
import {bluesky, openDevClient, signIn} from './support/app'

// Following v2 restores Home Following across a restart, from the snapshot
// its query persister wrote, then puts posts made meanwhile above the restored
// top and offers them with the restore pill. The Following v2 gate is always
// on in e2e builds.
//
// More than a page of posts: a Following that runs out on its first page
// carries on into Discover, and Discover pages aren't snapshotted.
const test = bluesky(['?users&follows', '?newposts=40&text=Older%20post'])

test('following-restore', async ({app, device, platform, screen}) => {
  const pill = screen.getByTestId('followingPrependPill')

  await signIn(screen)

  // Alice pins only Following, so it's the Home feed on screen.
  await expect(screen.getByTestId('followingFeedPage')).toBeVisible({
    timeout: 60_000,
  })
  await expect(screen.getByText('Older post 40')).toBeVisible({
    timeout: 60_000,
  })

  // The query persister writes at most once a second, and nothing on screen
  // says when it has, so give it a few seconds before the app is stopped. The
  // source waits on an element that never shows, so it always runs out its 5 s.
  await new Promise(resolve => setTimeout(resolve, 5_000))

  // Restart the app, keeping its storage. Meanwhile, bob posts.
  await device.closeApp()
  await setupServer('?newposts=5&text=Newer%20post')
  await app.open()
  await openDevClient(
    {device, platform, screen},
    screen.getByText('Older post 40'),
  )

  // The feed comes back as it was, and the posts bob made go above it once the
  // list is at rest, out of view. Only a restore prepend shows the pill.
  await expect(screen.getByText('Older post 40')).toBeVisible({
    timeout: 180_000,
  })
  await expect(pill).toBeVisible({timeout: 60_000})
  await expect(screen.getByText('Newer post 5')).toBeHidden()

  // Pressing the pill scrolls to the top, where the new posts are, and hides it.
  await pill.tap()
  await expect(screen.getByText('Newer post 5')).toBeVisible({
    timeout: 30_000,
  })
  await expect(pill).toBeHidden({timeout: 30_000})
})
