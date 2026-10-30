import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSettingsStore } from './store'

const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from('enc:' + s),
  decryptString: (b: Buffer) => b.toString().slice(4)
}

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'settings-'))
})

describe('createSettingsStore', () => {
  it('defaults to Opus without a key', async () => {
    expect(await createSettingsStore(tmp, cipher).view()).toEqual({ hasApiKey: false, model: 'claude-opus-5-5' })
  })

  it('stores the key encrypted and never exposes it in view()', async () => {
    const s = createSettingsStore(tmp, cipher)
    await s.save({ apiKey: 'sk-ant-test' })
    expect(await s.view()).toEqual({ hasApiKey: true, model: 'claude-opus-5-5' })
    expect(readFileSync(join(tmp, 'api-key.bin'), 'utf8')).toBe('enc:sk-ant-test')
    expect(await s.apiKey()).toBe('sk-ant-test')
  })

  it('refuses to store a key when secure storage is unavailable', async () => {
    const s = createSettingsStore(tmp, { ...cipher, isEncryptionAvailable: () => false })
    await expect(s.save({ apiKey: 'sk-ant-test' })).rejects.toThrow('Secure storage is not available on this Mac.')
    expect(existsSync(join(tmp, 'api-key.bin'))).toBe(false)
  })

  it('persists the model', async () => {
    await createSettingsStore(tmp, cipher).save({ model: 'claude-sonnet-5-5' })
    expect(await createSettingsStore(tmp, cipher).model()).toBe('claude-sonnet-5-5')
  })

  it('ignores an unknown model in settings.json', async () => {
    await createSettingsStore(tmp, cipher).save({ model: 'gpt-9' as never })
    expect(await createSettingsStore(tmp, cipher).model()).toBe('claude-opus-5-5')
  })

  it('trims the key before storing it', async () => {
    const s = createSettingsStore(tmp, cipher)
    await s.save({ apiKey: '  sk-ant-test \n' })
    expect(await s.apiKey()).toBe('sk-ant-test')
  })
})
