import { describe, it, expect } from 'vitest'
import { claudeEnv } from './env'

describe('claudeEnv', () => {
  it('drops API keys, proxies and parent-session markers but keeps the sign-in location', () => {
    const env = claudeEnv({
      PATH: '/usr/bin',
      HOME: '/Users/me',
      ANTHROPIC_API_KEY: 'sk-ant-x',
      ANTHROPIC_BASE_URL: 'https://proxy.example',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CONFIG_DIR: '/Users/me/.claude-work',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth'
    })
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/me',
      CLAUDE_CONFIG_DIR: '/Users/me/.claude-work',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'narro/1.0.0'
    })
  })
})
