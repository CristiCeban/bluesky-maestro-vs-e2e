// Ported from __e2e__/flows/composer.yml
import {expect} from 'e2e'
import {
  bluesky,
  composerClosed,
  inputText,
  openMedia,
  signIn,
  tapAtRest,
  tapCtrl,
} from './support/app'

const test = bluesky('?users')

test('composer', async ({screen}) => {
  const composeFab = screen.getByTestId('composeFAB')
  const input = screen.getByTestId('composerTextInput')
  const publish = screen.getByTestId('composerPublishBtn')
  const photos = screen.getByTestId('selectedPhotosView')

  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  await expect(composeFab).toBeVisible()
  await composeFab.tap()
  await inputText(input, 'Post text only')
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await composeFab.tap()
  await inputText(input, 'Post with an image')
  await openMedia(screen)
  await expect(photos).toBeVisible()
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await composeFab.tap()
  await inputText(input, 'Post with a https://example.com link card')
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await tapCtrl(screen, 'e2eRefreshHome')
  // Following v2 (always on in e2e builds) can keep the reader where they were
  // and put the refreshed posts above them, out of view - it does on Android.
  // Scroll up to the newest post, or the first replyBtn is one scrolled up under
  // the header.
  await screen.scrollUntilVisible(
    screen.getByText(/^Post with a .*link card$/),
    {
      direction: 'up',
    },
  )
  await screen.getByTestId('replyBtn').first().tap()
  // Wait for the composer to fully open before typing. Tapping replyBtn right
  // after the previous publish can race the closing composer on Android.
  await expect(publish).toBeVisible({timeout: 10_000})
  await inputText(input, 'Reply text only')
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await screen.getByTestId('replyBtn').first().tap()
  // Wait for the composer to fully open before typing.
  await expect(publish).toBeVisible({timeout: 10_000})
  await inputText(input, 'Reply with an image')
  await openMedia(screen)
  await expect(photos).toBeVisible()
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await screen.getByTestId('replyBtn').first().tap()
  // Wait for the composer to fully open before typing.
  await expect(publish).toBeVisible({timeout: 10_000})
  await inputText(input, 'Reply with a https://example.com link card')
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await tapAtRest(screen.getByTestId('repostBtn').first())
  await screen.getByTestId('quoteBtn').tap()
  await inputText(input, 'QP text only')
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await tapAtRest(screen.getByTestId('repostBtn').first())
  await screen.getByTestId('quoteBtn').tap()
  await inputText(input, 'QP with an image')
  await openMedia(screen)
  await expect(photos).toBeVisible()
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
  await tapAtRest(screen.getByTestId('repostBtn').first())
  await screen.getByTestId('quoteBtn').tap()
  await inputText(input, 'QP with a https://example.com link card')
  await publish.tap()
  await expect(composeFab).toBeVisible()
  await composerClosed(screen)
})
