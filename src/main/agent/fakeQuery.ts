// A scripted stand-in for the Claude Agent SDK, used only by tests (VISUAL_IDE_FAKE_AGENT).
// Like Claude Code it keeps running and answers every message from the prompt stream;
// it calls the real hooks and writes real files, so the observers read real state.
import { promises as fs } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type {
  HookInput,
  Options,
  Query,
  SDKMessage,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type { QueryFn } from './session'

const SESSION_ID = 'fake-session'
const CUSTOMERS_SQL = `CREATE TABLE IF NOT EXISTS klanten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voornaam TEXT NOT NULL,
    stad TEXT NOT NULL
);

INSERT INTO klanten (voornaam, stad) VALUES
    ('Emma', 'Hasselt'),
    ('Lucas', 'Antwerpen'),
    ('Sofie', 'Maastricht'),
    ('Noah', 'Gent');
`
const CUSTOMERS = [
  ['Emma', 'Hasselt'],
  ['Lucas', 'Antwerpen'],
  ['Sofie', 'Maastricht'],
  ['Noah', 'Gent']
]
// Long enough between database writes that Narro shows them arriving one by one.
const ROW_PAUSE_MS = 400
const SLOW_PAUSE_MS = 5000
const BURST_FILES = 30
const BURST_WINDOW_MS = 1000

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Aborted'))
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Aborted'))
      },
      { once: true }
    )
  })
}

const text = (t: string): SDKMessage =>
  ({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
    parent_tool_use_id: null,
    session_id: SESSION_ID
  }) as unknown as SDKMessage

async function* script(
  prompt: string,
  o: Options,
  signal: AbortSignal
): AsyncGenerator<SDKMessage, void> {
  const cwd = o.cwd ?? process.cwd()
  const slow = process.env.VISUAL_IDE_FAKE_AGENT_SLOW === '1'
  let n = 0
  const nextId = (): string => `fake-tool-${Date.now()}-${++n}`
  const base = { session_id: SESSION_ID, transcript_path: '', cwd }

  const hook = async (
    event: 'PreToolUse' | 'PostToolUse',
    input: HookInput,
    id: string
  ): Promise<void> => {
    for (const matcher of o.hooks?.[event] ?? [])
      for (const h of matcher.hooks) await h(input, id, { signal })
  }
  const tool = async (
    name: string,
    input: Record<string, unknown>,
    run: () => Promise<unknown>
  ): Promise<void> => {
    const id = nextId()
    await hook(
      'PreToolUse',
      {
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: name,
        tool_input: input,
        tool_use_id: id
      },
      id
    )
    const started = Date.now()
    const response = await run()
    await hook(
      'PostToolUse',
      {
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: name,
        tool_input: input,
        tool_response: response,
        tool_use_id: id,
        duration_ms: Date.now() - started
      },
      id
    )
  }
  const write = (rel: string, content: string): Promise<void> =>
    tool('Write', { file_path: join(cwd, rel), content }, () =>
      fs.writeFile(join(cwd, rel), content)
    )
  const pause = (): Promise<void> => (slow ? sleep(SLOW_PAUSE_MS, signal) : Promise.resolve())

  if (process.env.VISUAL_IDE_FAKE_AGENT === 'burst') {
    yield text('Writing a lot of files.')
    for (let i = 0; i < BURST_FILES; i++) {
      await write(`burst-${String(i).padStart(2, '0')}.txt`, `file ${i}\n`)
      await sleep(BURST_WINDOW_MS / BURST_FILES, signal)
    }
    yield text('Done.')
  } else if (prompt.includes('customer list')) {
    yield text("I'll make a small customer list.")
    await write('klanten.sql', CUSTOMERS_SQL)
    await tool(
      'Bash',
      { command: 'sqlite3 klanten.db < klanten.sql', description: 'Create the customer list' },
      async () => {
        // Row by row, with pauses, like a real import that takes a while.
        const db = new DatabaseSync(join(cwd, 'klanten.db'))
        db.exec(CUSTOMERS_SQL.slice(0, CUSTOMERS_SQL.indexOf('INSERT')))
        for (const [name, city] of CUSTOMERS) {
          await sleep(ROW_PAUSE_MS, signal)
          db.prepare('INSERT INTO klanten (voornaam, stad) VALUES (?, ?)').run(name, city)
        }
        db.close()
        return { stdout: '', stderr: '' }
      }
    )
    yield text('Done. The **klanten** table has four customers.')
  } else if (prompt.includes('email column')) {
    yield text('I will add an email column and fill it in for every customer.')
    await tool(
      'Bash',
      {
        command: `sqlite3 klanten.db "ALTER TABLE klanten ADD COLUMN email TEXT; UPDATE klanten SET email = lower(voornaam) || '@example.com';"`,
        description: 'Add an email column'
      },
      async () => {
        const db = new DatabaseSync(join(cwd, 'klanten.db'))
        db.exec('ALTER TABLE klanten ADD COLUMN email TEXT')
        const ids = db.prepare('SELECT id, voornaam FROM klanten').all() as {
          id: number
          voornaam: string
        }[]
        for (const { id, voornaam } of ids) {
          await sleep(ROW_PAUSE_MS, signal)
          db.prepare('UPDATE klanten SET email = ? WHERE id = ?').run(
            `${voornaam.toLowerCase()}@example.com`,
            id
          )
        }
        db.close()
        return { stdout: '', stderr: '' }
      }
    )
    yield text('Every customer now has an **email** address.')
  } else if (prompt.includes('moved to Brussel')) {
    await tool(
      'Bash',
      {
        command: `sqlite3 klanten.db "UPDATE klanten SET stad = 'Brussel' WHERE voornaam = 'Lucas'; INSERT INTO klanten (voornaam, stad) VALUES ('Mila', 'Leuven');"`,
        description: 'Update the customer list'
      },
      async () => {
        const db = new DatabaseSync(join(cwd, 'klanten.db'))
        db.exec(
          "UPDATE klanten SET stad = 'Brussel' WHERE voornaam = 'Lucas'; INSERT INTO klanten (voornaam, stad) VALUES ('Mila', 'Leuven');"
        )
        db.close()
        return { stdout: '', stderr: '' }
      }
    )
    yield text('Lucas now lives in Brussel, and I added Mila.')
  } else if (prompt.includes('Clean up')) {
    const id = nextId()
    const input = { command: 'rm -rf build' }
    await hook(
      'PreToolUse',
      {
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: input,
        tool_use_id: id
      },
      id
    )
    const decision = await o.canUseTool?.('Bash', input, { signal, toolUseID: id, requestId: id })
    if (decision?.behavior === 'allow') {
      await fs.rm(join(cwd, 'build'), { recursive: true, force: true })
      await hook(
        'PostToolUse',
        {
          ...base,
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: input,
          tool_response: { stdout: '' },
          tool_use_id: id
        },
        id
      )
      yield text('I removed the build folder.')
    } else {
      yield text('Okay, I left it alone.')
    }
  } else {
    yield text("I'll write your notes.")
    await pause()
    await write('notes.md', 'a\nb\n')
    await pause()
    await tool('Bash', { command: 'node gen.js', description: 'Generate the report' }, async () => {
      await fs.writeFile(join(cwd, 'out.txt'), 'x')
      return { stdout: 'ok', stderr: '' }
    })
    await pause()
    yield text('Done. I wrote **notes.md** and ran the report:\n\n- notes.md\n- out.txt\n')
  }

  yield {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    session_id: SESSION_ID
  } as unknown as SDKMessage
}

function messageText(m: SDKUserMessage): string {
  const content = m.message.content
  if (typeof content === 'string') return content
  return content.map((block) => (block.type === 'text' ? block.text : '')).join('')
}

export const fakeQuery: QueryFn = ({ prompt, options }) => {
  const o = options ?? {}
  const processSignal = o.abortController?.signal ?? new AbortController().signal
  let interruptTurn: (() => void) | null = null

  async function* run(): AsyncGenerator<SDKMessage, void> {
    yield { type: 'system', subtype: 'init', session_id: SESSION_ID } as unknown as SDKMessage
    if (typeof prompt === 'string') return
    for await (const message of prompt) {
      const turn = new AbortController()
      interruptTurn = () => turn.abort()
      try {
        yield* script(messageText(message), o, AbortSignal.any([turn.signal, processSignal]))
      } catch (err) {
        if (processSignal.aborted) return
        if (!turn.signal.aborted) throw err
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          errors: [],
          session_id: SESSION_ID
        } as unknown as SDKMessage
      }
    }
  }

  return Object.assign(run(), {
    interrupt: async () => interruptTurn?.(),
    setModel: async () => {},
    close: () => {}
  }) as unknown as Query
}
