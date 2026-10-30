import { promises as fs } from 'fs'
import { join } from 'path'
import { DEFAULT_MODEL, type ModelId } from '../../shared/types'
import type { SettingsView } from '../../shared/ipc'

export interface SettingsStore {
  view(): Promise<SettingsView>
  save(patch: { model?: ModelId }): Promise<void>
  model(): Promise<ModelId>
}

const MODELS: readonly ModelId[] = ['claude-opus-5-5', 'claude-sonnet-5-5']

export function createSettingsStore(dir: string): SettingsStore {
  const settingsPath = join(dir, 'settings.json')

  async function model(): Promise<ModelId> {
    try {
      const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as { model?: unknown }
      return MODELS.includes(parsed.model as ModelId) ? (parsed.model as ModelId) : DEFAULT_MODEL
    } catch {
      return DEFAULT_MODEL
    }
  }

  return {
    model,
    async view() {
      return { model: await model() }
    },
    async save(patch) {
      if (patch.model === undefined || !MODELS.includes(patch.model)) return
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(settingsPath, JSON.stringify({ model: patch.model }, null, 2))
    }
  }
}

// Earlier versions kept an encrypted API key here. Narro now uses the Claude Code sign-in,
// so the old key is removed instead of lingering on disk.
export async function forgetStoredApiKey(dir: string): Promise<void> {
  await fs.rm(join(dir, 'api-key.bin'), { force: true })
}
