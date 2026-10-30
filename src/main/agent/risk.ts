import { isAbsolute, relative, resolve } from 'path'

const RISKY_COMMANDS = [
  /\brm\s/i,
  /\bgit\s+(push|reset\s+--hard|clean|branch\s+-D)\b/i,
  /\bsudo\b/i,
  /\b(drop\s+table|delete\s+from|truncate)\b/i,
  /\bmkfs\b/i,
  /\bchmod\s+-R\b/i
]

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

const SAFE = { risky: false, title: '', detail: '' }

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function classifyRisk(
  toolName: string,
  input: Record<string, unknown>,
  projectDir: string
): { risky: boolean; title: string; detail: string } {
  if (toolName === 'Bash') {
    const command = str(input.command) ?? ''
    if (!RISKY_COMMANDS.some((re) => re.test(command))) return SAFE
    return { risky: true, title: 'Allow this command?', detail: str(input.description) ?? command }
  }
  if (WRITE_TOOLS.includes(toolName)) {
    const file = str(input.file_path) ?? str(input.notebook_path)
    if (!file) return SAFE
    const target = resolve(projectDir, file)
    if (isInside(resolve(projectDir), target)) return SAFE
    return { risky: true, title: 'Allow changes outside your project?', detail: target }
  }
  return SAFE
}
