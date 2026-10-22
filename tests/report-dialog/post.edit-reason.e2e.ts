// Ported from __e2e__/flows/report-dialog/post.edit-reason.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapUntilConfirmed} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/post.edit-reason', async ({screen}) => {
  const sentTo = screen.getByText(
    /^Your report will be sent to Dev-env Moderation.*$/,
  )
  const other = screen.getByTestId('report:option:Other misleading content')
  const details = screen.getByTestId('report:details')
  const spam = screen.getByTestId('report:option:Spam')

  await signIn(screen)

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  // This flow is the clearest case for a confirmed tap: its FIRST assertion is
  // the one the dropped tap erases, so the unconfirmed version fails two steps
  // later on a locator that was never reachable. `other` is the state only the
  // category tap produces; `sentTo` is the state only the reason tap produces.
  // See tests/report-dialog/post.default.e2e.ts and support/app.ts.
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
  await expect(details).toBeVisible()
  await screen.getByTestId('report:clearReportOption').tap()
  await expect(details).toBeHidden()
  await screen.getByTestId('report:clearCategory').tap()
  await expect(other).toBeHidden()
  await tapUntilConfirmed({
    screen,
    target: screen.getByTestId('report:category:Misleading'),
    confirmed: spam,
    label: 'report:category:Misleading (after clearing)',
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
