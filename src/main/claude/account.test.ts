import { describe, it, expect, beforeEach } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { claudeBinary, createClaudeAccount, parseAuthStatus } from './account'

// A stand-in for the `claude` binary that keeps its sign-in in a file.
const FAKE_CLI = `#!/bin/sh
case "$1 $2" in
  "auth status")
    if [ -f "$FAKE_STATE" ]; then echo '{"loggedIn": true, "authMethod": "claude.ai", "email": "me@example.com"}'
    else echo '{"loggedIn": false}'; exit 1; fi ;;
  "auth login")
    echo "Opening browser to sign in…"
    printf 'Paste code here if prompted > '
    read code
    if [ "$code" = "good" ]; then touch "$FAKE_STATE"; exit 0; fi
    echo "Invalid code" >&2; exit 1 ;;
  "auth logout") rm -f "$FAKE_STATE" ;;
esac
`

let bin: string
let env: NodeJS.ProcessEnv
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-cli-'))
  bin = join(dir, 'claude')
  writeFileSync(bin, FAKE_CLI)
  chmodSync(bin, 0o755)
  env = { ...process.env, FAKE_STATE: join(dir, 'signed-in') }
})

const tick = (ms = 100): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('Claude account', () => {
  it('reports a signed-out CLI', async () => {
    expect(await createClaudeAccount(bin, env).status()).toEqual({ signedIn: false, email: null })
  })

  it('signs in with the code from the browser, then signs out', async () => {
    const account = createClaudeAccount(bin, env)
    const signingIn = account.signIn()
    await tick()
    account.submitCode(' good ')
    expect(await signingIn).toEqual({ signedIn: true, email: 'me@example.com' })
    expect(await account.status()).toEqual({ signedIn: true, email: 'me@example.com' })
    expect(await account.signOut()).toEqual({ signedIn: false, email: null })
  })

  it('a wrong code leaves the user signed out', async () => {
    const account = createClaudeAccount(bin, env)
    const signingIn = account.signIn()
    await tick()
    account.submitCode('bad')
    expect(await signingIn).toEqual({ signedIn: false, email: null })
  })

  it('cancelling ends the sign-in', async () => {
    const account = createClaudeAccount(bin, env)
    const signingIn = account.signIn()
    await tick()
    account.cancelSignIn()
    expect(await signingIn).toEqual({ signedIn: false, email: null })
  })

  it('without a binary everything reads as signed out', async () => {
    const account = createClaudeAccount(null, env)
    expect(await account.status()).toEqual({ signedIn: false, email: null })
    expect(await account.signIn()).toEqual({ signedIn: false, email: null })
  })

  it('parses the JSON of claude auth status', () => {
    expect(
      parseAuthStatus('noise\n{"loggedIn": true, "oauthAccount": {"emailAddress": "a@b.c"}}\n')
    ).toEqual({
      signedIn: true,
      email: 'a@b.c'
    })
    expect(parseAuthStatus('{"loggedIn": true}')).toEqual({ signedIn: true, email: null })
    expect(parseAuthStatus('not json')).toEqual({ signedIn: false, email: null })
  })

  it('finds the Claude Code binary that ships with the Agent SDK', () => {
    const found = claudeBinary(createRequire(import.meta.url).resolve)
    expect(found).toMatch(/claude-agent-sdk-[a-z0-9-]+[/\\]claude(\.exe)?$/)
  })
})
