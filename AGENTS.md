# Repository Guidelines

## Project Structure & Module Organization

This package is the TypeScript SDK for the Factory Droid CLI. Public exports live in `src/index.ts`; treat that file as the public API contract. Core layers are `src/query.ts`, `src/session.ts`, `src/client.ts`, `src/protocol.ts`, and `src/transport.ts`. Runtime schemas live under `src/schemas/`. Unit tests are in `tests/`, runnable usage samples are in `examples/`, and public documentation lives in `docs/`.

## Build, Test, and Development Commands

- `npm run build` — build the package into `dist/` with `tsup`
- `npm run typecheck` — run TypeScript checks for the library
- `npm run typecheck:examples` — typecheck the example scripts
- `npm test` — run the Vitest suite
- `npm run lint` — lint `src/` and `tests/`
- `npm run format:check` — verify Prettier formatting

Before finishing a change, run the smallest relevant checks first, then full validation if the public API or docs/examples changed.

## Coding Style & Naming Conventions

Use TypeScript with ESM imports and the existing project style. Follow Prettier formatting and ESLint rules; do not hand-format against them. Match nearby naming patterns: exported types/interfaces use `PascalCase`, functions and variables use `camelCase`, and example filenames use kebab-case like `multi-turn-session.ts`.

## Testing Guidelines

Vitest is the test runner. Add or update tests in `tests/` whenever changing exported behavior, message conversion, schemas, or session/client flows. Keep tests focused and descriptive; mirror source names when practical, for example `session.test.ts` for `src/session.ts`. For example changes, also run `npm run typecheck:examples`.

## Commit & Pull Request Guidelines

Follow the recent commit style: `feat: ...`, `docs: ...`, `refactor: ...`. Keep commit messages concise and user-facing. PRs should explain what changed, why it changed, and note any API, docs, or example updates. Link relevant issues when available.

## Agent-Specific Instructions

Prefer updating `docs/` and `examples/` over expanding this file. Verify every documented feature against current exports and tests before publishing. Keep examples runnable with `npx tsx examples/<file>.ts`, and keep `AGENTS.md` concise, durable, and repo-specific.
