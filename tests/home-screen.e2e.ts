// Ported from __e2e__/flows/home-screen.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapAtRest} from './support/app'

const test = bluesky('?users&follows&posts&feeds')

test('home-screen', async ({screen}) => {
  await signIn(screen)

  // Can go to feeds page using feeds button in tab bar
  await expect(screen.getByText('Feeds ✨')).toBeVisible()
  await screen.getByText('Feeds ✨').tap()
  await expect(screen.getByText('Discover New Feeds')).toBeVisible()

  // Feeds button disappears after pinning a feed
  await screen.getByTestId('bottomBarProfileBtn').tap()
  await screen.getByTestId('profilePager-selector-5').tap()
  await screen.getByText('alice-favs').tap()
  await screen.getByText('Pin to Home').tap()
  await screen.getByTestId('bottomBarHomeBtn').tap()
  await screen.getByTestId('bottomBarHomeBtn').tap()
  await screen.getByTestId('bottomBarHomeBtn').tap()
  await expect(screen.getByText('Feeds ✨')).toBeHidden()

  // Can like posts
  // The tab-bar taps above leave the feed list still settling (scroll-to-top,
  // pull-to-refresh rows resizing); a plain tap then fails with "Ref ... had no
  // confirmed resting position" before dispatching. These taps wait for the
  // button's box to stop moving first.
  await tapAtRest(screen.getByTestId('likeBtn').first())
  await tapAtRest(screen.getByTestId('likeBtn').first())
  // The tap re-renders the button; the next tap needs it at rest again.
  await expect(screen.getByLabel('Like (0 likes)').first()).toBeVisible()

  // Can repost posts
  await tapAtRest(screen.getByTestId('repostBtn').first())
  await screen.getByRole('button', 'Repost').tap()
  // The repost landed; the feed row re-renders ("Undo repost"), so wait for the
  // state the next sheet offers instead of tapping into the re-render.
  await expect(screen.getByLabel(/^Undo repost/).first()).toBeVisible()
  await tapAtRest(screen.getByTestId('repostBtn').first())
  await screen.getByRole('button', 'Remove repost').tap()

  // Can delete posts
  await screen
    .getByTestId('feedItem-by-alice.test')
    .getByTestId('postDropdownBtn')
    .tap()
  await screen.getByText('Delete post').tap()
  await screen.getByText('Delete').tap()
})
