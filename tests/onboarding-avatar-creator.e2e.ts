// Ported from __e2e__/flows/onboarding-avatar-creator.yml
import {expect} from 'e2e'
import {
  bluesky,
  recoverOnboardingFinishStep,
  signIn,
  swipePercent,
  tapAtPercent,
  tapCtrl,
} from './support/app'

const test = bluesky('?users')

test('onboarding-avatar-creator', async ({device, platform, screen}) => {
  const ctx = {device, platform, screen}
  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  await tapCtrl(screen, 'e2eStartOnboarding')
  await screen.getByText('Open avatar creator').tap()
  // The avatar-creator bottom sheet (Dialog.Inner, non-scrollable) opens only
  // half-expanded on the short E2E emulator (720x1600), a ~220px sliver with
  // the emoji grid below the fold. Drag the sheet upward to expand it to full
  // height, which brings the picker into view. iOS opens the sheet fully
  // already, so this is Android-only.
  if (platform === 'android') {
    // Drag the bottom sheet up to expand it
    await swipePercent(ctx, [50, 90], [50, 20], 600)
    await expect(screen.getByText('Select an emoji')).toBeVisible({
      timeout: 10_000,
    })
  }
  await screen.getByText('Select the zap emoji as your avatar').tap()
  // Tap on yellow
  await tapAtPercent(ctx, 23, 79)
  await screen.getByText('Done').tap()
  await screen.getByText('Select an avatar').tap()
  // Reopening the creator sheet lands on the same half-expanded sliver on
  // Android, so expand it again before reaching for the emoji grid.
  if (platform === 'android') {
    // Drag the bottom sheet up to expand it
    await swipePercent(ctx, [50, 90], [50, 20], 600)
    await expect(screen.getByText('Select an emoji')).toBeVisible({
      timeout: 10_000,
    })
  }
  await screen.getByText('Select the atom emoji as your avatar').tap()
  await screen.getByText('Done').tap()
  await screen.getByTestId('onboardingContinue').tap()
  await expect(screen.getByText('What are your interests?')).toBeVisible()
  await screen.getByText('Animals').tap()
  await screen.getByTestId('onboardingContinue').tap()
  await expect(screen.getByText('Suggested for you')).toBeVisible()
  // mock server doesn't have suggestions api
  await screen.getByText('Skip to next step').tap()
  await screen.swipe({direction: 'right'})
  await screen.swipe({direction: 'right'})
  // Same flake as onboarding.e2e.ts (same tail), and this is the test where the
  // probe proved it: four more swipes left the scroll bar at value="0%" and the
  // button still reading "Next". See recoverOnboardingFinishStep().
  await expect(await recoverOnboardingFinishStep(screen)).toBeVisible()
  await screen.getByTestId('onboardingFinish').tap()
  // NUX, if applicable
  const close = screen.getByText('Close')
  if (await close.isVisible()) await close.tap()
  await expect(screen.getByText('Following')).toBeVisible()
})
