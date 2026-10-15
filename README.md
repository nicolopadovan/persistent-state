# persistent-state

React state that persists to a cookie, `localStorage` or `sessionStorage`, readable on the server for cookies and kept
in sync across components and tabs.

**Docs: [persistent-state.nicolopadovan.com](https://persistent-state.nicolopadovan.com)** ·
[llms-full.txt](https://persistent-state.nicolopadovan.com/llms-full.txt)

```bash
pnpm add @nicolopadovan/persistent-state
```

Every 0.x minor may contain breaking changes. Pin the version you depend on and read the changelog before you upgrade.

## Repo Layout

- [`packages/persistent-state`](./packages/persistent-state): the package
- [`apps/docs`](./apps/docs): the docs site (Astro Starlight)
- `apps/example-*`: example applications for React and Next.js
- [`docs`](./docs): maintainer notes: [publishing and releases](./docs/publishing-and-releases.md) and the [spec](./docs/spec.md)

AI tools were used to write this repository's code, tests and documentation. Every change goes through the same tests
and CI checks before it is released.

[MIT License](./LICENSE) · [Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [Security](./SECURITY.md) · [Support](./SUPPORT.md)
