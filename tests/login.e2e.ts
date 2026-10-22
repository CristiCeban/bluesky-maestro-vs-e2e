// Ported from __e2e__/flows/login.yml
import {expect} from 'e2e'
import {bluesky, tapCtrl, tapPastKeyboard} from './support/app'

const test = bluesky('?users')

test('login', async ({device, platform, screen}) => {
  await tapCtrl(screen, 'e2eOpenLoggedOutView')
  await screen.getByText('Sign in').tap()
  // See `tapPastKeyboard`: this is the tap GHA run 39840373292 shows the engine
  // refusing because the keyboard is over it, one step further than `e2e` had ever
  // got on CI. The two taps below that follow typed input are the same mechanism
  // predicted rather than observed (the keyboard is certainly up by `doneBtn` -
  // that is why `login.yml` hides it there on Android), so they are guarded too,
  // and each costs nothing when no keyboard is up.
  await tapPastKeyboard(
    device,
    platform,
    screen.getByTestId('selectServiceButton'),
    'selectServiceButton',
  )
  await screen.getByTestId('manualSelectBtn').tap()
  const server = screen.getByTestId('customServerTextInput')
  await server.tap()
  await server.pressSequentially('http://localhost:3000')
  if (platform === 'android') await device.dismissKeyboard()
  await tapPastKeyboard(
    device,
    platform,
    screen.getByTestId('doneBtn'),
    'doneBtn',
  )
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
