import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSettingsStore, forgetStoredApiKey } from './store'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'settings-'))
})

describe('createSettingsStore', () => {
  it('defaults to Opus', async () => {
    expect(await createSettingsStore(tmp).view()).toEqual({ model: 'claude-opus-5-5' })
  })

  it('persists the model', async () => {
    await createSettingsStore(tmp).save({ model: 'claude-sonnet-5-5' })
    expect(await createSettingsStore(tmp).model()).toBe('claude-sonnet-5-5')
  })

  it('ignores an unknown model', async () => {
    await createSettingsStore(tmp).save({ model: 'gpt-9' as never })
    expect(await createSettingsStore(tmp).model()).toBe('claude-opus-5-5')
  })

  it('removes an API key saved by an earlier version', async () => {
    writeFileSync(join(tmp, 'api-key.bin'), 'enc:sk-ant-old')
    await forgetStoredApiKey(tmp)
    expect(existsSync(join(tmp, 'api-key.bin'))).toBe(false)
    await forgetStoredApiKey(tmp)
  })
})
