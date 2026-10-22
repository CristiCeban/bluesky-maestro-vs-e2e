// Ported from __e2e__/flows/report-dialog/post.reason-other.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapUntilConfirmed} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/post.reason-other', async ({device, screen}) => {
  await signIn(screen)

  const other = screen.getByTestId('report:option:Other misleading content')
  const sentTo = screen.getByText('Send report to Dev-env Moderation')

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  // Confirmed taps: see tests/report-dialog/post.default.e2e.ts for the race
  // this covers and why every re-tap is logged.
  await tapUntilConfirmed({
    screen,
    target: screen.getByTestId('report:category:Misleading'),
    confirmed: other,
    label: 'report:category:Misleading',
  })
  await tapUntilConfirmed({
    screen,
    target: other,
    confirmed: sentTo,
    label: 'report:option:Other misleading content',
  })
  await expect(sentTo).toBeVisible()
  // reason "other" defaults with details open
  await expect(screen.getByTestId('report:details')).toBeVisible()
  await screen.getByTestId('report:details').tap()
  await screen
    .getByTestId('report:details')
    .pressSequentially('This is a test report')
  await device.dismissKeyboard()
  await screen.getByTestId('report:submit').tap()
  await expect(screen.getByTestId('report:dialog')).toBeHidden({
    timeout: 20_000,
  })
})
