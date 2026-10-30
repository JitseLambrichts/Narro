import { promises as fs } from 'fs'
import { join } from 'path'
import { DEFAULT_MODEL, type ModelId } from '../../shared/types'
import type { SettingsView } from '../../shared/ipc'

export interface SecretCipher {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}

export interface SettingsStore {
  view(): Promise<SettingsView>
  save(patch: { apiKey?: string; model?: ModelId }): Promise<void>
  apiKey(): Promise<string | null>
  model(): Promise<ModelId>
}

const MODELS: readonly ModelId[] = ['claude-opus-5-5', 'claude-sonnet-5-5']

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path)
  } catch {
    return null
  }
}

export function createSettingsStore(dir: string, cipher: SecretCipher): SettingsStore {
  const settingsPath = join(dir, 'settings.json')
  const keyPath = join(dir, 'api-key.bin')

  async function model(): Promise<ModelId> {
    const raw = await readOrNull(settingsPath)
    if (!raw) return DEFAULT_MODEL
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as { model?: unknown }
      return MODELS.includes(parsed.model as ModelId) ? (parsed.model as ModelId) : DEFAULT_MODEL
    } catch {
      return DEFAULT_MODEL
    }
  }

  async function apiKey(): Promise<string | null> {
    const raw = await readOrNull(keyPath)
    if (!raw || !cipher.isEncryptionAvailable()) return null
    try {
      return cipher.decryptString(raw) || null
    } catch {
      return null
    }
  }

  return {
    model,
    apiKey,
    async view() {
      return { hasApiKey: (await apiKey()) !== null, model: await model() }
    },
    async save(patch) {
      await fs.mkdir(dir, { recursive: true })
      const key = patch.apiKey?.trim()
      if (key) {
        if (!cipher.isEncryptionAvailable()) throw new Error('Secure storage is not available on this Mac.')
        await fs.writeFile(keyPath, cipher.encryptString(key), { mode: 0o600 })
      }
      if (patch.model !== undefined && MODELS.includes(patch.model)) {
        await fs.writeFile(settingsPath, JSON.stringify({ model: patch.model }, null, 2))
      }
    }
  }
}
