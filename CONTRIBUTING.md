# Contributing

Thanks for helping improve persistent-state. Bug reports, documentation fixes and pull requests are welcome. For a new
feature or a change to the public API, open an issue first so the design can be agreed before you write the code.

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE), and to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Repository layout

- [`packages/persistent-state`](./packages/persistent-state): the npm package.
- [`apps/docs`](./apps/docs): the documentation site, built with Astro Starlight.
- `apps/example-*`: one example application per framework: React and Next.js.

## Setup

You need Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm turbo run typecheck lint test build
```

To run an example application or the docs locally:

```bash
pnpm --filter example-next dev
pnpm --filter docs dev
```

## Checks

CI runs these on every pull request, and they must pass:

```bash
pnpm format:check
pnpm knip
pnpm turbo run typecheck lint test build
pnpm --filter @nicolopadovan/persistent-state check:package
pnpm --filter @nicolopadovan/persistent-state test:browser
```

`test:browser` runs the tests in `packages/persistent-state/test/browser` in a real Chromium: real cookies, real
`BroadcastChannel` and `storage` events between two pages, and the `pagehide` flush. They do not run with `test`.
Install the browser once before the first run:

```bash
pnpm --filter @nicolopadovan/persistent-state exec playwright install chromium-headless-shell
```

`check:package` validates the published package with publint and Are the Types Wrong, and checks every entry point
against its size budget in [`.size-limit.js`](./packages/persistent-state/.size-limit.js). Lint warnings fail the
build. `pnpm format` formats the repository with Prettier, and `pnpm knip` reports unused files, exports and
dependencies. A feature that adds code may raise a budget; say so in the pull request.

## Pull requests

- Keep each pull request to one change, with tests for the behavior it adds or fixes.
- Preserve the consent rule: no storage is read or written before the consent predicate allows it.
- Update the docs in [`apps/docs`](./apps/docs) when public behavior, options or install steps change.
- Add a changeset when the published package changes: run `pnpm changeset`, pick the bump and describe the change for
  the changelog.
- Describe what changed and how you verified it.

## Security

Don't report vulnerabilities in public issues; see [SECURITY.md](./SECURITY.md).
