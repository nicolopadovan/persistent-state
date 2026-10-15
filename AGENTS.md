# AGENTS.md

Instructions for AI coding agents working in this repository. People contributing should read
[CONTRIBUTING.md](./CONTRIBUTING.md); everything there applies to agents too.

## Repository

A pnpm and Turborepo monorepo. Use Node.js 24 and the pnpm version in `packageManager`.

- `packages/persistent-state`: the published package. Source in `src`, Vitest tests in `test`, build with tsup.
- `apps/docs`: the documentation site, Astro Starlight. Pages are in `src/content/docs`.
- `apps/example-*`: one example application per framework.
- `docs`: maintainer notes, including [publishing and releases](./docs/publishing-and-releases.md).

The published docs are at https://persistent-state.nicolopadovan.com, and as Markdown for agents at
https://persistent-state.nicolopadovan.com/llms-full.txt.

## Commands

```bash
pnpm install
pnpm format                      # Prettier, writes changes
pnpm format:check
pnpm knip                        # unused files, exports and dependencies
pnpm turbo run typecheck lint test build
pnpm --filter @nicolopadovan/persistent-state check:package
pnpm --filter @nicolopadovan/persistent-state test
pnpm --filter docs dev
```

Before you finish, run every check CI runs: `format:check`, `knip`, the turbo command and `check:package`. Lint
warnings fail the build.

## Rules

- The package has no runtime dependencies. React and Next.js are peer dependencies.
- No storage is read or written before the consent predicate allows it. Every change to a driver, the store or the
  provider needs a test that proves it.
- Never read storage in `getServerSnapshot`; the server and the first client render must agree.
- Never trim code to pass a size budget. A feature that adds code raises its budget in
  `packages/persistent-state/.size-limit.js`; say so in the pull request.
- A new entry point needs all of: the tsup `entry` in `tsup.config.ts`, the `exports` field in `package.json`, a
  size budget, a docs page.
- Browser code must run in the browsers in `browserslist` in `packages/persistent-state/package.json`.
- Match the surrounding code. Write no comments that restate the code; comment only external constraints.
- Add a changeset (`pnpm changeset`) when the published package changes.

## Docs

- Write in the tone of the Next.js docs: complete, professional sentences, technical and precise. Verify every
  fact against the source in `packages/persistent-state/src`. Put extra depth in `<details>`.
- Update the docs and the changeset when public behavior, options or install steps change.
