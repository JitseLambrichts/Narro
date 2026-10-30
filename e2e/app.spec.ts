import { test, expect, _electron as electron } from '@playwright/test'

// Chromium refuses to start as root on Linux without this switch (CI containers).
const switches = process.platform === 'linux' ? ['--no-sandbox'] : []

test('opens with the empty state', async () => {
  const app = await electron.launch({ args: [...switches, '.'] })
  const win = await app.firstWindow()
  await expect(win.getByText('Open a project to start')).toBeVisible()
  await expect(win.getByRole('button', { name: 'Open project' })).toBeVisible()
  await app.close()
})
