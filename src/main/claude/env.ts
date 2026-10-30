// Variables that tell Claude Code where its own sign-in lives. Everything else from an
// Anthropic or Claude Code environment (an API key, a proxy URL, the markers of a parent
// Claude Code session) would change who pays or how it runs, so it stays out.
const KEEP = ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN']

export function claudeEnv(
  base: NodeJS.ProcessEnv = process.env
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(base)) {
    if (/^(ANTHROPIC_|CLAUDE)/.test(key) && !KEEP.includes(key)) continue
    env[key] = value
  }
  return { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'narro/1.0.0' }
}
