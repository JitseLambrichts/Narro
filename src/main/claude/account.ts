import { spawn, type ChildProcess } from 'child_process'
import type { AccountView } from '../../shared/ipc'

export interface ClaudeAccount {
  status(): Promise<AccountView>
  // Opens the browser and resolves once signing in has finished, failed or been cancelled.
  signIn(): Promise<AccountView>
  // For when the browser shows a code instead of returning to the app by itself.
  submitCode(code: string): void
  cancelSignIn(): void
  signOut(): Promise<AccountView>
}

const SIGNED_OUT: AccountView = { signedIn: false, email: null }
const COMMAND_TIMEOUT_MS = 20_000

// The Claude Code binary that ships with the Agent SDK, so no separate install is needed.
export function claudeBinary(resolve: (id: string) => string = require.resolve): string | null {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const targets =
    process.platform === 'linux'
      ? [`linux-${process.arch}`, `linux-${process.arch}-musl`]
      : [`${process.platform}-${process.arch}`]
  for (const target of targets) {
    try {
      return resolve(`@anthropic-ai/claude-agent-sdk-${target}/claude${ext}`)
    } catch {
      // not installed for this platform
    }
  }
  return null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

export function parseAuthStatus(stdout: string): AccountView {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end < start) return SIGNED_OUT
  try {
    const j = JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>
    if (j.loggedIn !== true) return SIGNED_OUT
    const account = (j.account ?? j.oauthAccount ?? {}) as Record<string, unknown>
    const email =
      str(j.email) ?? str(j.emailAddress) ?? str(account.email) ?? str(account.emailAddress)
    return { signedIn: true, email }
  } catch {
    return SIGNED_OUT
  }
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.on('data', (d) => (stdout += d))
    const timer = setTimeout(() => child.kill(), COMMAND_TIMEOUT_MS)
    child.on('error', () => resolve(''))
    child.on('close', () => {
      clearTimeout(timer)
      resolve(stdout)
    })
  })
}

// Signs in with the Claude account the user already uses for Claude Code (`claude auth`).
export function createClaudeAccount(bin: string | null, env: NodeJS.ProcessEnv): ClaudeAccount {
  let login: ChildProcess | null = null

  async function status(): Promise<AccountView> {
    if (!bin) return SIGNED_OUT
    return parseAuthStatus(await run(bin, ['auth', 'status', '--json'], env))
  }

  return {
    status,
    signIn() {
      if (!bin) return Promise.resolve(SIGNED_OUT)
      login?.kill()
      return new Promise((resolve) => {
        const child = spawn(bin, ['auth', 'login', '--claudeai'], {
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        })
        login = child
        // Drain the output so the CLI never blocks on a full pipe.
        child.stdout?.resume()
        child.stderr?.resume()
        const finish = (): void => {
          if (login === child) login = null
          status().then(resolve)
        }
        child.on('error', finish)
        child.on('close', finish)
      })
    },
    submitCode(code) {
      login?.stdin?.write(code.trim() + '\n')
    },
    cancelSignIn() {
      login?.kill()
      login = null
    },
    async signOut() {
      if (bin) await run(bin, ['auth', 'logout'], env)
      return status()
    }
  }
}
