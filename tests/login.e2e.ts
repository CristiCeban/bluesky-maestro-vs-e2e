// Ported from __e2e__/flows/login.yml
import {expect} from 'e2e'
import {bluesky, tapCtrl} from './support/app'

const test = bluesky('?users')

test('login', async ({device, platform, screen}) => {
  await tapCtrl(screen, 'e2eOpenLoggedOutView')
  await screen.getByText('Sign in').tap()
  await screen.getByTestId('selectServiceButton').tap()
  await screen.getByTestId('manualSelectBtn').tap()
  const server = screen.getByTestId('customServerTextInput')
  await server.tap()
  await server.pressSequentially('http://localhost:3000')
  if (platform === 'android') await device.dismissKeyboard()
  await screen.getByTestId('doneBtn').tap()
  const username = screen.getByTestId('loginUsernameInput')
  await username.tap()
  await username.pressSequentially('Alice')
  // The dev-env fixture account's password (dev-env/), not a secret.
  const password = screen.getByTestId('loginPasswordInput')
  await password.tap()
  await password.pressSequentially('hunter2')
  await password.press('Enter')
  const notNow = screen.getByText('Not Now')
  if (await notNow.isVisible()) await notNow.tap()
  await expect(screen.getByText('Following')).toBeVisible()
})
