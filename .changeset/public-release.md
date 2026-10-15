---
'@nicolopadovan/persistent-state': minor
---

First public release on npm, continuing from 0.2.1, which was published privately on GitHub Packages. Every 0.x minor may contain breaking changes, so pin the version you depend on. To upgrade from 0.2.x, follow [Migrating](https://persistent-state.nicolopadovan.com/help/migrating/); values already stored need no migration.

Fixed:

- Strings such as `"42"` or `"true"` are stored as JSON and read back as strings, not as a number or a boolean. Raw strings written by 0.2.1 still read as strings when `default` is a string.
- `localStorage` and `sessionStorage` state no longer causes a hydration mismatch. The server snapshot is always the default, and the stored value follows right after hydration.
- No provider and no `next-client-cookies` are needed to use the package.

Added:

- `persistentState()` declares a key once with its type, storage and options. `useStoredState()` from `/react` uses it in components, `readState()` and `PersistentStateProvider` from `/next` read cookie state on the server, and `readCookieState()` and `CookieValuesProvider` do the same in other runtimes and frameworks.
- `reset()`, an in-memory fallback when storage is unavailable, and an `isPersistent` flag.
- Cross-tab sync, on by default and including cookies; pass `sync: false` to turn it off.
- Validation with any Standard Schema through `schema`, `version` and `migrate`, and `expires` for `localStorage` and `sessionStorage`.
- An optional `consent` predicate and `refreshConsent()`. While `consent` returns `false`, storage is neither read nor written, and nothing is deleted automatically.

Breaking:

- Install from npm. Remove the `@nicolopadovan:registry=https://npm.pkg.github.com` line and the read token from `.npmrc`.
- `usePersistentState` moved from the root entry to `@nicolopadovan/persistent-state/react` and returns a third element, `{ reset, isPersistent }`.
- Removed `PersistentStateCookiesProvider` and the `next-client-cookies` peer dependency. To render cookie state on the server in Next.js, use `PersistentStateProvider` from `/next` with `states`.
- Removed `useStorage`, `StorageAPI`, `StorageOptions`, `CookieStorageOptions` and `NonCookieStorageOptions`. Use `persistentState()` and its `get`, `set` and `reset`.
- `sync` defaults to `true`, where `syncAcrossTabs` defaulted to `false`. Pass `sync: false` for the old behavior.
- A cookie's `expires` defaults to 365 days, where a cookie without `expires` was a session cookie. `expires: 0` writes a session cookie. For `localStorage` and `sessionStorage`, `expires: 0` means no expiry.
- A `null` stored by 0.2.1 now reads as `null`, where 0.2.1 used the default, unless `default` is a string.
- The legacy rule for raw strings follows the type of `default`. A state whose default is not a string, such as `null` typed `string | null`, reads a raw 0.2.1 value that parses as JSON (`42`, `true`) as that number or boolean, and a `schema` reports it as `invalid`. Save the value again, or give the state a string `default`.

Deprecated, removed in 1.0.0: `getPersistentCookieItem`, `getPersistentCookieValue`, `PersistentCookieStore`, `StorageType`, and the `storageType` and `syncAcrossTabs` options of `usePersistentState`.
