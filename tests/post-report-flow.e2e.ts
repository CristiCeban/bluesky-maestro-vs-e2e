// Ported from __e2e__/flows/post-report-flow.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapAtPercent} from './support/app'

const test = bluesky('?users&follows&posts')

test('post-report-flow', async ({device, platform, screen}) => {
  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  await screen.getByText('Create report for Misleading').tap()
  await screen.getByText('Create report for Spam').tap()
  await screen.getByText('Send report to Dev-env Moderation').tap()
  await tapAtPercent({device, platform, screen}, 50, 90)
})
