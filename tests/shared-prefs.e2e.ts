// Ported from __e2e__/flows/shared-prefs.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapCtrl} from './support/app'

const test = bluesky('?users&posts&feeds')

test('shared-prefs', async ({screen}) => {
  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  await expect(screen.getByTestId('storybookBtn')).toBeVisible()
  await tapCtrl(screen, 'storybookBtn')
  await screen.getByTestId('sharedPrefsTestOpenBtn').tap()
  await screen.getByTestId('setStringBtn').tap()
  await expect(screen.getByText('Hello')).toBeVisible()
  await screen.getByTestId('removeStringBtn').tap()
  await expect(screen.getByText('undefined')).toBeVisible()
  await screen.getByTestId('setBoolBtn').tap()
  await expect(screen.getByText('true')).toBeVisible()
  await screen.getByTestId('setNumberBtn').tap()
  await expect(screen.getByText('123')).toBeVisible()
  await screen.getByTestId('addToSetBtn').tap()
  await expect(screen.getByText('true')).toBeVisible()
  await screen.getByTestId('removeFromSetBtn').tap()
  await expect(screen.getByText('false')).toBeVisible()
})
