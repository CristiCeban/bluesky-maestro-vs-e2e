// Ported from __e2e__/flows/report-dialog/account.default.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapUntilConfirmed} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/account.default', async ({screen}) => {
  await signIn(screen)

  const spam = screen.getByTestId('report:option:Spam')
  const sentTo = screen.getByText('Send report to Dev-env Moderation')

  await screen.getByText("Carla's avatar").tap()
  await screen.getByTestId('profileHeaderDropdownBtn').tap()
  await screen.getByTestId('profileHeaderDropdownReportBtn').tap()
  // Confirmed taps: see tests/report-dialog/post.default.e2e.ts for the race
  // this covers and why every re-tap is logged.
  await tapUntilConfirmed({
    screen,
    target: screen.getByTestId('report:category:Misleading'),
    confirmed: spam,
    label: 'report:category:Misleading',
  })
  await tapUntilConfirmed({
    screen,
    target: spam,
    confirmed: sentTo,
    label: 'report:option:Spam',
  })
  await expect(sentTo).toBeVisible()
  await screen.getByTestId('report:submit').tap()
  await expect(screen.getByTestId('report:dialog')).toBeHidden({
    timeout: 20_000,
  })
})
