// Ported from __e2e__/flows/report-dialog/post.reason-other.yml
import {expect} from 'e2e'
import {bluesky, signIn} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/post.reason-other', async ({device, screen}) => {
  await signIn(screen)

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  await screen.getByTestId('report:category:Misleading').tap()
  await screen.getByTestId('report:option:Other misleading content').tap()
  await expect(
    screen.getByText('Send report to Dev-env Moderation'),
  ).toBeVisible()
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
