// Ported from __e2e__/flows/post-report-flow.yml
import {bluesky, signIn, tapAtPercent, tapUntilConfirmed} from './support/app'

const test = bluesky('?users&follows&posts')

test('post-report-flow', async ({device, platform, screen}) => {
  await signIn(screen)

  const spam = screen.getByText('Create report for Spam')
  const sentTo = screen.getByText('Send report to Dev-env Moderation')

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  // This is the flow whose trace named the race (`tap button "Create report for
  // Misleading" (appeared after 572ms)` succeeded while the category was never
  // selected). The taps here are labels rather than test ids, exactly like the
  // Maestro YAML. See tests/report-dialog/post.default.e2e.ts and support/app.ts.
  await tapUntilConfirmed({
    screen,
    target: screen.getByText('Create report for Misleading'),
    confirmed: spam,
    label: 'Create report for Misleading',
  })
  await tapUntilConfirmed({
    screen,
    target: spam,
    confirmed: sentTo,
    label: 'Create report for Spam',
  })
  await sentTo.tap()
  await tapAtPercent({device, platform, screen}, 50, 90)
})
