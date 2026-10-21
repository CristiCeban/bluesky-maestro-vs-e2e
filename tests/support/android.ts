/// <reference types="node" />
// Android-only device steps e2e does not offer, sent with adb.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const run = promisify(execFile)
const serialArgs = () =>
  process.env.E2E_ANDROID_DEVICE ? ['-s', process.env.E2E_ANDROID_DEVICE] : []

export const adbShell = (...args: string[]) =>
  run('adb', [...serialArgs(), 'shell', ...args])

/**
 * agent-device selects its own headless test IME on emulators (open's
 * `--test-ime`, default on; e2e's mobile engine has no option for it), and
 * that IME never shows a keyboard window, so the app's `keyboard:up` never
 * comes. Maestro runs with the device's keyboard (Gboard). Tests that check
 * the soft keyboard select the device's keyboard again first.
 */
export async function useDeviceKeyboard(platform: string) {
  if (platform !== 'android') return
  const {stdout} = await adbShell('ime', 'list', '-s')
  const ime = stdout.split(/\r?\n/).find(id => id.includes('inputmethod.latin'))
  if (!ime) throw new Error('no device keyboard (LatinIME) installed')
  await adbShell('ime', 'set', ime.trim())
}

/**
 * agent-device types through its helper IME, so typing after
 * `useDeviceKeyboard` needs it selected again (otherwise the text is lost).
 */
export async function useTestKeyboard(platform: string) {
  if (platform !== 'android') return
  await adbShell(
    'ime',
    'set',
    'com.callstack.agentdevice.imehelper/.TestInputMethodService',
  )
}

/**
 * Maestro's `inputText` on Android: key events into whatever has focus, with
 * no locator. Used where the focused WebView exposes no text field.
 */
export async function typeIntoFocus(text: string) {
  await adbShell('input', 'text', text.replace(/ /g, '%s'))
}

/**
 * Maestro's `longPressOn: { point: 'x%,y%' }`. e2e has `screen.tapAt` but no
 * long press at a point (and no viewport size to resolve percentages), so the
 * press goes through adb at the same screen percentages.
 */
export async function longPressAtPercent(xPct: number, yPct: number) {
  const {stdout} = await adbShell('wm', 'size')
  const m = /(\d+)x(\d+)\s*$/.exec(stdout.trim())
  if (!m) throw new Error(`cannot read the screen size: ${stdout}`)
  const x = String(Math.round((Number(m[1]) * xPct) / 100))
  const y = String(Math.round((Number(m[2]) * yPct) / 100))
  await adbShell('input', 'swipe', x, y, x, y, '1000')
}

/** The screen size in physical pixels, the unit of agent-device's Android points. */
export async function androidScreenSize() {
  const {stdout} = await adbShell('wm', 'size')
  const m = /(\d+)x(\d+)\s*$/.exec(stdout.trim())
  if (!m) throw new Error(`cannot read the screen size: ${stdout}`)
  return {x: 0, y: 0, width: Number(m[1]), height: Number(m[2])}
}
