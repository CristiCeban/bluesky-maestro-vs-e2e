// Ported from __e2e__/flows/thread-screen.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapAtRest} from './support/app'

const test = bluesky('?users&follows&thread')

test('thread-screen', async ({screen}) => {
  const bob = screen.getByTestId('postThreadItem-by-bob.test')
  const carla = screen.getByTestId('postThreadItem-by-carla.test')

  await signIn(screen)

  // Navigate to thread
  await expect(screen.getByText('Thread root')).toBeVisible()
  await screen.getByText('Thread root').tap()
  await expect(screen.getByText('Thread reply').first()).toBeVisible()

  // Can like the root post
  await bob.getByTestId('likeBtn').tap()
  await expect(screen.getByText('1 like')).toBeVisible()
  await bob.getByTestId('likeBtn').tap()
  await expect(screen.getByText('1 like')).toBeHidden()

  // Can like a reply post
  await carla.getByTestId('likeBtn').tap()
  // The tap re-renders the button; the next tap needs it at rest again.
  await expect(carla.getByLabel('Unlike (1 like)')).toBeVisible()
  await carla.getByTestId('likeBtn').tap()
  await expect(carla.getByLabel('Like (0 likes)')).toBeVisible()

  // Can repost the root post
  // The repost buttons are the ones the engine keeps catching mid-reflow: the
  // like taps above change each post's count text, which changes its row height,
  // so the thread list re-renders and shifts these buttons while the transition
  // window is open. Plain taps then fail with "Ref ... had no confirmed resting
  // position" before dispatching anything (both platforms); these taps wait for
  // the button's box to stop moving first.
  await tapAtRest(bob.getByTestId('repostBtn'))
  await screen.getByRole('button', 'Repost').tap()
  await expect(screen.getByTestId('repostCount-expanded')).toBeVisible()
  await tapAtRest(bob.getByTestId('repostBtn'))
  await screen.getByRole('button', 'Remove repost').tap()
  await expect(screen.getByTestId('repostCount-expanded')).toBeHidden()

  // Can repost a reply post
  await tapAtRest(carla.getByTestId('repostBtn'))
  await screen.getByRole('button', 'Repost').tap()
  await expect(carla.getByTestId('repostCount')).toBeVisible()
  await tapAtRest(carla.getByTestId('repostBtn'))
  await screen.getByRole('button', 'Remove repost').tap()
  await expect(carla.getByTestId('repostCount')).toBeHidden()
})
