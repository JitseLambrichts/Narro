# Narro

A live visual IDE for macOS: talk to Claude in one column and watch every action of the agent
appear as a live card in the conversation. Cards collapse when you send the next message and
open again with **Show**.

This is plan 1 of 5 (the foundation). The plan lives in
[`docs/superpowers/plans/2026-10-30-live-visual-ide-plan-1-foundation.md`](docs/superpowers/plans/2026-10-30-live-visual-ide-plan-1-foundation.md).

## How it fits together

- **Main process** (`src/main`) runs the Claude Agent SDK. Hooks before and after every tool call
  go to observers that read the real state of the project folder and produce a `VisualChange`.
- **Preload** (`src/preload`) exposes `window.api`; the renderer never sees the API key.
- **Renderer** (`src/renderer`): a director paces what appears (never more than 2 s behind), a
  pure reducer keeps the conversation, and React + Motion draw the cards.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

On first start the app asks for your Anthropic API key. It is stored encrypted in the macOS
Keychain-backed safe storage and only used by the agent.

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

The e2e tests use a scripted agent (`VISUAL_IDE_FAKE_AGENT`) that calls the real hooks and writes
real files, so no API key or network is needed.

## Build

```bash
npm run build:mac
```
