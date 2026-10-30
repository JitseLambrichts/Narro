import { describe, it, expect } from 'vitest'
import { claudeEnv } from './env'

describe('claudeEnv', () => {
  it('keeps every sign-in method of Claude Code, including the user’s own API key', () => {
    const env = claudeEnv({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-own',
      ANTHROPIC_AUTH_TOKEN: 'token',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CONFIG_DIR: '/Users/me/.claude-work'
    })
    expect(env).toEqual({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-own',
      ANTHROPIC_AUTH_TOKEN: 'token',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CONFIG_DIR: '/Users/me/.claude-work',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'narro/1.0.0'
    })
  })

  it('drops the markers of a parent Claude Code session', () => {
    expect(claudeEnv({ PATH: '/usr/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' })).toEqual(
      {
        PATH: '/usr/bin',
        CLAUDE_AGENT_SDK_CLIENT_APP: 'narro/1.0.0'
      }
    )
  })
})
