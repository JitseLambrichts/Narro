import { describe, it, expect, beforeEach } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { claudeBinary, createClaudeAccount, parseAuthStatus } from './account'

// A stand-in for the `claude` binary that keeps its sign-in in a file. Its login waits until
// the "browser" finishes (FAKE_BROWSER appears) and notes any input it was given.
const FAKE_CLI = `#!/bin/sh
case "$1 $2" in
  "auth status")
    if [ -f "$FAKE_STATE" ]; then echo '{"loggedIn": true, "authMethod": "claude.ai", "email": "me@example.com"}'
    else echo '{"loggedIn": false}'; exit 1; fi ;;
  "auth login")
    if read -r line; then echo "$line" > "$FAKE_INPUT"; fi
    while [ ! -f "$FAKE_BROWSER" ]; do sleep 0.05; done
    if [ "$(cat "$FAKE_BROWSER")" = "ok" ]; then touch "$FAKE_STATE"; exit 0; fi
    exit 1 ;;
  "auth logout") rm -f "$FAKE_STATE" ;;
esac
`

let dir: string
let bin: string
let env: NodeJS.ProcessEnv
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'claude-cli-'))
  bin = join(dir, 'claude')
  writeFileSync(bin, FAKE_CLI)
  chmodSync(bin, 0o755)
  env = {
    ...process.env,
    FAKE_STATE: join(dir, 'signed-in'),
    FAKE_BROWSER: join(dir, 'browser'),
    FAKE_INPUT: join(dir, 'input')
  }
})

const signedOut = { signedIn: false, email: null, method: null }
const tick = (ms = 100): Promise<void> => new Promise((r) => setTimeout(r, ms))
const browserFinishes = (result: 'ok' | 'failed'): void =>
  writeFileSync(join(dir, 'browser'), result)

describe('Claude account', () => {
  it('reports a signed-out Claude Code', async () => {
    expect(await createClaudeAccount(bin, env).status()).toEqual(signedOut)
  })

  it('signs in through the browser alone, then signs out', async () => {
    const account = createClaudeAccount(bin, env)
    const signingIn = account.signIn()
    await tick()
    browserFinishes('ok')
    expect(await signingIn).toEqual({ signedIn: true, email: 'me@example.com', method: 'claude' })
    expect(existsSync(join(dir, 'input'))).toBe(false)
    expect(await account.signOut()).toEqual(signedOut)
  })

  it('a sign-in that fails in the browser leaves the user signed out', async () => {
    const account = createClaudeAccount(bin, env)
    const signingIn = account.signIn()
    await tick()
    browserFinishes('failed')
    expect(await signingIn).toEqual(signedOut)
  })

  it('cancelling ends the sign-in', async () => {
    const account = createClaudeAccount(bin, env)
    const signingIn = account.signIn()
    await tick()
    account.cancelSignIn()
    expect(await signingIn).toEqual(signedOut)
  })

  it('without a binary everything reads as signed out', async () => {
    const account = createClaudeAccount(null, env)
    expect(await account.status()).toEqual(signedOut)
    expect(await account.signIn()).toEqual(signedOut)
  })

  it('parses the JSON of claude auth status', () => {
    expect(
      parseAuthStatus('noise\n{"loggedIn": true, "oauthAccount": {"emailAddress": "a@b.c"}}\n')
    ).toEqual({ signedIn: true, email: 'a@b.c', method: 'claude' })
    expect(parseAuthStatus('{"loggedIn": true}')).toEqual({
      signedIn: true,
      email: null,
      method: 'claude'
    })
    expect(parseAuthStatus('not json')).toEqual(signedOut)
  })

  it('recognises the user’s own API key', () => {
    expect(
      parseAuthStatus(
        '{"loggedIn": true, "authMethod": "api_key", "apiKeySource": "ANTHROPIC_API_KEY"}'
      )
    ).toEqual({ signedIn: true, email: null, method: 'api-key' })
  })

  it('finds the Claude Code binary that ships with the Agent SDK', () => {
    const found = claudeBinary(createRequire(import.meta.url).resolve)
    expect(found).toMatch(/claude-agent-sdk-[a-z0-9-]+[/\\]claude(\.exe)?$/)
  })
})
