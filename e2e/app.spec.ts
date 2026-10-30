import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { RendererApi } from '../src/shared/ipc'

// Chromium refuses to start as root on Linux without this switch (CI containers).
const switches = process.platform === 'linux' ? ['--no-sandbox'] : []

function launch(env: Record<string, string> = {}): ReturnType<typeof electron.launch> {
  return electron.launch({
    args: [...switches, '.'],
    env: {
      ...process.env,
      VISUAL_IDE_USER_DATA: mkdtempSync(join(tmpdir(), 'narro-profile-')),
      VISUAL_IDE_PLAINTEXT_SECRETS: '1',
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

test('asks for an API key on first start and remembers it', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  await win.getByLabel('Anthropic API key').fill('sk-ant-test')
  await win.getByRole('button', { name: 'Save' }).click()
  await expect(win.getByRole('dialog')).toHaveCount(0)
  const view = await win.evaluate(() =>
    (window as unknown as { api: RendererApi }).api.getSettings()
  )
  expect(view).toEqual({ hasApiKey: true, model: 'claude-opus-5-5' })
  await app.close()
})
