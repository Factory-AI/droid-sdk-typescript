# Repository Guidelines

## Project Structure & Module Organization

This repository contains guides and runnable examples for `@factory/droid-sdk`. Node examples live in `examples/node/`, browser examples live in `examples/browser/`, and longer guides live in `docs/`.

## Build, Test, and Development Commands

- `npm run typecheck` — typecheck all examples
- `npm run lint` — lint all examples
- `npm run format:check` — verify Prettier formatting
- `npm run check:docs` — type-check the TypeScript code blocks in the docs
- `npm test` — run regression checks without API credentials or model calls
- `npm run test:examples` — run the Node examples against a real Droid CLI and check what they did (needs `FACTORY_API_KEY`; uses credits)
- `npm run test:browser-examples` — run the browser examples in headless Chromium (needs Playwright; see the script header)

Before finishing a change, run the first five checks. Run the example harness when you change an example.

## Coding Style & Naming Conventions

Use TypeScript with ESM imports and the existing project style. Follow Prettier formatting and ESLint rules; do not hand-format against them. Match nearby naming patterns: exported types/interfaces use `PascalCase`, functions and variables use `camelCase`, and example filenames use kebab-case like `multi-turn-session.ts`.

## Commit & Pull Request Guidelines

Follow the recent commit style: `feat: ...`, `docs: ...`, `refactor: ...`. Keep commit messages concise and user-facing. PRs should explain what changed, why it changed, and note any API, docs, or example updates. Link relevant issues when available.

## Agent-Specific Instructions

Verify documented features against the installed SDK. Keep Node examples runnable with `npx tsx examples/node/<file>.ts`, and browser examples bundleable with esbuild.
