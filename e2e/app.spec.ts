import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { RendererApi } from '../src/shared/ipc'

// Chromium refuses to start as root on Linux without this switch (CI containers).
const switches = process.platform === 'linux' ? ['--no-sandbox'] : []

function launch(env: Record<string, string> = {}): Promise<ElectronApplication> {
  return electron.launch({
    args: [...switches, '.'],
    env: {
      ...process.env,
      VISUAL_IDE_USER_DATA: mkdtempSync(join(tmpdir(), 'narro-profile-')),
      VISUAL_IDE_FAKE_AGENT: '1',
      ...env
    }
  })
}

test('opens with the empty state', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByText('Open a project to start')).toBeVisible()
  await expect(win.getByRole('button', { name: 'Open project' })).toBeVisible()
  await app.close()
})

test('asks to sign in with Claude on first start, without an API key', async () => {
  const app = await launch({ VISUAL_IDE_FAKE_SIGNED_OUT: '1' })
  const win = await app.firstWindow()
  const dialog = win.getByRole('dialog')
  await expect(dialog.getByText('Not signed in')).toBeVisible()
  await expect(dialog.getByLabel(/API key/i)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Sign in with Claude' }).click()
  await expect(dialog.getByText('Signed in as test@example.com')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
  const account = await win.evaluate(() =>
    (window as unknown as { api: RendererApi }).api.getAccount()
  )
  expect(account).toEqual({ signedIn: true, email: 'test@example.com', method: 'claude' })
  await app.close()
})

test.describe('with the scripted agent', () => {
  let app: ElectronApplication
  let win: Page

  async function start(env: Record<string, string> = {}): Promise<void> {
    app = await launch({
      VISUAL_IDE_PROJECT_DIR: mkdtempSync(join(tmpdir(), 'narro-project-')),
      ...env
    })
    win = await app.firstWindow()
    await win.getByRole('button', { name: 'Open project' }).click()
    await expect(win.getByPlaceholder('Ask anything…')).toBeEnabled()
  }

  async function send(text: string): Promise<void> {
    const composer = win.getByPlaceholder('Ask anything…')
    await composer.fill(text)
    await composer.press('Enter')
  }

  test.afterEach(async () => {
    await app?.close()
  })

  test('a turn shows text and a live file card', async () => {
    await start()
    await send('Write notes')
    await expect(win.getByText('Created notes.md')).toBeVisible()
    await expect(win.getByText('Generate the report')).toBeVisible()
    await expect(win.getByText('Done.')).toBeVisible()
  })

  test('answers are shown as formatted text, without markdown signs', async () => {
    await start()
    await send('Write notes')
    const answer = win.locator('.agent-text').last()
    await expect(answer.locator('strong')).toHaveText('notes.md')
    await expect(answer.locator('li')).toHaveText(['notes.md', 'out.txt'])
    await expect(answer).not.toContainText('**')
  })

  test('sending the next message collapses the previous cards; Show reopens them', async () => {
    await start()
    await send('Write notes')
    await expect(win.getByText('Done.')).toBeVisible()
    await expect(win.getByRole('button', { name: 'Send' })).toBeVisible()
    await send('Again')
    const first = win.getByTestId('turn').first()
    await expect(first.getByRole('button', { name: 'Show' })).toHaveCount(2) // file card + command card
    await expect(first.getByTestId('card-body')).toHaveCount(0)
    await first.getByRole('button', { name: 'Show' }).first().click()
    await expect(first.getByTestId('card-body')).toBeVisible()
    await expect(first.getByRole('button', { name: 'Hide' })).toBeVisible()
  })

  test('Stop ends a running turn', async () => {
    await start({ VISUAL_IDE_FAKE_AGENT_SLOW: '1' })
    await send('Long job')
    await expect(win.getByText("I'll write your notes.")).toBeVisible()
    await win.getByRole('button', { name: 'Stop' }).click()
    await expect(win.getByText('Stopped')).toBeVisible()
    await expect(win.getByRole('button', { name: 'Send' })).toBeVisible()
  })

  test('a risky command asks for permission inside the conversation', async () => {
    await start()
    await send('Clean up')
    const card = win.getByTestId('permission-card')
    await expect(card.getByText('Allow this command?')).toBeVisible()
    await card.getByRole('button', { name: 'Stop' }).click()
    await expect(card.getByText('Stopped')).toBeVisible()
    await expect(win.getByText('Okay, I left it alone.')).toBeVisible()
  })
})
