# Plan: persistent-state 0.x, the first public release

Spec: [spec.md](./spec.md) · branch `feat/0x-setup` · 2026-10-15

Every step lands alone on `feat/0x-setup` with its gates green. ConsentLayer, the reference for every copied file, is
at `/Users/nico/Documents/analytics-consent-manager-npm` (abbreviated `CL/` below). "The package" is
`packages/persistent-state`; `pnpm -F pkg` stands for `pnpm --filter @nicolopadovan/persistent-state`.

## Gates

| Gate        | Command                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `format`    | `pnpm format:check`                                                                                                 |
| `knip`      | `pnpm knip`                                                                                                         |
| `typecheck` | `pnpm turbo run typecheck`                                                                                          |
| `lint`      | `pnpm turbo run lint`                                                                                               |
| `unit`      | `pnpm turbo run test`                                                                                               |
| `build`     | `pnpm turbo run build`                                                                                              |
| `browser`   | `pnpm -F pkg exec playwright install chromium-headless-shell && pnpm -F pkg test:browser`                           |
| `package`   | `pnpm -F pkg check:package`                                                                                         |
| `ci`        | `act pull_request -j check`, `-j min-versions` and `-j secrets` with `-W .github/workflows/ci.yml`, run unsandboxed |

A gate becomes available in the step that creates it; no step lists a gate that does not exist yet.

## Order and parallelism

| Wave | Steps (parallel within a wave)                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1    | s1 restructure                                                                                                                   |
| 2    | s2 core store · s9 docs site skeleton · s15 community files                                                                      |
| 3    | s3 schema, version, expiry (after s2) · s5 `/react` (after s2)                                                                   |
| 4    | s4 consent and cross-tab (after s3) · s6 `/next` (after s5) · s13 example-react (after s5)                                       |
| 5    | s7 browser tests · s8 package AGENTS.md, README, changeset · s14 example-next · s10, s11, s12 docs content (all after s4 and s6) |
| 6    | s16 CI workflow (after s7, s8, s13, s14)                                                                                         |
| 7    | s17 Release workflow (after s16)                                                                                                 |
| 8    | s18 final audit (after every step above); then s19 milestones (hold) and, once the repository is public, s20 settings (hold)     |

s2, s3 and s4 touch the same core files and run in sequence; everything else in a wave touches separate files. The
docs sidebar is generated from directories (s9), so s10 to s12 never edit the same file.

## Steps

```toml
spec = "docs/spec.md"

[[step]]
id = "s1"
title = "Restructure into a pnpm and Turborepo monorepo with ConsentLayer's tooling"
satisfies = ["AC-1"]
files = [
  "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "turbo.json", "tsconfig.base.json", "vitest.config.ts",
  "prettier.config.mjs", ".prettierignore", ".gitignore", "eslint.config.mjs", "knip.json", ".changeset/config.json",
  "LICENSE", "README.md", ".github/workflows/publish.yml (deleted)",
  "packages/persistent-state/{package.json,tsconfig.json,tsup.config.ts,vitest.config.ts,LICENSE}",
  "packages/persistent-state/src/** (moved from src/)", "packages/persistent-state/test/** (moved from tests/)",
  "tsconfig.json, vitest.config.ts at the old root (removed)",
]
after = []
rung = "engineer"
done_check = "Gates format, typecheck, unit and build pass from a clean `pnpm install`; `git ls-files src tests` is empty; `.github/workflows/publish.yml` is gone; README.md contains no private project name."
gates = ["format", "typecheck", "unit", "build"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-1. Turn the single-package repository into the monorepo layout of spec.md "Package layout", copying
ConsentLayer's tooling from /Users/nico/Documents/analytics-consent-manager-npm (CL/).

- `git mv src packages/persistent-state/src` and `git mv tests packages/persistent-state/test`, keeping the 0.2.1 code
  and its tests working for now (s2 replaces them). Remove the old root tsconfig.json and vitest.config.ts.
- Root: copy CL/package.json's shape (private, `packageManager` pnpm@10.34.6, scripts build/dev/format/format:check/
  knip/lint/test/typecheck, devDependencies needed here: @changesets/cli, eslint stack, prettier, knip, tsup, turbo,
  typescript, vitest, jsdom, @testing-library/react, @types/react, @types/react-dom, @types/node). Copy
  CL/pnpm-workspace.yaml (apps/*, packages/*), CL/turbo.json without ConsentLayer's env vars, CL/tsconfig.base.json,
  CL/prettier.config.mjs, CL/.prettierignore, CL/.gitignore, CL/vitest.config.ts with aliases for
  `@nicolopadovan/persistent-state` and its subpaths to the package's src, CL/.changeset/config.json, and a knip.json
  and eslint.config.mjs reduced to what this repo has (no Vue/Svelte/Solid/Angular sections). eslint.config.mjs may be
  committed now but the `lint` gate starts in s2.
- Package: package.json per spec.md "Package layout" (version stays 0.2.1; publishConfig.access public; drop the
  GitHub registry; keep next-client-cookies as a devDependency only until s2), tsconfig.json extending the base,
  tsup.config.ts with the "." entry, vitest.config.ts as CL/packages/consentlayer/vitest.config.ts without Svelte.
- Delete .github/workflows/publish.yml: it publishes to GitHub Packages on every `v*` tag, which the new Release
  workflow will push.
- Add LICENSE (MIT, copy CL/LICENSE). Replace README.md with a short placeholder that describes the package generically
  (the current one names private projects); s15 writes the final README.
- Leave the untracked .DS_Store alone. Do not add a lint script to the package yet.
"""

[[step]]
id = "s2"
title = "Framework-free core: definitions, shared store, cookie and Web Storage drivers, fallback, debounce"
satisfies = ["AC-2", "AC-3", "AC-4", "AC-9", "AC-11", "AC-16", "AC-17", "AC-18", "AC-20"]
files = [
  "packages/persistent-state/src/index.ts", "packages/persistent-state/src/core/*.ts",
  "packages/persistent-state/src/{client.ts,useStorage.ts,cookies.ts} (deleted)",
  "packages/persistent-state/test/*.test.ts", "packages/persistent-state/test/fixtures/legacy-cookies.ts",
  "packages/persistent-state/package.json", "packages/persistent-state/.size-limit.js",
  "packages/persistent-state/tsup.config.ts", "eslint.config.mjs", "knip.json",
]
after = ["s1"]
rung = "senior-engineer"
done_check = "Gates format, knip, typecheck, lint, unit, build and package pass; the tests named in AC-4, AC-9, AC-11, AC-16, AC-17 and AC-18 exist and pass; `grep -E \"from ['\\\"](react|next)\" packages/persistent-state/dist/index.js` finds nothing."
gates = ["format", "knip", "typecheck", "lint", "unit", "build", "package"]
verification = "review"
hold = true
pause_after = false
brief = """
Serves AC-2, AC-3, AC-4, AC-9, AC-11, AC-16, AC-17, AC-18, AC-20. Implement the core of spec.md "Public API" and
"Behavior" without schema, version, migrate, Web Storage expiry (s3), consent or cross-tab sync (s4); leave clean seams
for them in the read and write pipelines.

- `persistentState(key, options)` returning the definition object (get, set, reset, subscribe, isPersistent, key,
  storage, defaultValue) with the option types of the spec, cookie-only options typed `never` for Web Storage.
- One shared record per `storage:fullKey` on globalThis (value, listeners, timer, persistent flag), same-tab sync,
  `namespace`.
- Drivers: Web Storage and cookies through `document.cookie`, with js-cookie 3's name and value encoding (spec.md
  "Stored format"; js-cookie's converters are short, reimplement them, no dependency), tolerant reads of the raw,
  encoded and double-encoded names and of URI-encoded and double URI-encoded values, reset removing every variant.
  Default cookie attributes: path '/', sameSite 'lax', secure on https, expires 365 days; number expires means days.
- JSON by default for every value including strings, with the legacy raw-string rule (spec.md "Read pipeline" step 3);
  custom `serializer`.
- Lazy availability probe, in-memory fallback, `isPersistent`, cookie read-back verification, `PersistentStateError`
  with the codes used so far, default onError `console.warn` with a `[persistent-state]` prefix.
- Debounced writes flushed on `pagehide` and `visibilitychange` hidden; no `beforeunload`.
- Server behavior: get returns default, subscribe no-op, set and reset throw an Error naming readState and Server
  Actions.
- `readCookieState(def, cookies)` for a CookieSource or a Cookie header string; deprecated `getPersistentCookieItem`,
  `getPersistentCookieValue`, `PersistentCookieStore`, `StorageType` with 0.2.1 behavior.
- Delete the 0.2.1 sources and tests, the next-client-cookies devDependency, and every eslint-disable comment they
  carried. The old tests for tolerant cookie reads become fixtures: keep a copy of 0.2.1's `getPersistentCookieItem`
  in test/fixtures to prove new cookies stay readable by 0.2.1 (AC-18).
- Add `lint` (`eslint src test --max-warnings 0`) and `check:package` (publint, attw esm-only, size-limit, es-check
  per spec.md "Quality bars") scripts, the browserslist, eslint-plugin-compat on src and eslint-plugin-jsdoc requiring
  doc comments on every export and option property; write that JSDoc now. Size budgets for "core" and "core:
  tree-shaken to persistentState" at the measured size plus about 10%.
- Hold: this code deletes and rewrites visitors' stored data (reset, legacy reads). A reviewer checks every removal path
  and the legacy fixtures before it lands.
"""

[[step]]
id = "s3"
title = "Standard Schema validation, version and migrate, Web Storage expiry"
satisfies = ["AC-12", "AC-13", "AC-14"]
files = [
  "packages/persistent-state/src/core/*.ts", "packages/persistent-state/src/index.ts",
  "packages/persistent-state/test/*.test.ts", "packages/persistent-state/test/types/*",
  "packages/persistent-state/package.json", "packages/persistent-state/.size-limit.js",
]
after = ["s2"]
rung = "engineer"
done_check = "Gates format, knip, typecheck, lint, unit, build and package pass; the tests of AC-12, AC-13 and AC-14, including the zod 4 inference type test, exist and pass."
gates = ["format", "knip", "typecheck", "lint", "unit", "build", "package"]
verification = "review"
hold = true
pause_after = false
brief = """
Serves AC-12, AC-13, AC-14. Add steps 4 to 8 of spec.md "Read pipeline" and the envelope of "Stored format".

- Vendor the Standard Schema v1 types (`StandardSchemaV1`, its Result and Issue) in src/core; the spec's authors
  recommend copying them, and a type import from a package would make it a dependency. Export the type.
- `schema`: synchronous validation of every value read; issues -> default plus onError `invalid` with issues; a Promise
  result -> default plus `async-schema`. Infer T from the schema's output type; add zod 4 as a devDependency only for a
  type test under test/types checked by the package's typecheck script.
- Envelope `{"__ps":1,"v":…,"ver":…,"exp":…}` written only when `version` or Web Storage `expires` is set; plain values
  are version 0. `version` without `migrate` throws a TypeError in persistentState. Migration result validated, written
  back once in the browser; `migrate-failed` and `version-ahead` as specified, the newer item left untouched.
- Web Storage expiry: number is days, Date absolute, recomputed on every write; an expired value yields default and is
  removed in the browser.
- `readCookieState` runs the same pipeline without write-back.
- JSDoc for every new export and option. Raise size budgets if the entry grows; never trim code to fit.
- Hold: this is the data-migration path for stored user data; a reviewer checks the version, write-back and removal
  rules against the spec.
"""

[[step]]
id = "s4"
title = "Consent predicate and cross-tab sync"
satisfies = ["AC-9", "AC-15"]
files = [
  "packages/persistent-state/src/core/*.ts", "packages/persistent-state/src/index.ts",
  "packages/persistent-state/test/*.test.ts", "packages/persistent-state/.size-limit.js",
]
after = ["s3"]
rung = "engineer"
done_check = "Gates format, knip, typecheck, lint, unit, build and package pass; the AC-15 tests (spied storage, ConsentLayer-shaped object) and the reset-under-denied-consent case of AC-9 pass; unit tests cover storage events and BroadcastChannel messages in jsdom."
gates = ["format", "knip", "typecheck", "lint", "unit", "build", "package"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-9, AC-15 (AC-10 is proven in a real browser by s7). Implement spec.md "Consent" and "Cross-tab and same-tab
sync".

- `consent?: () => boolean`: while false, storage is neither read nor written, memory works, isPersistent false.
  Evaluated on first use, before every write, and by the exported `refreshConsent()`, which re-evaluates every
  definition used in the page: on a change to true, write the value set in memory this page, otherwise read storage and
  notify. Never delete stored items automatically; `reset()` always removes them.
- `sync` (default true): localStorage via `storage` events for the full key (and key null meaning clear), cookies via a
  BroadcastChannel named `persistent-state` carrying only the definition id, the receiver re-reading document.cookie;
  cookie definitions also re-read on visibilitychange to visible. sessionStorage and in-memory values are never
  synced. Guard BroadcastChannel's absence (jsdom, old runtimes) without throwing.
- A unit test drives consent from an object shaped like ConsentLayer's `analytics.consent` (`getConsent()` returning
  `{ preferences: boolean } | null`, `subscribe(listener)`), without importing consentlayer, using the wiring shown in
  spec.md "Consent".
- JSDoc for `refreshConsent` and the new options; raise size budgets if needed.
"""

[[step]]
id = "s5"
title = "/react entry: useStoredState, usePersistentState, CookieValuesProvider"
satisfies = ["AC-2", "AC-3", "AC-6", "AC-17", "AC-19", "AC-20"]
files = [
  "packages/persistent-state/src/react/index.ts", "packages/persistent-state/src/react/*.tsx",
  "packages/persistent-state/test/react*.test.tsx", "packages/persistent-state/tsup.config.ts",
  "packages/persistent-state/package.json", "packages/persistent-state/.size-limit.js", "knip.json",
]
after = ["s2"]
rung = "senior-engineer"
done_check = "Gates format, knip, typecheck, lint, unit, build and package pass; `head -c 13 packages/persistent-state/dist/react/index.js` prints `'use client';`; the AC-6, AC-17 and AC-19 tests pass; a renderToString test proves the server snapshot of Web Storage definitions is the default even when storage holds a value."
gates = ["format", "knip", "typecheck", "lint", "unit", "build", "package"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-3, AC-6, AC-17, AC-19, AC-20. Implement the `/react` entry of spec.md "Public API" and the hydration table of
"SSR and hydration".

- `useStoredState(def)` on useSyncExternalStore(def.subscribe, def.get, getServerSnapshot) returning
  `[value, setValue, { reset, isPersistent }]` with stable functions. getServerSnapshot: for Web Storage, always the
  default (this is bug 2 of 0.2.1: never read storage in getServerSnapshot); for cookies, the value decoded from the
  CookieValuesProvider context (cached per raw string for a stable snapshot), else the default. isPersistent is true
  during SSR and hydration.
- `CookieValuesProvider({ cookies: Record<string,string> | string })` (context). In development, warn once when a
  cookie definition renders on the server under a provider that does not hold its cookie name.
- `usePersistentState(key, initial, options)`: lazy initial, every persistentState option except default, deprecated
  aliases storageType and syncAcrossTabs.
- Build: tsup entry `react/index`, exports `./react`, `'use client'` prepended in onSuccess exactly as
  CL/packages/consentlayer/tsup.config.ts does, react kept external, a size budget, react as an optional peer
  (^18.3.0 || ^19.0.0). JSDoc on every export.
- Works without s3 and s4 (they only change the core's internals).
"""

[[step]]
id = "s6"
title = "/next entry: PersistentStateProvider and readState"
satisfies = ["AC-2", "AC-3", "AC-8", "AC-20"]
files = [
  "packages/persistent-state/src/next.tsx", "packages/persistent-state/test/next.test.tsx",
  "packages/persistent-state/tsup.config.ts", "packages/persistent-state/package.json",
  "packages/persistent-state/.size-limit.js", "eslint.config.mjs",
]
after = ["s5"]
rung = "engineer"
done_check = "Gates format, knip, typecheck, lint, unit, build and package pass; the AC-8 tests pass; `grep -c \"persistent-state/react\" packages/persistent-state/dist/next.js` is at least 1 (the client module is imported, not inlined)."
gates = ["format", "knip", "typecheck", "lint", "unit", "build", "package"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-3, AC-8, AC-20. Implement the `/next` entry of spec.md "Public API".

- `readState(def)`: `readCookieState(def, await cookies())` with cookies from next/headers; a non-cookie definition is
  a type error (add a type test).
- `PersistentStateProvider({ states, children })`: an async Server Component reading only the listed definitions'
  cookies, under every legacy name variant, and rendering CookieValuesProvider imported from
  `@nicolopadovan/persistent-state/react` (kept external in tsup so the 'use client' boundary survives).
- Tests mock next/headers and call the async component directly, asserting the props passed to CookieValuesProvider
  contain only the listed cookies.
- Build: tsup entry `next`, exports `./next`, next external, next as optional peer (^15.0.0 || ^16.0.0), a size budget,
  es-check and eslint-plugin-compat skip dist/next.js and src/next.tsx as server code. No 'use client' on this entry.
  JSDoc on every export, including the note that cookies() makes the route dynamic.
"""

[[step]]
id = "s7"
title = "Browser tests with Vitest browser mode and Playwright"
satisfies = ["AC-5", "AC-7", "AC-10", "AC-22"]
files = [
  "packages/persistent-state/vitest.browser.config.ts", "packages/persistent-state/test/browser/*.test.ts(x)",
  "packages/persistent-state/test/browser/frame.html", "packages/persistent-state/package.json", "knip.json",
]
after = ["s4", "s6"]
rung = "engineer"
done_check = "Gate browser passes and contains the tests of AC-5, AC-7 (hydration part) and AC-10; gates format, knip, typecheck, lint and unit still pass."
gates = ["format", "knip", "typecheck", "lint", "unit", "browser"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-5, AC-7, AC-10, AC-22. Copy CL/packages/consentlayer/vitest.browser.config.ts (Playwright provider, Chromium
headless) and add `test:browser` to the package.

- Real cookies: write and read through document.cookie, attributes respected, reset removing legacy name variants.
- Cross-tab: a same-origin iframe acts as the other tab; prove localStorage sync through storage events and cookie sync
  through BroadcastChannel, both on by default, both off with `sync: false`, and sessionStorage never synced.
- Hydration: renderToString (react-dom/server) a component using a localStorage and a sessionStorage definition while
  storage holds a non-default value, insert the HTML, hydrateRoot with an onRecoverableError spy and a console.error
  spy, assert neither fired and the stored value shows after hydration (AC-5). Same for a cookie definition inside
  CookieValuesProvider: the HTML already holds the stored value and nothing changes after hydration (AC-7).
- Add the Playwright and @vitest/browser-playwright devDependencies at CL's versions.
"""

[[step]]
id = "s8"
title = "Shipped AGENTS.md, package README and the 0.3.0 changeset"
satisfies = ["AC-21", "AC-28", "AC-24"]
files = [
  "packages/persistent-state/AGENTS.md", "packages/persistent-state/README.md",
  "packages/persistent-state/package.json", ".changeset/public-release.md",
]
after = ["s4", "s6"]
rung = "engineer"
done_check = "`cd packages/persistent-state && npm pack --dry-run` lists only dist/**, AGENTS.md, README.md, LICENSE and package.json; `pnpm changeset status` reports a minor bump to 0.3.0; gates format and package pass."
gates = ["format", "package"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-21, AC-28 and the changeset part of AC-24.

- packages/persistent-state/AGENTS.md, shipped in the tarball (`files: ["dist", "AGENTS.md"]`): open by saying it is
  for agents using the package and that contributors read the repository root AGENTS.md; then the rules listed in
  spec.md "Package layout" with short correct code, every fact checked against src. Link
  https://persistent-state.nicolopadovan.com/llms-full.txt.
- Package README in the style of CL/packages/consentlayer/README.md: what it is, install, a quick start with
  persistentState plus useStoredState plus the Next.js provider, the 0.x notice ("every 0.x minor may contain breaking
  changes"), links to the docs and llms-full.txt, the AI disclosure worded like CL/README.md.
- `.changeset/public-release.md`: minor bump, a changelog entry summarizing spec.md "Changes from 0.2.1 and migration",
  linking the migration page.
"""

[[step]]
id = "s9"
title = "Docs site skeleton: Astro Starlight, llms.txt, Pages workflow"
satisfies = ["AC-25"]
files = [
  "apps/docs/{package.json,astro.config.mjs,tsconfig.json}", "apps/docs/src/{content.config.ts,routeData.ts}",
  "apps/docs/src/styles/custom.css", "apps/docs/public/{CNAME,favicon.svg}", "apps/docs/src/content/docs/index.mdx",
  "apps/docs/src/pages/404.astro", ".github/workflows/docs.yml", "knip.json", "pnpm-lock.yaml",
]
after = ["s1"]
rung = "junior-engineer"
done_check = "`pnpm turbo run build --filter=docs` passes and apps/docs/dist contains index.html, llms.txt and llms-full.txt; apps/docs/public/CNAME is persistent-state.nicolopadovan.com; gates format, knip and typecheck pass."
gates = ["format", "knip", "typecheck", "build"]
verification = "gate"
hold = false
pause_after = false
brief = """
Serves AC-25. Copy CL/apps/docs's setup without the React integration, playground and banner components.

- astro.config.mjs: site https://persistent-state.nicolopadovan.com, title persistent-state, starlight-llms-txt with
  rawContent true excluding only the changelog, GitHub social and edit links to nicolopadovan/persistent-state,
  routeData.ts copied, and sidebar groups generated from directories (start/, guides/, reference/, internals/, help/)
  ordered by `sidebar.order`, so later steps add pages without editing the config.
- index.mdx: what the package is and for whom, the 0.x stability notice (AC-28), links to the other sections; in the
  Next.js-docs tone described in CL/AGENTS.md "Docs".
- .github/workflows/docs.yml copied from CL with the docs filter.
"""

[[step]]
id = "s10"
title = "Docs guides: getting started, choosing a storage, Next.js, schemas and migrations, consent"
satisfies = ["AC-29", "AC-25"]
files = [
  "apps/docs/src/content/docs/start/getting-started.mdx", "apps/docs/src/content/docs/guides/choosing-a-storage.md",
  "apps/docs/src/content/docs/guides/nextjs.md", "apps/docs/src/content/docs/guides/schemas-and-migrations.md",
  "apps/docs/src/content/docs/guides/consent.md",
]
after = ["s9", "s4", "s6"]
rung = "engineer"
done_check = "`pnpm turbo run build --filter=docs` passes and the five pages appear in apps/docs/dist and in llms-full.txt; every code sample uses only exports that exist in packages/persistent-state/src; gate format passes."
gates = ["format", "build"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-29 for these pages. Write them per spec.md "Docs plan", in the voice of CL's docs (read
CL/apps/docs/src/content/docs/start/installation.mdx and guides/consent-records.md as models): complete professional
sentences, technical, depth in <details>, package-manager tabs for installs. Verify every behavior against
packages/persistent-state/src; never describe what the code does not do.

- Getting started: requirements table (Node 22, React 18.3 or 19, Next 15 or 16, browsers from the browserslist),
  install, entry points, declare a key, use it, a Next.js quick example.
- Choosing a storage: the comparison of spec.md "Docs plan" with the hydration table of spec.md "SSR and hydration".
- Next.js App Router: PersistentStateProvider, readState, no flash, dynamic rendering, what 0.2.1's CookiesProvider
  cost, and that server writes arrive in 0.4.0.
- Schemas and migrations: Standard Schema with zod and valibot examples, version and migrate, expiry, the envelope.
- Consent: the predicate, refreshConsent, reset on withdrawal, the ConsentLayer wiring from spec.md "Consent". Never
  say a setup complies with a law; link https://consentlayer.nicolopadovan.com/guides/legal/ for that topic.
"""

[[step]]
id = "s11"
title = "Docs: API reference and how it works"
satisfies = ["AC-29", "AC-25"]
files = ["apps/docs/src/content/docs/reference/api.md", "apps/docs/src/content/docs/internals/*.md"]
after = ["s9", "s4", "s6"]
rung = "engineer"
done_check = "`pnpm turbo run build --filter=docs` passes; every export of the three entry points' src index files appears in reference/api.md with its signature; gate format passes."
gates = ["format", "build"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-29 for these pages. API reference in the shape of CL/apps/docs/src/content/docs/reference/api.md: a table of
entry points, then every export with signature, options (type, default, Required), return value and errors, including
the deprecated exports and the PersistentStateError codes. Internals pages (shared record and globalThis registry;
read and write pipelines; stored format and js-cookie-compatible cookie encoding; hydration snapshots; cross-tab
transports; debounce and flush on pagehide) in the style of CL/apps/docs/src/content/docs/internals/consent.md, naming
the source files. Every fact checked against packages/persistent-state/src.
"""

[[step]]
id = "s12"
title = "Docs: migrating, comparison, roadmap, changelog"
satisfies = ["AC-29", "AC-25"]
files = [
  "apps/docs/src/content/docs/help/migrating.md", "apps/docs/src/content/docs/help/comparison.md",
  "apps/docs/src/content/docs/help/roadmap.md", "apps/docs/src/content/docs/help/changelog.mdx",
  "apps/docs/src/components/Changelog.astro",
]
after = ["s9", "s6"]
rung = "engineer"
done_check = "`pnpm turbo run build --filter=docs` passes; the comparison page states the 2026-10-15 research date and every library version from spec.md; the roadmap table matches spec.md \"Roadmap\"; a case-insensitive grep of apps/docs for the private names supplied by the main session finds nothing; gate format passes."
gates = ["format", "build"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-29 for these pages.

- Migrating: from 0.2.x and from a vendored `@workspace/persistent-state` copy, generic, no project names: registry
  switch (remove the GitHub Packages scope line from .npmrc and the read token), import moves, provider removal,
  option renames and default changes, the table in spec.md "Changes from 0.2.1 and migration"; stored data needs no
  migration.
- Comparison: the facts in spec.md "Docs plan" with their date, a feature table, and a fair "when to choose another
  library" section.
- Roadmap: the spec.md table, each version linked to its milestone, in the style of
  CL/apps/docs/src/content/docs/guides/roadmap.md, no dates.
- Changelog: copy CL's Changelog.astro and changelog.mdx pointing at packages/persistent-state/CHANGELOG.md.
"""

[[step]]
id = "s13"
title = "apps/example-react: Vite with localStorage"
satisfies = ["AC-26"]
files = ["apps/example-react/**", "knip.json", "pnpm-lock.yaml"]
after = ["s5"]
rung = "junior-engineer"
done_check = "Gates typecheck, lint, build and knip pass including example-react; `pnpm --filter example-react dev` shows the value surviving a reload (checked by hand)."
gates = ["format", "knip", "typecheck", "lint", "build"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-26. A minimal Vite + React 19 app depending on the package with workspace:*: a definitions module, a
localStorage value validated with a zod schema and moved from version 1 to 2 by migrate, a sessionStorage value, a
reset button, and the isPersistent flag shown. Scripts build, dev, lint (`eslint . --max-warnings 0`), typecheck, as in
CL/apps/example-next/package.json.
"""

[[step]]
id = "s14"
title = "apps/example-next: App Router with cookie state rendered on the server"
satisfies = ["AC-26", "AC-7"]
files = ["apps/example-next/**", "knip.json", ".prettierignore", "pnpm-lock.yaml"]
after = ["s6"]
rung = "engineer"
done_check = "Gates typecheck, lint, build and knip pass including example-next; after `pnpm --filter example-next build && pnpm --filter example-next start`, `curl -s -H 'Cookie: theme=%22dark%22' http://localhost:3000/` returns HTML containing the dark theme marker; the browser console shows no hydration error (checked by hand); the server is stopped afterwards."
gates = ["format", "knip", "typecheck", "lint", "build"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-26 and the example part of AC-7. A Next.js 16 App Router app depending on the package with workspace:*:
a shared definitions module (no 'use client'), a cookie theme definition listed in PersistentStateProvider in the root
layout and read with readState in a Server Component, a client theme toggle using useStoredState, and a debounced
localStorage draft. Adjust the curl in done_check to the theme definition's actual cookie name and encoding. Scripts as
CL/apps/example-next/package.json.
"""

[[step]]
id = "s15"
title = "Community files, root README and agent instructions"
satisfies = ["AC-28", "AC-27"]
files = [
  "README.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "SUPPORT.md",
  ".github/CODEOWNERS", ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/*.yml", ".github/dependabot.yml",
]
after = ["s1"]
rung = "junior-engineer"
done_check = "Gate format passes; each file exists; README.md has the 0.x notice, the AI disclosure and the docs link; a case-insensitive grep for the private names supplied by the main session finds nothing in these files."
gates = ["format"]
verification = "gate"
hold = false
pause_after = false
brief = """
Serves AC-28 and part of AC-27. Copy and adapt CL's README.md, AGENTS.md, CLAUDE.md (`@AGENTS.md`), CONTRIBUTING.md,
CODE_OF_CONDUCT.md, SECURITY.md, SUPPORT.md, .github/pull_request_template.md, .github/ISSUE_TEMPLATE/* and
.github/dependabot.yml for persistent-state: replace consent-first rules with this package's rules (zero runtime
dependencies, no storage access before the consent predicate allows it, never read storage in getServerSnapshot,
never trim code for a size budget, a new entry point needs tsup entry, exports, size budget, docs page). SECURITY.md
examples: storage written while the consent predicate returns false, cookie injection through keys or values, a
cookie leaked to the client that PersistentStateProvider was not given. Add .github/CODEOWNERS with
`* @nicolopadovan`. Links point at nicolopadovan/persistent-state and persistent-state.nicolopadovan.com. The README
says every 0.x minor may break and carries CL's AI disclosure.
"""

[[step]]
id = "s16"
title = "CI workflow runnable under act"
satisfies = ["AC-23"]
files = [".github/workflows/ci.yml", ".actrc"]
after = ["s7", "s8", "s13", "s14"]
rung = "engineer"
done_check = "Gate ci passes: `act pull_request -j check`, `-j min-versions` and `-j secrets` with `-W .github/workflows/ci.yml` each succeed in Docker with the repository .actrc."
gates = ["ci"]
verification = "verify"
hold = false
pause_after = false
brief = """
Serves AC-23. Copy CL/.github/workflows/ci.yml and CL/.actrc.

- check: install, format:check, knip, turbo typecheck lint test build, Playwright chromium-headless-shell install,
  test:browser, check:package (filters use the package name).
- min-versions: override react and react-dom 18.3.0, @types/react and @types/react-dom 18.3.0, next 15.0.0; install
  without frozen lockfile; run the package typecheck and test.
- secrets: gitleaks over the full history.
- act needs Docker and runs unsandboxed; if the check job runs out of memory, report it instead of changing Docker's
  settings.
"""

[[step]]
id = "s17"
title = "Release workflow with trusted publishing, and the release notes"
satisfies = ["AC-24"]
files = [".github/workflows/publish-package.yml", "docs/publishing-and-releases.md", "package.json"]
after = ["s16"]
rung = "engineer"
done_check = "`.github/workflows/publish.yml` does not exist; publish-package.yml passes `actionlint` (run through `pnpm dlx` or mise, not installed in the repo); `pnpm changeset status` reports the minor bump; docs/publishing-and-releases.md covers every item of spec.md \"Release and versioning\"; gate format passes."
gates = ["format"]
verification = "review"
hold = true
pause_after = false
brief = """
Serves AC-24. Copy CL/.github/workflows/publish-package.yml and CL/docs/publishing-and-releases.md for this package:
PR title "Release persistent-state", commit message "chore: release persistent-state", the npm view check for
`@nicolopadovan/persistent-state@$version`, the npm environment, id-token write, `npm publish` from
packages/persistent-state (trusted publishing, provenance, no token), prerelease versions under `next`, and the
annotated tag `v$version` (named like the archived repository's v0.1.0 to v0.2.1). Publishing runs only from `main`;
there is no local publish script.

The notes cover one-time setup (fresh public repository, npm environment limited to `main` with Nico as reviewer, Actions allowed to open pull
requests, trusted publisher owner nicolopadovan / repository persistent-state / workflow publish-package.yml /
environment npm, Pages on GitHub Actions with the custom domain, the Cloudflare CNAME persistent-state ->
nicolopadovan.github.io with the proxy off), planning versions with milestones, release steps, prereleases, and
failure checks.

Hold: publishing credentials and the release path. Never run the workflow, publish, or push from this step. Note in
the report that 0.2.1 is not on npm, so main must hold the 0.3.0 changeset before or with this workflow; the npm
environment gate is the backstop.
"""

[[step]]
id = "s18"
title = "Final audit: private names, every gate, CI under act"
satisfies = ["AC-27", "AC-1", "AC-23"]
files = []
after = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13", "s14", "s15", "s16", "s17"]
rung = "junior-engineer"
done_check = "A case-insensitive `git grep` over tracked files for the private names and old ticket tags supplied by the main session finds nothing; gates format, knip, typecheck, lint, unit, build, browser, package and ci all pass on the branch head."
gates = ["format", "knip", "typecheck", "lint", "unit", "build", "browser", "package", "ci"]
verification = "gate"
hold = false
pause_after = true
brief = """
Serves AC-27 and re-confirms AC-1 and AC-23 on the finished branch. The main session supplies the list of private
project names and the old internal ticket tag; never write them into a tracked file. Fix nothing beyond removing a
leftover name; report anything else as a finding. Pause afterwards so Nico reviews the branch before it goes further.
"""

[[step]]
id = "s19"
title = "GitHub milestones and issues for the roadmap"
satisfies = ["AC-30"]
files = []
after = ["s12", "s18"]
rung = "junior-engineer"
done_check = "`gh api repos/nicolopadovan/persistent-state/milestones --paginate` lists 0.3.0 and every roadmap version; each has an issue per item from spec.md \"Roadmap\"; 0.3.0's issues cover the three bugs and each 0.3.0 feature."
gates = []
verification = "verify"
hold = true
pause_after = false
brief = """
Serves AC-30. Only after Nico approves creating them. Create one milestone per version in spec.md "Roadmap" plus 0.3.0,
without due dates, and one issue per item, labelled as ConsentLayer's issues are; issue bodies describe the item
generically with no private project names. Link the roadmap page's version entries to the milestones if the URLs
differ from what s12 assumed (that edit is a separate docs commit).
"""

[[step]]
id = "s20"
title = "Repository settings, rulesets, npm environment and Pages"
satisfies = ["AC-31"]
files = []
after = ["s18"]
rung = "engineer"
done_check = "`gh api repos/nicolopadovan/persistent-state` shows squash-only merges with PR title and body, delete branch on merge, discussions on; `gh api repos/nicolopadovan/persistent-state/rulesets` shows the main and v* tag rulesets matching spec.md; the npm environment exists with Nico as required reviewer; Pages builds from Actions on persistent-state.nicolopadovan.com with HTTPS enforced; private vulnerability reporting is on."
gates = []
verification = "review"
hold = true
pause_after = true
brief = """
Serves AC-31. Only after Nico has made the repository public (rulesets, environments and Pages need it on his plan;
the rulesets API currently answers 403) and has approved these changes. Reproduce ConsentLayer's settings, read with
`gh api repos/nicolopadovan/consentlayer` and `.../rulesets/<id>`: main ruleset (deletion, non_fast_forward,
required_linear_history, pull_request with squash only, required checks check, min-versions, secrets, admin bypass for
pull requests); tag ruleset on refs/tags/v* (deletion, non_fast_forward, update; admin bypass always); repository
merge settings; Actions allowed to create and approve pull requests; the npm environment; Pages source GitHub Actions
with the custom domain. Report each change made.
"""
```

## Needs Nico

These cannot be done by an agent, or need his explicit approval first:

1. **Going public (decided: fresh repository).** Rename the private repository to keep it as the archive, create a new
   public `nicolopadovan/persistent-state`, and push one initial commit with the merged tree. Agents do this only on
   his go-ahead at release time.
2. **Cloudflare DNS:** add a `CNAME` record `persistent-state` → `nicolopadovan.github.io`, proxy off (DNS only).
   `nicolopadovan.com` is already used for ConsentLayer's Pages domain; if it is not yet verified in the GitHub account
   settings → Pages, add the TXT record GitHub shows.
3. **Approve creating the public repository** (item 1) when the branch is merged and he is ready to release. This unlocks s20, the docs
   deploy and npm provenance.
4. **Approve s19 and s20**, which change state on GitHub.
5. **Claim the npm name and set up trusted publishing**, in his own terminal (his npm 2FA is a passkey, so no `--otp`
   and no agent shell):
   1. `npm login`.
   2. In an empty directory, a `package.json` with `"name": "@nicolopadovan/persistent-state"`, `"version": "0.0.0"`,
      `"license": "MIT"`, `"description": "Reserved. The first public release is 0.3.0."`, the `repository` field, and a
      one-line README. Then `npm publish --access public` (scoped packages are private by default). If npm's staged
      publishing holds it for review, approve it on npmjs.com.
   3. On npmjs.com → the package → Settings → Trusted publishing → GitHub Actions: owner `nicolopadovan`, repository
      `persistent-state`, workflow `publish-package.yml`, environment `npm`.
   4. After 0.3.0 is out: `npm deprecate @nicolopadovan/persistent-state@0.0.0 "Placeholder; use 0.3.0 or later."`
6. **Release 0.3.0:** merge the "Release persistent-state" pull request and say "publish"; the `npm` environment
   approval then follows the existing publish-on-request agreement.
7. **Later, after his apps have moved to npm:** delete the GitHub Packages versions of
   `@nicolopadovan/persistent-state` (0.1.0 to 0.2.1) in the repository's Packages settings. Deleting them earlier
   breaks every app that still installs from GitHub Packages.

## Out of scope for this branch

- Migrating Nico's own apps from the GitHub Packages release or vendored copies to the npm package. It is a separate
  step after 0.3.0 is published, one app at a time, following the migration page.
- Every roadmap item from 0.4.0 on.
- Publishing, pushing, and any change to GitHub or npm settings outside s19 and s20.
