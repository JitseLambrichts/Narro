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

Narro runs the unmodified Claude Code that ships with the Agent SDK, so you don't need to
install it separately. Claude Code signs in the way you set it up: with your Claude account, or
with your own API key if you configured one for Claude Code. Narro never sees or stores a
password, code or token, and it leaves every sign-in method of Claude Code working.

If Claude Code is not signed in yet, the app shows **Sign in with Claude** on first start. That
starts Claude Code's own sign-in (`claude auth login`): your browser opens and the result goes
straight to Claude Code. Its conversations are regular Claude Code sessions in
`~/.claude/projects`.

Using a Claude subscription this way is meant for your own, individual use. Anthropic's
[terms for Claude Code](https://code.claude.com/docs/en/legal-and-compliance) ask developers who
build products or services on the Agent SDK to use API keys, so check them before giving Narro
to anyone else.

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
