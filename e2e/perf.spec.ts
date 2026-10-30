import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AppEvent } from '../src/shared/types'
import type { RendererApi } from '../src/shared/ipc'

// Meant for a Mac with real graphics: `npx playwright test --grep @perf`.
const switches = process.platform === 'linux' ? ['--no-sandbox'] : []

const FRAME_P95_MS = 20
const MAX_DELAY_MS = 2500

type PerfWindow = Window & {
  api: RendererApi
  __frames: number[]
  __lastWriteAt: number | null
  __shownAt: number | null
}

test('a burst of 30 file writes stays smooth and on time @perf', async () => {
  const app = await electron.launch({
    args: [...switches, '.'],
    env: {
      ...process.env,
      VISUAL_IDE_USER_DATA: mkdtempSync(join(tmpdir(), 'narro-profile-')),
      VISUAL_IDE_PLAINTEXT_SECRETS: '1',
      VISUAL_IDE_FAKE_AGENT: 'burst',
      VISUAL_IDE_PROJECT_DIR: mkdtempSync(join(tmpdir(), 'narro-project-'))
    }
  })
  const win = await app.firstWindow()
  await win.getByLabel('Anthropic API key').fill('sk-ant-test')
  await win.getByRole('button', { name: 'Save' }).click()
  await win.getByRole('button', { name: 'Open project' }).click()

  await win.evaluate(() => {
    const w = window as unknown as PerfWindow
    w.__frames = []
    w.__lastWriteAt = null
    w.__shownAt = null
    let last = performance.now()
    const tick = (now: number): void => {
      w.__frames.push(now - last)
      last = now
      if (w.__shownAt === null && document.body.innerText.includes('Updated 30 files'))
        w.__shownAt = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    w.api.onEvent((e: AppEvent) => {
      if (
        e.kind === 'change' &&
        e.change.phase === 'done' &&
        e.change.targetKey === 'file:burst-29.txt'
      ) {
        w.__lastWriteAt = performance.now()
      }
    })
  })

  const composer = win.getByPlaceholder('Ask anything…')
  await composer.fill('Write many files')
  await composer.press('Enter')
  await expect(win.getByText('Updated 30 files')).toBeVisible({ timeout: 10_000 })
  await expect(win.getByRole('button', { name: 'Send' })).toBeVisible()

  const { frames, lastWriteAt, shownAt } = await win.evaluate(() => {
    const w = window as unknown as PerfWindow
    return { frames: w.__frames.slice(1), lastWriteAt: w.__lastWriteAt, shownAt: w.__shownAt }
  })
  const sorted = [...frames].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  console.log(
    `frames=${frames.length} p95=${p95.toFixed(1)}ms delay=${(shownAt! - lastWriteAt!).toFixed(0)}ms`
  )

  expect(p95).toBeLessThan(FRAME_P95_MS)
  expect(lastWriteAt).not.toBeNull()
  expect(shownAt! - lastWriteAt!).toBeLessThan(MAX_DELAY_MS)
  await app.close()
})
