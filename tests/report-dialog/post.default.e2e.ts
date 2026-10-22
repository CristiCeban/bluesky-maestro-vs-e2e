// Ported from __e2e__/flows/report-dialog/post.default.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapUntilConfirmed} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/post.default', async ({screen}) => {
  await signIn(screen)

  const spam = screen.getByTestId('report:option:Spam')
  const sentTo = screen.getByText('Send report to Dev-env Moderation')

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  // The two dialog taps are confirmed, not fire-and-forget: on agent-device
  // 0.21.31 the category tap completes while the app never advances a node, and
  // the flow then dies 30 s later looking for the reason list the tap was
  // supposed to open (14 of 20 report slots across the four local 0.21.31 runs;
  // 0 of 15 on 0.21.28 the same day, same sim). `tapUntilConfirmed` waits for
  // the state the NEXT line needs, re-taps if it never arrives, and logs every
  // re-tap so the underlying drop stays countable. See support/app.ts.
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
