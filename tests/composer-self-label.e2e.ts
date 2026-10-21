// Ported from __e2e__/flows/composer-self-label.yml
import {expect} from 'e2e'
import {bluesky, openMedia, signIn, tapCtrl} from './support/app'

const test = bluesky('?users')

test('composer-self-label', async ({screen}) => {
  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  // Post an image with the porn label
  await expect(screen.getByTestId('composeFAB')).toBeVisible()
  await screen.getByTestId('composeFAB').tap()
  await screen
    .getByTestId('composerTextInput')
    .pressSequentially('Post with an image')
  await openMedia(screen)
  await expect(screen.getByTestId('selectedPhotosView')).toBeVisible()
  await screen.getByText('Content warnings').tap()
  await screen.getByText('Porn').tap()
  // Tap on confirm
  await screen.getByTestId('confirmBtn').tap()
  await screen.getByTestId('composerPublishBtn').tap()
  await expect(screen.getByTestId('composePostView')).toBeHidden({
    timeout: 30_000,
  })
  await tapCtrl(screen, 'e2eRefreshHome')
  await expect(screen.getByText('Adult Content')).toBeVisible()
})
