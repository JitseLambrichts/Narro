// Markers that a parent Claude Code session sets for its own child processes. They describe
// that session, not the user's setup, so a fresh Claude Code started by Narro must not inherit
// them. Everything else passes through untouched: Claude Code keeps every sign-in method it
// has, including the user's own API key, a long-lived token or a cloud provider.
const PARENT_SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']

export function claudeEnv(
  base: NodeJS.ProcessEnv = process.env
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(base)) {
    if (!PARENT_SESSION_MARKERS.includes(key)) env[key] = value
  }
  return { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'narro/1.0.0' }
}
