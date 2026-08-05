# Repository Guidelines

## Project Structure & Module Organization

This repository contains guides and runnable examples for `@factory/droid-sdk`. Node examples live in `examples/node/`, browser examples live in `examples/browser/`, and longer guides live in `docs/`.

## Build, Test, and Development Commands

- `npm run typecheck` — typecheck all examples
- `npm run lint` — lint all examples
- `npm run format:check` — verify Prettier formatting

Before finishing a change, run all three checks.

## Coding Style & Naming Conventions

Use TypeScript with ESM imports and the existing project style. Follow Prettier formatting and ESLint rules; do not hand-format against them. Match nearby naming patterns: exported types/interfaces use `PascalCase`, functions and variables use `camelCase`, and example filenames use kebab-case like `multi-turn-session.ts`.

## Commit & Pull Request Guidelines

Follow the recent commit style: `feat: ...`, `docs: ...`, `refactor: ...`. Keep commit messages concise and user-facing. PRs should explain what changed, why it changed, and note any API, docs, or example updates. Link relevant issues when available.

## Agent-Specific Instructions

Verify documented features against the installed SDK. Keep Node examples runnable with `npx tsx examples/node/<file>.ts`, and browser examples bundleable with esbuild.
