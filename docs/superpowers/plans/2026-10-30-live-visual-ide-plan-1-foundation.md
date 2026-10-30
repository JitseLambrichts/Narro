# Live visuele IDE — Bouwplan 1: Fundament

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een werkende macOS-desktopapp waarin je in één kolom met Claude praat, en waarin elke actie van de agent live als kaart in het gesprek verschijnt, inklapt bij een nieuw bericht en weer te openen is.

**Architecture:** Electron-hoofdproces draait de Claude Agent SDK; hooks vóór en na elke tool call gaan naar observers die de echte staat van de projectmap lezen en een `VisualChange` opleveren. Die gaan als `AppEvent` over IPC naar de renderer, waar een regisseur het tempo bepaalt en een pure reducer het gesprek (beurten, tekst, kaarten) bijhoudt. React + Motion tekent de kaarten met vloeiende layout-animaties.

**Tech Stack:** Electron (electron-vite, template react-ts), TypeScript, React, Motion (`motion/react`), `@anthropic-ai/claude-agent-sdk`, `diff`, `ignore`, Vitest + Testing Library (jsdom), Playwright (`_electron`).

**Spec:** [`docs/superpowers/specs/2026-10-30-live-visual-ide-design.md`](../specs/2026-10-30-live-visual-ide-design.md)

**Wat dit plan wel en niet bouwt.** Dit is plan 1 van 5 (zie *Volgende plannen* onderaan). Het bouwt het hele pad van agent tot kaart, met de Files-observer, het Command-vangnet, activiteitskaarten, de takenchecklist en een basis-toestemmingskaart. Git, SQLite, voorproeven bij toestemming, web preview, Show code en het bewaren van gesprekken volgen in plan 2–5.

## Global Constraints

- Alle tekst in de interface is Engels en staat in één bestand: `src/renderer/i18n/en.ts`.
- macOS is het eerste platform; venster met `titleBarStyle: 'hiddenInset'`.
- Geen AI-model in de visuele laag. Alleen de agent zelf roept Claude aan.
- Standaardmodel `claude-opus-5-5`; enige alternatief in de instellingen `claude-sonnet-5-5`.
- De API-sleutel komt van de gebruiker, wordt versleuteld met Electron `safeStorage` opgeslagen, wordt nooit gelogd en gaat nooit naar de renderer (die ziet alleen `hasApiKey`).
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; alles via de preload-brug `window.api`.
- Animaties: alleen `transform` en `opacity` waar mogelijk, layout-animaties via Motion, `prefers-reduced-motion` wordt gerespecteerd, doel 60 fps.
- Wat je ziet loopt nooit meer dan **2000 ms** achter (regisseur, `MAX_LAG_MS`).
- Kleuren met betekenis: groen = toegevoegd/klaar, oranje = gewijzigd, rood = verwijderd, accent = bezig. Gesprekskolom max. **680px** breed, gecentreerd.
- Riskante acties vragen altijd toestemming (Task 4).

## Review Focus

1. **Een enorm of binair bestand** (lockfile, afbeelding) wordt aangepast → de kaart toont een korte samenvatting en de app bevriest niet. *Test in Task 5: `readSnapshot` markeert `binary`/`tooLarge`, `fileChange` geeft dan `lines: []`.*
2. **Een uitbarsting van tientallen wijzigingen in een seconde** → het gesprek loopt niet meer dan 2 s achter. *Test in Task 9: regisseur geeft na `MAX_LAG_MS` alles in één keer vrij.*
3. **Ontbrekende of ongeldige API-sleutel** → de beurt eindigt met een leesbare melding in plaats van te blijven hangen. *Test in Task 7: fout met `invalid x-api-key` wordt `outcome: 'failed'` met de vaste foutzin.*
4. **Een project met `node_modules` en duizenden bestanden** → het indexeren na een commando slaat zware mappen over en heeft een plafond. *Test in Task 5: `indexProject` negeert `node_modules` en `.gitignore`, en respecteert `maxFiles`.*
5. **De gebruiker scrolt omhoog om terug te lezen** terwijl de agent werkt → het gesprek trekt hem niet terug naar beneden. *Test in Task 10: `isNearBottom` bepaalt of er meegescrold wordt.*

---

## Bestandsstructuur

```
live-visual-ide/
├── package.json · electron.vite.config.ts · tsconfig*.json · vitest.config.ts · playwright.config.ts
├── docs/superpowers/{specs,plans}/          ← dit plan en het ontwerp
├── src/shared/
│   ├── types.ts            datamodel: Change, VisualChange, AppEvent, ModelId
│   └── ipc.ts              kanaalnamen + RendererApi-contract
├── src/preload/index.ts    window.api via contextBridge
├── src/main/
│   ├── index.ts            app-levenscyclus, venster, bedrading
│   ├── ipc.ts              ipcMain-handlers
│   ├── settings/store.ts   API-sleutel (safeStorage) + model
│   ├── agent/prompt.ts     PLAIN_LANGUAGE_APPEND
│   ├── agent/risk.ts       classifyRisk
│   ├── agent/session.ts    AgentSession: query(), hooks, tekst, taken, toestemming
│   ├── agent/fakeQuery.ts  alleen voor tests (VISUAL_IDE_FAKE_AGENT)
│   └── observers/
│       ├── textDiff.ts     diffText
│       ├── projectIndex.ts indexProject, changedPaths
│       ├── files.ts        readSnapshot, fileChange
│       └── registry.ts     ToolObserver, activityLabel
└── src/renderer/
    ├── index.html · main.tsx · App.tsx · env.d.ts
    ├── i18n/en.ts          alle Engelse teksten
    ├── styles/tokens.css   kleuren licht/donker, typografie
    ├── motion/tokens.ts    veren, fades, motionFor()
    ├── state/conversation.ts   reducer
    ├── state/cardTitle.ts      titels/samenvattingen van kaarten
    ├── director/director.ts    tempo + inhaalregel
    ├── director/useDirector.ts
    ├── ui/scroll.ts · ui/Conversation.tsx · ui/UserBubble.tsx · ui/AgentText.tsx
    ├── ui/Composer.tsx · ui/TopBar.tsx · ui/SettingsDialog.tsx · ui/EmptyState.tsx
    └── cards/LiveCard.tsx · FileCard.tsx · FilesGroupCard.tsx · CommandCard.tsx
          · ActivityCard.tsx · TaskChecklist.tsx · PermissionCard.tsx
e2e/app.spec.ts · e2e/perf.spec.ts
```

Testbestanden staan naast de code als `*.test.ts(x)`. Renderer-tests beginnen met `// @vitest-environment jsdom`.

---

### Task 1: App-skelet

**Files:**
- Create: de repo `live-visual-ide/` (in de map die de gebruiker kiest), via de electron-vite-template
- Create: `src/renderer/i18n/en.ts`, `src/renderer/styles/tokens.css`, `src/renderer/ui/EmptyState.tsx`, `vitest.config.ts`, `playwright.config.ts`, `e2e/app.spec.ts`
- Modify: `src/main/index.ts`, `src/renderer/App.tsx`, `package.json`

**Interfaces:**
- Produces: `t` uit `src/renderer/i18n/en.ts` (object met Engelse teksten; latere taken voegen sleutels toe), CSS-variabelen uit `tokens.css`, npm-scripts `dev`, `build`, `typecheck`, `test`, `e2e`.

- [ ] **Step 1: Scaffold en dependencies**

```bash
npm create @quick-start/electron@latest live-visual-ide -- --template react-ts
cd live-visual-ide && git init
npm i @anthropic-ai/claude-agent-sdk motion diff ignore
npm i -D vitest jsdom @testing-library/react @testing-library/user-event @playwright/test @types/diff
```

Kopieer `docs/superpowers/` (ontwerp + dit plan) naar de repo. Scripts in `package.json`: `"test": "vitest run"`, `"e2e": "npm run build && playwright test"`.

- [ ] **Step 2: Schrijf de falende smoke-test `e2e/app.spec.ts`**

```ts
import { test, expect, _electron as electron } from '@playwright/test';

test('opens with the empty state', async () => {
  const app = await electron.launch({ args: ['.'] });
  const win = await app.firstWindow();
  await expect(win.getByText('Open a project to start')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Open project' })).toBeVisible();
  await app.close();
});
```

- [ ] **Step 3: Run `npm run e2e` — verwacht FAIL** (template toont zijn eigen demo-inhoud).

- [ ] **Step 4: Implementeer het skelet**
  - `src/main/index.ts`: `BrowserWindow` 1200×800, `minWidth: 720`, `titleBarStyle: 'hiddenInset'`, `backgroundColor` volgens `nativeTheme.shouldUseDarkColors` (`#0b0b0d` / `#f6f6f7`), `webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }`.
  - `tokens.css`: de variabelen uit de Verhaal-mockup (`--bg, --win, --line, --line2, --text, --muted, --faint, --accent, --accent-soft, --accent-line, --green, --green-soft, --amber-soft, --red, --red-soft, --branch, --branch-soft`) met licht- en donkerwaarden via `@media (prefers-color-scheme: dark)`; `font: 14px/1.6 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`.
  - `en.ts`: `export const t = { emptyTitle: 'Open a project to start', openProject: 'Open project' }`.
  - `App.tsx` toont `<EmptyState onOpen={...} />`; template-demo verwijderen.

- [ ] **Step 5: Run `npm run e2e` en `npm run typecheck` — verwacht PASS**

- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: scaffold electron app with empty state"`

---

### Task 2: Datamodel en IPC-brug

**Files:**
- Create: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/renderer/env.d.ts`
- Modify: `src/preload/index.ts`
- Test: `src/preload/index.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):

```ts
export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5';
export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export interface DiffLine { kind: 'add' | 'del' | 'ctx' | 'gap'; text: string }
export interface FileChange { type: 'file'; path: string; status: 'created' | 'modified' | 'deleted'; lines: DiffLine[]; added: number; removed: number; tooLarge: boolean }
export interface CommandChange { type: 'command'; command: string; description: string | null; status: 'running' | 'done' | 'failed'; durationMs: number | null; changedFiles: string[]; outputTail: string[] }
export interface ActivityChange { type: 'activity'; items: string[] }
export type Change = FileChange | CommandChange | ActivityChange;

export interface VisualChange { id: string; toolUseId: string; targetKey: string; phase: 'start' | 'done' | 'failed'; change: Change }

export type AppEvent =
  | { kind: 'text'; turnId: string; at: number; text: string }
  | { kind: 'change'; turnId: string; at: number; change: VisualChange }
  | { kind: 'task'; turnId: string; at: number; taskId: string; subject: string | null; activeForm: string | null; status: TaskStatus }
  | { kind: 'permission'; turnId: string; at: number; requestId: string; title: string; detail: string }
  | { kind: 'turn-end'; turnId: string; at: number; outcome: 'done' | 'failed' | 'stopped'; error: string | null };
```

- Produces (`src/shared/ipc.ts`):

```ts
export const IPC = { openProject: 'project:open', getSettings: 'settings:get', saveSettings: 'settings:save',
  send: 'agent:send', stop: 'agent:stop', resolvePermission: 'agent:permission', event: 'agent:event' } as const;
export interface SettingsView { hasApiKey: boolean; model: ModelId }
export interface RendererApi {
  openProject(): Promise<string | null>;
  getSettings(): Promise<SettingsView>;
  saveSettings(patch: { apiKey?: string; model?: ModelId }): Promise<void>;
  send(text: string): Promise<{ turnId: string }>;
  stop(): Promise<void>;
  resolvePermission(requestId: string, allow: boolean): Promise<void>;
  onEvent(cb: (e: AppEvent) => void): () => void;
}
```

`env.d.ts` declareert `interface Window { api: RendererApi }`.

- [ ] **Step 1: Schrijf de falende test `src/preload/index.test.ts`** (mock `electron`)

```ts
it('exposes window.api under the name "api"', async () => {
  await import('./index');
  expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object));
});
it('send invokes the agent:send channel', async () => {
  await api().send('hi');
  expect(ipcRenderer.invoke).toHaveBeenCalledWith('agent:send', 'hi');
});
it('onEvent subscribes to agent:event and the returned function unsubscribes the same listener', () => {
  const off = api().onEvent(vi.fn());
  const listener = vi.mocked(ipcRenderer.on).mock.calls[0][1];
  off();
  expect(ipcRenderer.removeListener).toHaveBeenCalledWith('agent:event', listener);
});
```

- [ ] **Step 2: Run `npx vitest run src/preload` — verwacht FAIL**
- [ ] **Step 3: Implementeer `src/preload/index.ts`**: elke methode is `ipcRenderer.invoke(IPC.x, ...args)`; `onEvent` wikkelt `cb` in `(_evt, e) => cb(e)`, registreert met `ipcRenderer.on(IPC.event, …)` en geeft een functie terug die precies die wrapper verwijdert.
- [ ] **Step 4: Run de test — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: shared data model and preload bridge`

---

### Task 3: Instellingen (API-sleutel en model)

**Files:**
- Create: `src/main/settings/store.ts`, `src/renderer/ui/SettingsDialog.tsx`
- Modify: `src/main/ipc.ts` (handlers `settings:get`, `settings:save`), `src/main/index.ts`, `src/renderer/App.tsx`, `src/renderer/i18n/en.ts`
- Test: `src/main/settings/store.test.ts`, `src/renderer/ui/SettingsDialog.test.tsx`

**Interfaces:**
- Consumes: `ModelId`, `DEFAULT_MODEL`, `SettingsView` (Task 2)
- Produces:

```ts
export interface SecretCipher { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string }
export interface SettingsStore {
  view(): Promise<SettingsView>;
  save(patch: { apiKey?: string; model?: ModelId }): Promise<void>;
  apiKey(): Promise<string | null>;
  model(): Promise<ModelId>;
}
export function createSettingsStore(dir: string, cipher: SecretCipher): SettingsStore;
```

Bestanden: `${dir}/settings.json` (`{ "model": … }`) en `${dir}/api-key.bin` (versleuteld). In `index.ts`: `createSettingsStore(app.getPath('userData'), safeStorage)`.

- [ ] **Step 1: Schrijf de falende tests**

```ts
const cipher = { isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from('enc:' + s), decryptString: (b: Buffer) => b.toString().slice(4) };

it('defaults to Opus without a key', async () => {
  expect(await createSettingsStore(tmp, cipher).view()).toEqual({ hasApiKey: false, model: 'claude-opus-5-5' });
});
it('stores the key encrypted and never exposes it in view()', async () => {
  const s = createSettingsStore(tmp, cipher);
  await s.save({ apiKey: 'sk-ant-test' });
  expect(await s.view()).toEqual({ hasApiKey: true, model: 'claude-opus-5-5' });
  expect(readFileSync(join(tmp, 'api-key.bin'), 'utf8')).toBe('enc:sk-ant-test');
  expect(await s.apiKey()).toBe('sk-ant-test');
});
it('refuses to store a key when secure storage is unavailable', async () => {
  const s = createSettingsStore(tmp, { ...cipher, isEncryptionAvailable: () => false });
  await expect(s.save({ apiKey: 'sk-ant-test' })).rejects.toThrow('Secure storage is not available on this Mac.');
});
it('persists the model', async () => {
  await createSettingsStore(tmp, cipher).save({ model: 'claude-sonnet-5-5' });
  expect(await createSettingsStore(tmp, cipher).model()).toBe('claude-sonnet-5-5');
});
```

`SettingsDialog.test.tsx`: met `hasApiKey: false` toont het veld met label `Anthropic API key` en de knop `Save`; opslaan roept `onSave({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5' })`; het model-keuzemenu heeft precies de opties `Claude Opus 5.5` en `Claude Sonnet 5.5`.

- [ ] **Step 2: Run `npx vitest run src/main/settings src/renderer/ui/SettingsDialog.test.tsx` — verwacht FAIL**
- [ ] **Step 3: Implementeer `createSettingsStore`, de IPC-handlers en `SettingsDialog`** (`onSave(patch)`, `onClose()`, prop `view: SettingsView`). `App.tsx` opent de dialoog automatisch als `hasApiKey === false`. Teksten in `en.ts`: `settingsTitle: 'Settings'`, `apiKeyLabel: 'Anthropic API key'`, `apiKeyHint: 'Your key is stored securely on this Mac.'`, `modelLabel: 'Model'`, `save: 'Save'`.
- [ ] **Step 4: Run de tests — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: settings store with encrypted API key and model choice`

---

### Task 4: Risico-inschatting en de taalinstructie

**Files:**
- Create: `src/main/agent/risk.ts`, `src/main/agent/prompt.ts`
- Test: `src/main/agent/risk.test.ts`

**Interfaces:**
- Produces:

```ts
export function classifyRisk(toolName: string, input: Record<string, unknown>, projectDir: string):
  { risky: boolean; title: string; detail: string };
export const PLAIN_LANGUAGE_APPEND: string;
```

Exacte tekst van `PLAIN_LANGUAGE_APPEND`:
`"You are working inside a visual app for people who may not be technical. Explain what you are going to do and what you did in short, plain English sentences without jargon. The app shows your changes visually, so do not paste code or command output into your replies unless the user asks for it."`

- [ ] **Step 1: Schrijf de falende tabeltest** (`P = '/tmp/proj'`)

| toolName | input | risky | title | detail |
|---|---|---|---|---|
| Bash | `{ command: 'rm -rf build', description: 'Remove the build folder' }` | true | `Allow this command?` | `Remove the build folder` |
| Bash | `{ command: 'git push origin main' }` | true | `Allow this command?` | `git push origin main` |
| Bash | `{ command: 'git reset --hard HEAD~1' }` | true | | |
| Bash | `{ command: 'sqlite3 shop.db "DELETE FROM customers"' }` | true | | |
| Bash | `{ command: 'sudo npm i -g x' }` | true | | |
| Bash | `{ command: 'npm install' }` | false | | |
| Write | `{ file_path: P + '/src/a.ts' }` | false | | |
| Write | `{ file_path: '/etc/hosts' }` | true | `Allow changes outside your project?` | `/etc/hosts` |
| Edit | `{ file_path: P + '/../other/x.ts' }` | true | `Allow changes outside your project?` | `/tmp/other/x.ts` |
| Read | `{ file_path: '/etc/hosts' }` | false | | |

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer.** Riskante Bash-patronen (hoofdletterongevoelig): `\brm\s`, `\bgit\s+(push|reset\s+--hard|clean|branch\s+-D)\b`, `\bsudo\b`, `\b(drop\s+table|delete\s+from|truncate)\b`, `\bmkfs\b`, `\bchmod\s+-R\b`. Schrijftools (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`) zijn riskant als `path.resolve(file_path)` buiten `projectDir` valt. Alle andere tools zijn veilig. Bij Bash is `detail` de `description` als die er is, anders de `command`.
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: risk classification and plain-language instruction`

---

### Task 5: Tekstverschil, projectindex en Files-observer

**Files:**
- Create: `src/main/observers/textDiff.ts`, `src/main/observers/projectIndex.ts`, `src/main/observers/files.ts`
- Test: `src/main/observers/textDiff.test.ts`, `projectIndex.test.ts`, `files.test.ts`

**Interfaces:**
- Consumes: `DiffLine`, `FileChange` (Task 2)
- Produces:

```ts
export function diffText(before: string, after: string, context?: number /* = 3 */):
  { lines: DiffLine[]; added: number; removed: number };

export const DEFAULT_IGNORES = ['node_modules', '.git', 'dist', 'build', 'out', '.next', '.cache', 'coverage'];
export const MAX_INDEX_FILES = 20000;
export type ProjectIndex = Map<string, { mtimeMs: number; size: number }>; // sleutel = relatief pad, '/' als scheiding
export function indexProject(root: string, opts?: { maxFiles?: number }): Promise<ProjectIndex>;
export function changedPaths(before: ProjectIndex, after: ProjectIndex): string[]; // gesorteerd

export const MAX_DIFF_BYTES = 1_000_000;
export interface FileSnapshot { exists: boolean; text: string | null; binary: boolean; tooLarge: boolean }
export function readSnapshot(absPath: string): Promise<FileSnapshot>;
export function fileChange(relPath: string, before: FileSnapshot, after: FileSnapshot): FileChange;
```

- [ ] **Step 1: Schrijf de falende tests**

```ts
// textDiff
it('marks one changed line', () => {
  const d = diffText('a\nb\nc\n', 'a\nB\nc\n');
  expect(d.lines.map(l => l.kind)).toEqual(['ctx', 'del', 'add', 'ctx']);
  expect([d.added, d.removed]).toEqual([1, 1]);
});
it('folds long unchanged runs into a gap line', () => {
  const head = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n');
  const d = diffText(head + '\nx\n', head + '\ny\n');
  expect(d.lines[0]).toEqual({ kind: 'gap', text: '17 unchanged lines' });
  expect(d.lines.slice(1).map(l => l.text)).toEqual(['l18', 'l19', 'l20', 'x', 'y']);
});

// projectIndex
it('skips default ignores and .gitignore entries', async () => {
  // tmp: src/a.ts, node_modules/x/index.js, secret.txt, .gitignore ("secret.txt")
  expect([...(await indexProject(tmp)).keys()].sort()).toEqual(['.gitignore', 'src/a.ts']);
});
it('stops at maxFiles', async () => {
  // tmp: 5 files
  expect((await indexProject(tmp, { maxFiles: 3 })).size).toBe(3);
});
it('reports added, removed and modified paths', () => {
  const a = new Map([['x', { mtimeMs: 1, size: 1 }], ['y', { mtimeMs: 1, size: 1 }]]);
  const b = new Map([['y', { mtimeMs: 2, size: 1 }], ['z', { mtimeMs: 1, size: 1 }]]);
  expect(changedPaths(a, b)).toEqual(['x', 'y', 'z']);
});

// files
it('reads a missing file as not existing', async () => {
  expect(await readSnapshot(join(tmp, 'nope.txt'))).toEqual({ exists: false, text: null, binary: false, tooLarge: false });
});
it('flags binary files', async () => {
  writeFileSync(join(tmp, 'img.png'), Buffer.from([137, 80, 0, 1]));
  expect((await readSnapshot(join(tmp, 'img.png'))).binary).toBe(true);
});
it('flags files above MAX_DIFF_BYTES', async () => {
  writeFileSync(join(tmp, 'big.txt'), 'a'.repeat(MAX_DIFF_BYTES + 1));
  expect((await readSnapshot(join(tmp, 'big.txt'))).tooLarge).toBe(true);
});
it('builds created / deleted / tooLarge changes', () => {
  const none = { exists: false, text: null, binary: false, tooLarge: false };
  const two = { exists: true, text: 'a\nb\n', binary: false, tooLarge: false };
  expect(fileChange('n.md', none, two)).toMatchObject({ status: 'created', added: 2, removed: 0, tooLarge: false });
  expect(fileChange('n.md', two, none)).toMatchObject({ status: 'deleted', added: 0, removed: 2 });
  expect(fileChange('i.png', none, { ...two, text: null, binary: true })).toMatchObject({ tooLarge: true, lines: [] });
});
```

- [ ] **Step 2: Run `npx vitest run src/main/observers` — verwacht FAIL**
- [ ] **Step 3: Implementeer.** `diffText` gebruikt `diffLines` uit `diff`. Inklapregel voor een reeks ongewijzigde regels: aan het begin van het bestand blijven de laatste `context` regels staan, aan het einde de eerste `context`, in het midden de eerste en laatste `context`; de rest wordt één regel `{ kind: 'gap', text: `${n} unchanged lines` }`. `indexProject` loopt recursief met `fs.promises.readdir({ withFileTypes: true })`, filtert met `ignore().add(DEFAULT_IGNORES).add(.gitignore-inhoud)` en stopt bij `maxFiles`. `readSnapshot`: binair = een 0-byte in de eerste 8000 bytes; `tooLarge` = groter dan `MAX_DIFF_BYTES` (dan niet inlezen).
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: text diff, project index and file snapshots`

---

### Task 6: ToolObserver (Files, Command, activiteit)

**Files:**
- Create: `src/main/observers/registry.ts`
- Test: `src/main/observers/registry.test.ts`

**Interfaces:**
- Consumes: Task 5 (alle exports), `VisualChange`, `CommandChange`, `ActivityChange` (Task 2)
- Produces:

```ts
export const FILE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
export const TASK_TOOLS = ['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TodoWrite'];
export function activityLabel(toolName: string, input: Record<string, unknown>): string;
export class ToolObserver {
  constructor(ctx: { projectDir: string; newId(): string });
  before(toolUseId: string, toolName: string, input: Record<string, unknown>): Promise<VisualChange[]>;
  after(toolUseId: string, toolName: string, input: Record<string, unknown>, response: unknown,
        durationMs: number | null, failed: boolean): Promise<VisualChange[]>;
}
```

`targetKey`: bestanden `file:<relatief pad>`, commando's `command:<toolUseId>`, activiteit `activity`.

- [ ] **Step 1: Schrijf de falende tests**

```ts
it('Write of a new file: start (created, no lines) then done with the diff', async () => {
  const o = new ToolObserver({ projectDir: tmp, newId: seq() });
  const input = { file_path: join(tmp, 'notes.md'), content: 'a\nb\n' };
  const [s] = await o.before('t1', 'Write', input);
  expect(s).toMatchObject({ phase: 'start', targetKey: 'file:notes.md', change: { type: 'file', status: 'created', lines: [] } });
  writeFileSync(input.file_path, input.content);
  const [d] = await o.after('t1', 'Write', input, {}, 40, false);
  expect(d).toMatchObject({ phase: 'done', targetKey: 'file:notes.md', change: { added: 2 } });
});
it('a failed Edit ends in phase failed', async () => { /* before + after(failed=true) */ expect(last.phase).toBe('failed'); });
it('Bash: running card, then done with changed files, duration and the last 5 output lines', async () => {
  const input = { command: 'node gen.js', description: 'Generate the report' };
  const [s] = await o.before('t2', 'Bash', input);
  expect(s.change).toEqual({ type: 'command', command: 'node gen.js', description: 'Generate the report',
    status: 'running', durationMs: null, changedFiles: [], outputTail: [] });
  writeFileSync(join(tmp, 'out.txt'), 'x');
  const [d] = await o.after('t2', 'Bash', input, { stdout: '1\n2\n3\n4\n5\n6\n7' }, 1200, false);
  expect(d.change).toMatchObject({ status: 'done', durationMs: 1200, changedFiles: ['out.txt'], outputTail: ['3', '4', '5', '6', '7'] });
});
it('a failed Bash command ends with status failed', async () => { expect(d.change).toMatchObject({ status: 'failed' }); });
it('Read becomes a finished activity item in before() and nothing in after()', async () => {
  expect(await o.before('t3', 'Read', { file_path: join(tmp, 'src/app.tsx') })).toMatchObject([
    { phase: 'done', targetKey: 'activity', change: { type: 'activity', items: ['Read app.tsx'] } }]);
  expect(await o.after('t3', 'Read', {}, {}, 5, false)).toEqual([]);
});
it('task tools produce no visual change', async () => {
  expect(await o.before('t4', 'TaskCreate', { subject: 'x' })).toEqual([]);
});
it.each([
  ['Grep', { pattern: 'customer' }, 'Searched for “customer”'],
  ['Glob', { pattern: '**/*.ts' }, 'Looked for **/*.ts'],
  ['WebSearch', { query: 'sqlite tips' }, 'Searched the web for “sqlite tips”'],
  ['WebFetch', { url: 'https://example.com/a' }, 'Opened example.com'],
  ['Mystery', {}, 'Used Mystery'],
])('activityLabel(%s)', (tool, input, label) => expect(activityLabel(tool, input)).toBe(label));
```

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer `ToolObserver`.** Houdt per `toolUseId` de staat van `before` bij: voor schrijftools de `FileSnapshot`, voor Bash de `ProjectIndex` en de begintijd. Bash-`outputTail` = de laatste 5 niet-lege regels van `response.stdout` (defensief lezen; geen `stdout` → `[]`). Paden in `changedFiles` zijn relatief en gesorteerd. Lees de invoervelden van tools defensief en controleer de namen tegen de typen in `node_modules/@anthropic-ai/claude-agent-sdk` (`file_path`, `content`, `command`, `description`).
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: tool observer for files, commands and activity`

---

### Task 7: AgentSession

**Files:**
- Create: `src/main/agent/session.ts`
- Test: `src/main/agent/session.test.ts`

**Interfaces:**
- Consumes: `ToolObserver`, `TASK_TOOLS` (Task 6), `classifyRisk`, `PLAIN_LANGUAGE_APPEND` (Task 4), `AppEvent`, `ModelId` (Task 2)
- Produces:

```ts
export type QueryFn = typeof import('@anthropic-ai/claude-agent-sdk').query;
export interface AgentSessionDeps {
  queryFn: QueryFn; projectDir: string; apiKey: string; model: ModelId;
  emit(e: AppEvent): void;
  requestPermission(e: Extract<AppEvent, { kind: 'permission' }>): Promise<boolean>;
  now(): number; newId(): string;
}
export class AgentSession {
  constructor(deps: AgentSessionDeps);
  send(text: string): { turnId: string; done: Promise<void> }; // gooit 'Claude is still working.' als er al een beurt loopt
  stop(): void;
  readonly running: boolean;
}
export const AUTH_ERROR = "Claude couldn't verify your API key. Check it in Settings.";
export const DENY_MESSAGE = 'The user stopped this action.';
```

Opties die `send` aan `queryFn` meegeeft: `cwd: projectDir`, `model`, `includePartialMessages: true`, `systemPrompt: { type: 'preset', preset: 'claude_code', append: PLAIN_LANGUAGE_APPEND }`, `env: { ...process.env, ANTHROPIC_API_KEY: apiKey, CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' }`, `abortController`, `permissionMode: 'default'`, `resume: <session_id uit de eerste system/init>` vanaf de tweede beurt, `hooks: { PreToolUse, PostToolUse, PostToolUseFailure }` (elk één matcher zonder `matcher`, callback geeft `{ continue: true }` terug) en `canUseTool`.

- [ ] **Step 1: Schrijf de falende tests** met een nep-`queryFn`: een async generator die de meegegeven `options.hooks.*[0].hooks[0](input, toolUseId, { signal })` en `options.canUseTool(...)` zelf aanroept, echte bestanden schrijft in een tijdelijke projectmap, en `stream_event`-, `system`- en `result`-berichten oplevert.

```ts
it('streams text, emits file changes in order and ends the turn', async () => {
  // nep: system/init(session_id 's1') → text_delta "I'll write" → Pre(Write notes.md) → schrijf → Post → text_delta "Done." → result success
  const { done } = session.send('Write notes');
  await done;
  expect(events.map(e => e.kind === 'change' ? `change:${e.change.phase}` : e.kind))
    .toEqual(['text', 'change:start', 'change:done', 'text', 'turn-end']);
  expect(events.at(-1)).toMatchObject({ outcome: 'done', error: null });
});
it('passes model, key, todo flag and the plain-language append; resumes on the next turn', async () => {
  await session.send('one').done; await session.send('two').done;
  expect(calls[0].options).toMatchObject({ model: 'claude-opus-5-5', cwd: tmp, includePartialMessages: true,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: PLAIN_LANGUAGE_APPEND } });
  expect(calls[0].options.env).toMatchObject({ ANTHROPIC_API_KEY: 'sk-ant-test', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' });
  expect(calls[1].options.resume).toBe('s1');
});
it('asks permission only for risky tools and denies when the user says no', async () => {
  requestPermission.mockResolvedValue(false);
  expect(await canUseTool('Bash', { command: 'rm -rf build' }, opts)).toEqual({ behavior: 'deny', message: DENY_MESSAGE });
  expect(await canUseTool('Bash', { command: 'npm test' }, opts)).toEqual({ behavior: 'allow', updatedInput: { command: 'npm test' } });
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(requestPermission.mock.calls[0][0]).toMatchObject({ kind: 'permission', title: 'Allow this command?' });
});
it('turns TaskCreate / TaskUpdate into task events', async () => {
  // Post(TaskCreate, input { subject: 'Create table', activeForm: 'Creating table' }, response { task: { id: '1', subject: 'Create table' } })
  // Post(TaskUpdate, input { taskId: '1', status: 'in_progress' })
  expect(taskEvents).toEqual([
    expect.objectContaining({ taskId: '1', subject: 'Create table', activeForm: 'Creating table', status: 'pending' }),
    expect.objectContaining({ taskId: '1', status: 'in_progress' })]);
});
it('stop() aborts the turn and ends it as stopped', async () => {
  const { done } = session.send('long job'); session.stop(); await done;
  expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'stopped' });
});
it('maps an authentication failure to AUTH_ERROR', async () => {
  // nep gooit new Error('401 invalid x-api-key')
  expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'failed', error: AUTH_ERROR });
});
it('refuses a second send while running', () => {
  session.send('a');
  expect(() => session.send('b')).toThrow('Claude is still working.');
});
```

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer `AgentSession`.**
  - Tekst: `message.type === 'stream_event'` met `event.type === 'content_block_delta'` en `event.delta.type === 'text_delta'` → `{ kind: 'text', text: event.delta.text }`.
  - Hooks: `PreToolUse` → `observer.before`; `PostToolUse` → `observer.after(…, failed=false)`; `PostToolUseFailure` → `observer.after(…, failed=true)`. Elke `VisualChange` wordt `{ kind: 'change' }`. Voor `TaskCreate` leest `PostToolUse` het id uit `tool_response.task.id`; `TaskUpdate` leest `taskId ?? id ?? task_id` en `activeForm ?? active_form` (defensief, zie de SDK-docs over takenlijsten).
  - Einde: `result` met `subtype: 'success'` → `done`; ander `subtype` of een gegooide fout → `failed` met `AUTH_ERROR` als de tekst `401`, `authentication` of `invalid x-api-key` bevat, anders `Something went wrong: <eerste regel>`; afgebroken via `stop()` → `stopped`.
  - Alle events krijgen `at: now()` en de `turnId` van de lopende beurt.
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: agent session with hooks, tasks, permissions and stop`

---

### Task 8: Gespreksreducer

**Files:**
- Create: `src/renderer/state/conversation.ts`
- Test: `src/renderer/state/conversation.test.ts`

**Interfaces:**
- Consumes: `AppEvent`, `Change`, `FileChange`, `TaskStatus` (Task 2)
- Produces:

```ts
export interface CardModel { id: string; targetKey: string; status: 'working' | 'done' | 'failed';
  change: Change; files: FileChange[] | null; lastAt: number; expanded: boolean }
export type TurnItem =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'card'; id: string; card: CardModel }
  | { kind: 'permission'; id: string; requestId: string; title: string; detail: string; decision: 'allowed' | 'denied' | null };
export interface TaskItem { taskId: string; subject: string; activeForm: string | null; status: TaskStatus }
export interface Turn { id: string; userText: string; items: TurnItem[]; tasks: TaskItem[];
  status: 'running' | 'done' | 'failed' | 'stopped'; error: string | null; collapsed: boolean }
export interface ConversationState { turns: Turn[] }
export type Action =
  | { type: 'user-sent'; turnId: string; text: string }
  | { type: 'event'; event: AppEvent }
  | { type: 'toggle-card'; turnId: string; cardId: string }
  | { type: 'permission-decided'; requestId: string; allow: boolean };
export const GROUP_WINDOW_MS = 1000;
export const initialState: ConversationState;
export function reduce(state: ConversationState, action: Action): ConversationState;
```

Een kaart met `files !== null` is een groepskaart ("Updated N files").

- [ ] **Step 1: Schrijf de falende tests** (helpers `change(phase, targetKey, change, at)` en `fileCh(path)`)

```ts
it('user-sent adds a running turn and collapses every earlier turn', () => {
  const s = run(['user-sent', 'a'], ev.turnEnd('a'), ['user-sent', 'b']);
  expect(s.turns.map(t => [t.id, t.status, t.collapsed])).toEqual([['a', 'done', true], ['b', 'running', false]]);
});
it('collapsing resets cards that were opened with Show', () => { /* expanded true → na nieuwe user-sent false */ });
it('appends text deltas to the last text item, and starts a new one after a card', () => {
  expect(itemsOf(s).map(i => i.kind === 'text' ? i.text : 'card')).toEqual(['Hello there', 'card', 'Done']);
});
it('a done change with the same targetKey updates the card instead of adding one', () => {
  expect(cards(s)).toHaveLength(1); expect(cards(s)[0].status).toBe('done');
});
it('consecutive activity changes merge their items', () => {
  expect(cards(s)[0].change).toEqual({ type: 'activity', items: ['Read a.ts', 'Read b.ts'] });
});
it('file changes to different files within GROUP_WINDOW_MS become one group card', () => {
  // file:a at 0, file:b at 900
  expect(cards(s)).toHaveLength(1); expect(cards(s)[0].files!.map(f => f.path)).toEqual(['a', 'b']);
});
it('a file change after GROUP_WINDOW_MS starts a new card', () => {
  // file:a at 0, file:b at 1500
  expect(cards(s)).toHaveLength(2);
});
it('toggle-card flips expanded', () => { expect(cards(s)[0].expanded).toBe(true); });
it('permission events add an item and permission-decided records the decision', () => {
  expect(permission(s)).toMatchObject({ requestId: 'r1', decision: 'denied' });
});
it('task events upsert tasks and deleted removes them', () => {
  // taak 1 'Create table' pending → deleted; taak 2 'Add rows' pending → in_progress; update voor onbekend id '9' → genegeerd
  expect(s.turns[0].tasks).toEqual([{ taskId: '2', subject: 'Add rows', activeForm: null, status: 'in_progress' }]);
});
it('turn-end finishes working cards: done → done, failed/stopped → failed', () => {
  expect(cards(sDone)[0].status).toBe('done'); expect(cards(sStopped)[0].status).toBe('failed');
  expect(sStopped.turns[0]).toMatchObject({ status: 'stopped' });
});
```

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer `reduce`** (puur, geen mutatie). Samenvoegregels voor een binnenkomende change met `targetKey` K in de lopende beurt, in deze volgorde:
  1. Is het laatste item een kaart met `targetKey === K` → werk die kaart bij (activiteit: `items` aanvullen; anders `change` vervangen), `status` volgt de fase.
  2. Is de change een bestand, en is het laatste item een bestands- of groepskaart met `at - lastAt <= GROUP_WINDOW_MS` → voeg samen tot een groepskaart (`files`, nieuwste versie per pad).
  3. Anders een nieuwe kaart met `id = change.id`.
  `turn-end` voor een onbekende beurt wordt genegeerd, net als een taakupdate voor een onbekend `taskId`.
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: conversation reducer with card merging and collapse`

---

### Task 9: Regisseur

**Files:**
- Create: `src/renderer/director/director.ts`, `src/renderer/director/useDirector.ts`
- Test: `src/renderer/director/director.test.ts`

**Interfaces:**
- Consumes: `AppEvent` (Task 2)
- Produces:

```ts
export const MIN_VISIBLE_MS = 600;
export const MAX_LAG_MS = 2000;
export class Director {
  constructor(opts?: { minVisibleMs?: number; maxLagMs?: number });
  push(e: AppEvent, now: number): void;
  drain(now: number): AppEvent[];
  nextWakeAt(): number | null;
}
export function useDirector(onRelease: (events: AppEvent[]) => void): void; // abonneert op window.api.onEvent
```

Een event is *getempeerd* als het een `change` is met `phase === 'start'`. Alle andere events wachten alleen op wat vóór hen in de wachtrij staat.

- [ ] **Step 1: Schrijf de falende tests**

```ts
it('releases text immediately', () => { d.push(text, 0); expect(d.drain(0)).toEqual([text]); });
it('keeps each new card visible for MIN_VISIBLE_MS before the next', () => {
  d.push(startA, 0); d.push(startB, 0);
  expect(d.drain(0)).toEqual([startA]); expect(d.nextWakeAt()).toBe(600);
  expect(d.drain(599)).toEqual([]); expect(d.drain(600)).toEqual([startB]);
});
it('keeps order: text behind a waiting card waits too', () => {
  d.push(startA, 0); d.push(startB, 0); d.push(text, 0);
  expect(d.drain(0)).toEqual([startA]); expect(d.drain(600)).toEqual([startB, text]);
});
it('done and failed phases are not held back', () => {
  d.push(startA, 0); d.push(doneA, 10); expect(d.drain(10)).toEqual([startA, doneA]);
});
it('catches up: after MAX_LAG_MS everything waiting is released at once', () => {
  starts.forEach(s => d.push(s, 0));            // 10 card starts
  expect(d.drain(0)).toHaveLength(1);
  expect(d.drain(2000)).toHaveLength(9);
  expect(d.nextWakeAt()).toBeNull();
});
```

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer `Director`.** FIFO met per event `receivedAt`. `drain(now)`: is `now - kop.receivedAt >= maxLagMs` → geef alles vrij en zet `gateUntil = now`. Anders: geef vrij zolang de kop niet getempeerd is of `now >= gateUntil`; na het vrijgeven van een getempeerd event `gateUntil = now + minVisibleMs`. `nextWakeAt` = `null` bij een lege rij, anders `min(gateUntil, kop.receivedAt + maxLagMs)`. `useDirector` gebruikt `performance.now()` en één `setTimeout` naar `nextWakeAt()`.
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: director pacing with catch-up`

---

### Task 10: Gesprekskolom, invoer en bovenbalk

**Files:**
- Create: `src/renderer/ui/scroll.ts`, `Conversation.tsx`, `UserBubble.tsx`, `AgentText.tsx`, `Composer.tsx`, `TopBar.tsx`, `src/renderer/motion/tokens.ts`
- Modify: `src/renderer/App.tsx`, `src/renderer/i18n/en.ts`, `src/main/ipc.ts` (`project:open` met `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`)
- Test: `src/renderer/ui/scroll.test.ts`, `Composer.test.tsx`, `Conversation.test.tsx`

**Interfaces:**
- Consumes: `ConversationState`, `Turn`, `reduce` (Task 8), `useDirector` (Task 9), `window.api` (Task 2)
- Produces:

```ts
export function isNearBottom(el: { scrollTop: number; scrollHeight: number; clientHeight: number }, threshold?: number /* = 80 */): boolean;
export function Composer(p: { running: boolean; disabled: boolean; onSend(text: string): void; onStop(): void }): JSX.Element;
export function Conversation(p: { state: ConversationState; onToggleCard(turnId: string, cardId: string): void;
  onDecide(requestId: string, allow: boolean): void }): JSX.Element;
export function TopBar(p: { projectName: string | null; onSettings(): void }): JSX.Element;
// motion/tokens.ts
export const spring = { type: 'spring', stiffness: 380, damping: 38, mass: 1 } as const;
export const fade = { duration: 0.28, ease: [0.16, 1, 0.3, 1] } as const;
export const STAGGER_S = 0.03;
```

- [ ] **Step 1: Schrijf de falende tests**

```ts
it.each([
  [{ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }, true],   // helemaal onderaan
  [{ scrollTop: 530, scrollHeight: 1000, clientHeight: 400 }, true],   // 70px van de bodem
  [{ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 }, false],  // 100px van de bodem
])('isNearBottom(%o) is %s', (el, expected) => expect(isNearBottom(el)).toBe(expected));

it('Enter sends the trimmed text and clears the field', async () => {
  await user.type(box, '  Add an email column  {Enter}');
  expect(onSend).toHaveBeenCalledWith('Add an email column'); expect(box).toHaveValue('');
});
it('Shift+Enter adds a newline instead of sending; empty text never sends', async () => { expect(onSend).not.toHaveBeenCalled(); });
it('while running the button is Stop and Enter does not send', async () => {
  render(<Composer running disabled={false} onSend={onSend} onStop={onStop} />);
  await user.click(screen.getByRole('button', { name: 'Stop' })); expect(onStop).toHaveBeenCalled();
  await user.type(box, 'x{Enter}'); expect(onSend).not.toHaveBeenCalled();
});
it('renders the user bubble and the agent text of a turn', () => {
  expect(screen.getByText('Make a customer list')).toBeVisible();
  expect(screen.getByText('I’ll create a customers table.')).toBeVisible();
});
it('shows the error of a failed turn and the Stopped label of a stopped turn', () => {
  // beurt 1: status 'failed', error "Claude couldn't verify your API key. Check it in Settings."; beurt 2: status 'stopped'
  expect(screen.getByText("Claude couldn't verify your API key. Check it in Settings.")).toBeVisible();
  expect(screen.getByText('Stopped')).toBeVisible();
});
```

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer.** Kolom `max-width: 680px`, gecentreerd, items 16px uit elkaar; elk item is een `motion.div` met `layout` en een intrede `opacity 0→1, y 10→0`. Na elke vrijgegeven batch scrolt `Conversation` vloeiend naar beneden, maar alleen als `isNearBottom` vóór de update waar was. `TopBar` is een sleepzone (`-webkit-app-region: drag`) met de projectnaam en een tandwielknop (`aria-label="Settings"`). Teksten in `en.ts`: `askPlaceholder: 'Ask anything…'`, `send: 'Send'`, `stop: 'Stop'`, `stopped: 'Stopped'`.
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: conversation column, composer and top bar`

---

### Task 11: Live kaarten

**Files:**
- Create: `src/renderer/state/cardTitle.ts`, `src/renderer/cards/LiveCard.tsx`, `FileCard.tsx`, `FilesGroupCard.tsx`, `CommandCard.tsx`, `ActivityCard.tsx`, `TaskChecklist.tsx`, `PermissionCard.tsx`
- Modify: `src/renderer/ui/Conversation.tsx`, `src/renderer/i18n/en.ts`
- Test: `src/renderer/state/cardTitle.test.ts`, `src/renderer/cards/cards.test.tsx`

**Interfaces:**
- Consumes: `CardModel`, `TaskItem`, `TurnItem` (Task 8), motion-tokens (Task 10)
- Produces:

```ts
export function cardTitle(card: CardModel): string;
export function LiveCard(p: { card: CardModel; collapsed: boolean; onToggle(): void }): JSX.Element;
export function TaskChecklist(p: { tasks: TaskItem[] }): JSX.Element | null;
export function PermissionCard(p: { title: string; detail: string; decision: 'allowed' | 'denied' | null;
  onDecide(allow: boolean): void }): JSX.Element;
```

- [ ] **Step 1: Schrijf de falende tests**

`cardTitle` (exacte teksten):

| kaart | status | titel |
|---|---|---|
| file `notes.md` created | working | `Creating notes.md` |
| file `src/app.tsx` modified | working | `Editing app.tsx` |
| file `notes.md` created | done | `Created notes.md` |
| file `src/app.tsx` modified (+3 −1) | done | `Updated app.tsx` |
| file `old.css` deleted | done | `Deleted old.css` |
| groep met 3 bestanden | working / done | `Updating 3 files` / `Updated 3 files` |
| command, description `Generate the report` | working / done | `Generate the report` |
| command zonder description | working / done | `Running a command` / `Ran a command` |
| command failed, description `Run tests` | failed | `Run tests failed` |
| activity `['Read a.ts']` | done | `Read a.ts` |
| activity `['Read a.ts','Read b.ts','Read c.ts']` | done | `Read a.ts and 2 more` |

```tsx
it('collapsed card renders one summary line with Show', async () => {
  render(<LiveCard card={doneFileCard} collapsed onToggle={onToggle} />);
  expect(screen.getByText('Created notes.md')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Show' })); expect(onToggle).toHaveBeenCalled();
  expect(screen.queryByTestId('card-body')).toBeNull();
});
it('an opened collapsed card shows its body and a Hide button', () => {
  render(<LiveCard card={{ ...doneFileCard, expanded: true }} collapsed onToggle={onToggle} />);
  expect(screen.getByTestId('card-body')).toBeVisible(); expect(screen.getByRole('button', { name: 'Hide' })).toBeVisible();
});
it('a working card is marked busy for assistive tech', () => {
  render(<LiveCard card={workingCard} collapsed={false} onToggle={onToggle} />);
  expect(screen.getByTestId('live-card')).toHaveAttribute('aria-busy', 'true');
});
it('FileCard marks added and removed lines', () => {
  expect(container.querySelectorAll('[data-kind="add"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-kind="del"]')).toHaveLength(1);
});
it('FileCard shows a short note instead of lines for tooLarge files', () => {
  expect(screen.getByText('This file is too large or not text, so only the change is listed.')).toBeVisible();
});
it('TaskChecklist only renders with two or more tasks', () => { expect(container).toBeEmptyDOMElement(); });
it('PermissionCard calls onDecide and then shows the decision', async () => {
  await user.click(screen.getByRole('button', { name: 'Allow' })); expect(onDecide).toHaveBeenCalledWith(true);
  rerender(<PermissionCard {...props} decision="denied" />); expect(screen.getByText('Stopped')).toBeVisible();
});
```

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer.**
  - `LiveCard`: rand `1px var(--line)`, radius 12px, `var(--accent-line)` zolang `working`; kop met pulserend accentpunt (working), groen punt (done) of rood punt (failed) plus `cardTitle`. Ingeklapt en niet `expanded` → één regel-pil (`● <titel> · Show`). Wisselen tussen pil en volledige kaart is één Motion-`layout`-overgang met `AnimatePresence` (geen verspringing van de tekst eronder). Kiest de body op `change.type` / `files`.
  - `FileCard`: regels met `data-kind`, toegevoegd op `--green-soft`, verwijderd op `--red-soft`, `gap`-regels gedimd; nieuwe regels komen binnen met `STAGGER_S`. Maximaal 400 regels, daarna `…and N more lines`.
  - `FilesGroupCard`: lijst bestanden gesorteerd op `added + removed` (aflopend) met `+a −r`; klik op een rij klapt die diff open.
  - `CommandCard`: omschrijving, verstreken tijd (`1.2 s`), gewijzigde bestanden als lijst, de laatste uitvoerregels in monospace en gedimd.
  - `ActivityCard`: compacte lijst `items`.
  - `TaskChecklist`: per taak een rondje (pending), pulserend accentpunt met `activeForm` (in_progress) of groen vinkje (completed).
  - `PermissionCard` (`data-testid="permission-card"`): titel, detail, knoppen `Allow` (accent) en `Stop` (neutraal); na een keuze `Allowed` of `Stopped`.
  - Elke beurt in `Conversation` heeft `data-testid="turn"`; de kaart zelf `data-testid="live-card"`, haar inhoud `data-testid="card-body"`.
  - `Conversation` toont per beurt: gebruikersballon, `TaskChecklist`, daarna de items in volgorde.
- [ ] **Step 4: Run — verwacht PASS**
- [ ] **Step 5: Commit** — `feat: live cards with collapse, checklist and permission card`

---

### Task 12: Alles verbinden + end-to-end

**Files:**
- Create: `src/main/agent/fakeQuery.ts`
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/renderer/App.tsx`
- Test: `e2e/app.spec.ts` (uitbreiden)

**Interfaces:**
- Consumes: alles hierboven
- Produces: `fakeQuery: QueryFn` — alleen gebruikt als `process.env.VISUAL_IDE_FAKE_AGENT` gezet is; een vast script dat de echte hooks aanroept en echte bestanden schrijft in de projectmap, zodat de observers echte staat lezen. `VISUAL_IDE_PROJECT_DIR` slaat de mapkiezer over (alleen voor tests).
  - Script per beurt: tekst `I'll write your notes.` → `Write` van `notes.md` (`"a\nb\n"`) → `Bash` `{ command: 'node gen.js', description: 'Generate the report' }` dat `out.txt` schrijft, stdout `ok` → tekst `Done.` → `result` success.
  - Bevat het bericht `Clean up`: eerst `canUseTool('Bash', { command: 'rm -rf build' })`; bij weigering tekst `Okay, I left it alone.`.
  - `VISUAL_IDE_FAKE_AGENT_SLOW=1`: 5 s pauze tussen de stappen (voor de Stop-test). `VISUAL_IDE_FAKE_AGENT=burst`: 30 `Write`-acties binnen 1 s (Task 13).

- [ ] **Step 1: Breid `e2e/app.spec.ts` uit met falende tests** (start met `VISUAL_IDE_FAKE_AGENT=1`, een tijdelijke `VISUAL_IDE_PROJECT_DIR` en een opgeslagen testsleutel)

```ts
test('a turn shows text and a live file card', async () => {
  await composer.fill('Write notes'); await composer.press('Enter');
  await expect(win.getByText('Created notes.md')).toBeVisible();
  await expect(win.getByText('Done.')).toBeVisible();
});
test('sending the next message collapses the previous cards; Show reopens them', async () => {
  await send('Write notes'); await send('Again');
  const first = win.getByTestId('turn').first();
  await expect(first.getByRole('button', { name: 'Show' })).toHaveCount(2); // bestandskaart + commandokaart
  await first.getByRole('button', { name: 'Show' }).first().click();
  await expect(first.getByTestId('card-body')).toBeVisible();
});
test('Stop ends a running turn', async () => {
  // VISUAL_IDE_FAKE_AGENT_SLOW=1: het script wacht 5 s tussen stappen
  await send('Long job'); await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByText('Stopped')).toBeVisible();
});
test('a risky command asks for permission inside the conversation', async () => {
  await send('Clean up');
  const card = win.getByTestId('permission-card');
  await expect(card.getByText('Allow this command?')).toBeVisible();
  await card.getByRole('button', { name: 'Stop' }).click();
  await expect(card.getByText('Stopped')).toBeVisible();
  await expect(win.getByText('Okay, I left it alone.')).toBeVisible();
});
```

- [ ] **Step 2: Run `npm run e2e` — verwacht FAIL**
- [ ] **Step 3: Implementeer de bedrading.** `main/index.ts` maakt één `AgentSession` per geopend project zodra er een sleutel is (`queryFn` = `fakeQuery` of de echte `query`), stuurt `emit` naar `win.webContents.send(IPC.event, e)`, en houdt openstaande toestemmingsvragen bij in een `Map<requestId, resolve>` die `agent:permission` afhandelt. `App.tsx`: `useReducer(reduce, initialState)`, `useDirector(events => events.forEach(e => dispatch({ type: 'event', event: e })))`, `send` dispatcht eerst `user-sent` met de `turnId` uit `window.api.send`.
- [ ] **Step 4: Run `npm run e2e` en `npm test` — verwacht PASS**
- [ ] **Step 5: Handmatige rooktest met de echte agent.** `npm run dev`, sleutel invullen, een lege map openen, vragen: "Create a notes.md with three ideas for my webshop". Verwacht: tekst in gewone taal, een kaart `Creating notes.md` → `Created notes.md` met groene regels.
- [ ] **Step 6: Commit** — `feat: wire agent, observers and cards end to end`

---

### Task 13: Beweging fijnslijpen en prestaties meten

**Files:**
- Modify: `src/renderer/motion/tokens.ts`, de kaartcomponenten
- Create: `e2e/perf.spec.ts`
- Test: `src/renderer/motion/tokens.test.ts`

**Interfaces:**
- Produces: `export function motionFor(reduced: boolean): { layout: object; enter: object; exit: object }` — bij `reduced` zijn alle overgangen fades van 0.12 s zonder verplaatsing; anders `spring` voor layout en `fade` voor intrede/vertrek.

- [ ] **Step 1: Schrijf de falende tests**

```ts
it('reduced motion uses short fades without movement', () => {
  const m = motionFor(true);
  expect(m.enter).toEqual({ opacity: 1, transition: { duration: 0.12 } });
  expect(JSON.stringify(m)).not.toMatch(/"y"|"x"|scale/);
});
```

`e2e/perf.spec.ts` (tag `@perf`, alleen lokaal op een Mac): met `VISUAL_IDE_FAKE_AGENT=burst` schrijft het nepscript 30 bestanden in 1 s. De test meet frametijden met een `requestAnimationFrame`-lus in de pagina en verwacht dat het 95e percentiel onder **20 ms** blijft, en dat de laatste kaart binnen **2500 ms** na de laatste schrijfactie in beeld is.

- [ ] **Step 2: Run — verwacht FAIL**
- [ ] **Step 3: Implementeer `motionFor`** en gebruik `useReducedMotion()` uit `motion/react` in alle kaarten via `motionFor`. Controleer met DevTools (Performance) dat inklappen en rijen invoegen geen lange taken > 50 ms veroorzaken; animeer geen `box-shadow` of `height` buiten Motion-`layout`.
- [ ] **Step 4: Run `npm test` en `npx playwright test --grep @perf` — verwacht PASS**
- [ ] **Step 5: Commit** — `perf: reduced motion and frame-time check`

---

## Volgende plannen

Elk volgend plan bouwt verder op de interfaces hierboven (`ToolObserver`, `VisualChange`, `CardModel`, de regisseur) en levert opnieuw werkende software op.

2. **Git** — Git-observer (refs, commits, `HEAD`, `MERGE_HEAD`, conflicten via de `git`-CLI, goedkope detectie via refs), indeling in banen, `GraphCard` met de merge-animatie uit de mockup, nieuw project aanmaken met automatische `git init`.
3. **SQLite** — SQLite-observer in een Electron `utilityProcess` met een alleen-lezen verbinding, detectie via `PRAGMA data_version` en wijzigingstijd, `TableCard` voor nieuwe rijen, gewijzigde cellen, verwijderde rijen en nieuwe kolommen, met grenzen voor grote tabellen.
4. **Voorproef bij toestemming** — droge merge met `git merge-tree`, SQL eerst op een tijdelijke kopie van de database, de voorproef in `PermissionCard`.
5. **Web preview, Show code en bewaren** — dev-server herkennen en tonen, Show code met de Monaco-diffweergave, gesprekken per project bewaren, een folder watcher voor wijzigingen buiten tool calls, zwaar diffwerk naar een `utilityProcess`, laatste afwerking.
