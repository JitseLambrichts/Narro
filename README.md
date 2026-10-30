# Narro

A live visual IDE for macOS: talk to Claude in one column and watch every action of the agent
appear as a live card in the conversation. Cards collapse when you send the next message and
open again with **Show**.

This is plan 1 of 5 (the foundation). The plan lives in
[`docs/superpowers/plans/2026-10-30-live-visual-ide-plan-1-foundation.md`](docs/superpowers/plans/2026-10-30-live-visual-ide-plan-1-foundation.md).

## How it fits together

- **Main process** (`src/main`) runs Claude Code in the background through the Claude Agent SDK:
  one hidden process per project that stays open for the whole conversation. Your messages
  stream in, Claude's answers and tool activity stream out. Hooks before and after every tool
  call go to observers that read the real state of the project folder and produce a
  `VisualChange`.
- **Preload** (`src/preload`) exposes `window.api` to the renderer.
- **Renderer** (`src/renderer`): a director paces what appears (never more than 2 s behind), a
  pure reducer keeps the conversation, and React + Motion draw the cards.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Narro uses your Claude account, the same sign-in as Claude Code, so your Claude plan covers
the usage and no API key is needed. If you already use Claude Code on this Mac you are signed
in. Otherwise the app shows **Sign in with Claude** on first start: your browser opens, you sign
in, and the app picks it up. No terminal window is involved.

Narro runs the Claude Code that ships with the Agent SDK, so you don't need to install it
separately. Its conversations are regular Claude Code sessions in `~/.claude/projects`.

## Checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run e2e
```

```bash
npx playwright test --grep @perf
```

The e2e tests use a scripted agent and account (`VISUAL_IDE_FAKE_AGENT`) that call the real
hooks and write real files, so no sign-in or network is needed.

## Build

```bash
npm run build:mac
```
