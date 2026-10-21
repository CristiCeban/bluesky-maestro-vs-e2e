// Ported from __e2e__/flows/report-dialog/post.default.yml
import {expect} from 'e2e'
import {bluesky, signIn} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/post.default', async ({screen}) => {
  await signIn(screen)

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  await screen.getByTestId('report:category:Misleading').tap()
  await screen.getByTestId('report:option:Spam').tap()
  await expect(
    screen.getByText('Send report to Dev-env Moderation'),
  ).toBeVisible()
  await screen.getByTestId('report:submit').tap()
  await expect(screen.getByTestId('report:dialog')).toBeHidden({
    timeout: 20_000,
  })
})
