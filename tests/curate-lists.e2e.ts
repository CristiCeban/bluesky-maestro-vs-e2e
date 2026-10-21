// Ported from __e2e__/flows/curate-lists.yml
import {expect} from 'e2e'
import {bluesky, signIn, tapCtrl} from './support/app'

const test = bluesky('?users&follows&posts')

test('curate-lists', async ({screen}) => {
  const name = screen.getByTestId('editListNameInput')
  const description = screen.getByTestId('editListDescriptionInput')
  const newList = screen.getByTestId('newUserListBtn')
  const moreOptions = screen.getByTestId('moreOptionsBtn')
  const confirm = screen.getByTestId('confirmBtn')
  const bobCard = screen.getByTestId('profileCard-bob.test-link')
  const bobFeedItem = screen.getByTestId('feedItem-by-bob.test')
  const bobAdd = screen.getByTestId('user-bob.test-addBtn')
  const done = screen.getByTestId('doneBtn')
  const profileMenu = screen.getByTestId('profileHeaderDropdownBtn')
  const listsDialog = screen.getByTestId('userAddRemoveListsDialog')

  await signIn(screen)
  await expect(screen.getByTestId('viewHeaderHomeFeedPrefsBtn')).toBeVisible()

  // Create a curate list
  await tapCtrl(screen, 'e2eGotoLists')
  await newList.tap()
  await expect(screen.getByText('Create user list')).toBeVisible()
  await name.tap()
  await name.pressSequentially('Good Ppl')
  await description.tap()
  await description.pressSequentially('They good')
  await screen.getByText('Save').tap()
  await expect(screen.getByText('Create user list')).toBeHidden()
  await screen.getByText('People').tap()
  await expect(screen.getByText('Good Ppl')).toBeVisible()
  await expect(screen.getByText('They good')).toBeVisible()

  await moreOptions.tap()
  await screen.getByText('Edit list details').tap()
  await expect(screen.getByText('Edit user list')).toBeVisible()
  await name.tap()
  await name.clear()
  await name.pressSequentially('Bad Ppl')
  await description.tap()
  await description.clear()
  await description.pressSequentially('They bad')
  await screen.getByText('Save').tap()
  await expect(screen.getByText('Edit user list')).toBeHidden()
  await expect(screen.getByText('Bad Ppl')).toBeVisible()
  await expect(screen.getByText('They bad')).toBeVisible()

  await moreOptions.tap()
  await screen.getByText('Edit list details').tap()
  await expect(screen.getByText('Edit user list')).toBeVisible()
  await description.tap()
  await description.clear()
  await screen.getByText('Save').tap()
  await expect(screen.getByText('Edit user list')).toBeHidden()
  await expect(screen.getByTestId('listDescription')).toBeHidden()

  await moreOptions.tap()
  await screen.getByText(/^Delete list$/i).tap()
  await confirm.tap()

  await expect(newList).toBeVisible()
  await newList.tap()
  await expect(screen.getByText('Create user list')).toBeVisible()
  await name.tap()
  await name.pressSequentially('Good Ppl')
  await description.tap()
  await description.pressSequentially('They good')
  await screen.getByText('Save').tap()
  await expect(screen.getByText('Create user list')).toBeHidden()
  await screen.getByText('People').tap()
  await expect(screen.getByText('Good Ppl')).toBeVisible()
  await expect(screen.getByText('They good')).toBeVisible()
  await screen.getByText('People').tap()

  await screen.getByText('Start adding people').tap()
  const search = screen.getByRole('textbox', 'Search profiles')
  await search.tap()
  await search.pressSequentially('b')
  await search.press('Enter')
  await screen.getByText('Add user to list').tap()
  await screen.swipe({direction: 'up'})
  await expect(bobCard).toBeVisible()

  await screen.getByText('Posts').tap()
  // Shows posts by the users in the list
  await expect(bobFeedItem).toBeVisible()

  // Pins the list
  await screen.getByTestId('pinBtn').tap()
  await tapCtrl(screen, 'e2eGotoHome')
  // The step means the pinned feed's tab on Home. Right after the goto, iOS
  // still has the list screen in the tree, whose header title is the same
  // string, so the bare text matches twice; Maestro takes the first match
  // silently (and upstream's iOS runs fail here), e2e refuses. Scoped to the
  // tab strip instead.
  await screen.getByTestId('homeScreenFeedTabs').getByText('Good Ppl').tap()
  await expect(bobFeedItem).toBeVisible()
  await tapCtrl(screen, 'e2eGotoFeeds')
  await screen.getByTestId('saved-feed-Good Ppl').tap()
  await expect(bobFeedItem).toBeVisible()
  await screen.getByTestId('unpinBtn').tap()
  await screen.getByTestId('bottomBarHomeBtn').tap()
  await expect(screen.getByTestId('homeScreenFeedTabs-Good Ppl')).toBeHidden()
  await tapCtrl(screen, 'e2eGotoLists')
  await screen.getByText('Good Ppl').tap()

  await screen.getByText('People').tap()
  await expect(bobCard).toBeVisible()
  // Maestro's `point: "90%,43%"` is a coordinate tap on the bob row's Edit
  // button, which opens the membership dialog the next two steps drive. The
  // point is the row's top-right on CI's 720x1600 emulator; on this 1080x2340
  // one it lands on the profile-card link instead and navigates away (iOS).
  // Tap the actual control - same action, and it names the target the point
  // was guessing at.
  await screen.getByTestId('user-bob.test-editBtn').tap()
  // The source asserts nothing between opening this dialog and tapping inside
  // it, then goes straight to the search tab; these two waits keep the next
  // taps from landing on a sheet that is still opening or closing (the same
  // race composer hits on Android). Checks the source omits, not a weakening.
  await expect(listsDialog).toBeVisible()
  await bobAdd.tap()
  await done.tap()
  await expect(listsDialog).toBeHidden()

  await screen.getByTestId('bottomBarSearchBtn').tap()
  await screen.getByTestId('searchScreenInput').tap()
  await screen.getByTestId('searchScreenInput').pressSequentially('bob')
  await screen.getByTestId('searchAutoCompleteResult-bob.test').tap()
  await expect(screen.getByTestId('profileView')).toBeVisible()
  await profileMenu.tap()
  await screen.getByText(/^Add to lists$/i).tap()
  await expect(listsDialog).toBeVisible()
  await bobAdd.tap()
  await done.tap()
  await expect(listsDialog).toBeHidden()
  await profileMenu.tap()
  await screen.getByText(/^Add to lists$/i).tap()
  await expect(listsDialog).toBeVisible()
  await bobAdd.tap()
  await done.tap()
  await expect(listsDialog).toBeHidden()
})
