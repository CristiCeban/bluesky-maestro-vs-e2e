// Ported from __e2e__/flows/report-dialog/post.edit-reason.yml
import {expect} from 'e2e'
import {bluesky, signIn} from '../support/app'

const test = bluesky('?users&follows&posts&feeds')

test('report-dialog/post.edit-reason', async ({screen}) => {
  const sentTo = screen.getByText(
    /^Your report will be sent to Dev-env Moderation.*$/,
  )
  const other = screen.getByTestId('report:option:Other misleading content')
  const details = screen.getByTestId('report:details')

  await signIn(screen)

  await screen.getByTestId('postDropdownBtn').nth(0).tap()
  await screen.getByTestId('postDropdownReportBtn').tap()
  await screen.getByTestId('report:category:Misleading').tap()
  await other.tap()
  await expect(sentTo).toBeVisible()
  // reason "other" defaults with details open
  await expect(details).toBeVisible()
  await screen.getByTestId('report:clearReportOption').tap()
  await expect(details).toBeHidden()
  await screen.getByTestId('report:clearCategory').tap()
  await expect(other).toBeHidden()
  await screen.getByTestId('report:category:Misleading').tap()
  await screen.getByTestId('report:option:Spam').tap()
  await expect(sentTo).toBeVisible()
  await screen.getByTestId('report:submit').tap()
  await expect(screen.getByTestId('report:dialog')).toBeHidden({
    timeout: 20_000,
  })
})
