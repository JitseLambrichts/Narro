// A scripted stand-in for the Claude Agent SDK, used only by tests (VISUAL_IDE_FAKE_AGENT).
// It calls the real hooks and writes real files, so the observers read real state.
import { promises as fs } from 'fs'
import { join } from 'path'
import type { HookInput, Options, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { QueryFn } from './session'

const SESSION_ID = 'fake-session'
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

async function* script(prompt: string, o: Options): AsyncGenerator<SDKMessage, void> {
  const signal = o.abortController?.signal ?? new AbortController().signal
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

  yield { type: 'system', subtype: 'init', session_id: SESSION_ID } as unknown as SDKMessage

  if (process.env.VISUAL_IDE_FAKE_AGENT === 'burst') {
    yield text('Writing a lot of files.')
    for (let i = 0; i < BURST_FILES; i++) {
      await write(`burst-${String(i).padStart(2, '0')}.txt`, `file ${i}\n`)
      await sleep(BURST_WINDOW_MS / BURST_FILES, signal)
    }
    yield text('Done.')
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
    yield text('Done.')
  }

  yield {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    session_id: SESSION_ID
  } as unknown as SDKMessage
}

export const fakeQuery: QueryFn = ({ prompt, options }) =>
  script(typeof prompt === 'string' ? prompt : '', options ?? {}) as unknown as Query
