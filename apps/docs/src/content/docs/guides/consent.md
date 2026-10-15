---
title: Consent
description: Gate reading and writing of stored state behind a consent predicate, re-evaluate it with refreshConsent(), and wire it to a consent manager.
sidebar:
  order: 4
---

This page covers the `consent` option: what a definition does while consent is missing, when persistent-state evaluates
it, how to react when a visitor changes their choice, and how to connect it to a consent manager such as ConsentLayer.

persistent-state has no consent logic of its own. You give a definition a function that answers whether storing its value
is allowed right now, and persistent-state asks it at the moments listed below. Whether a stored value needs consent, and
what counts as valid consent, depends on its purpose and on the law that applies to you. Nothing on this page states that
a setup complies with a law; see the
[legal notice of ConsentLayer](https://consentlayer.nicolopadovan.com/guides/legal/) for how to approach that question.

## The consent predicate

The `consent` option takes a function that returns `true` when the value may be stored.

```ts title="lib/state.ts"
import { persistentState } from '@nicolopadovan/persistent-state'

export const theme = persistentState('theme', {
  default: 'system',
  storage: 'cookie',
  consent: () => preferencesAllowed(),
})
```

A definition without `consent` always reads and writes. The function must return a boolean, and any falsy value
counts as no consent. A function that throws also counts as no consent, and the error is logged with `console.error`.
`preferencesAllowed()` stands for your own check.

While `consent` returns `false`:

| Operation       | Behavior                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reading         | Storage is not read. `get()` returns the value in memory, which starts as the `default`.                               |
| Writing         | Storage is not written. `set()` still updates the value in memory and notifies subscribers, without calling `onError`. |
| `isPersistent`  | `false`.                                                                                                               |
| Synchronization | The value is not synced between tabs.                                                                                  |
| `reset()`       | Removes the stored item and sets the default. See [Withdraw consent](#withdraw-consent).                               |

The value that lives in memory is lost when the page closes. It is written only after consent is given, as described in
[Grant consent later](#grant-consent-later).

## When the predicate runs

persistent-state evaluates `consent` at these moments:

- The first time a definition is used in a page, before it reads storage.
- Before every write, including when a debounced write flushes, so a withdrawal that happens between `set()` and the
  flush prevents the write.
- When a change from another tab is applied.
- In `refreshConsent()`.

It does not run on a timer, and it does not subscribe to your consent manager. When the visitor's choice changes, tell
persistent-state with `refreshConsent()`.

## Grant consent later

`refreshConsent()` re-evaluates `consent` for every definition that the page has already used and applies the change:

```ts
import { refreshConsent } from '@nicolopadovan/persistent-state'

refreshConsent()
```

| Consent was | Consent is now | Result                                                                                                                                |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `false`     | `true`         | A value that was set in memory is written. Otherwise the stored value is read and subscribers are notified. Synchronization turns on. |
| `true`      | `false`        | The value stays in memory and `isPersistent` becomes `false`. The stored item is kept. Synchronization turns off.                     |
| Unchanged   | Unchanged      | Nothing happens.                                                                                                                      |

Definitions that the page has not used yet are not affected: they evaluate `consent` on first use.

## Withdraw consent

Withdrawing consent stops persistent-state from reading and writing, and it does nothing else. It never deletes a stored
item by itself. A consent manager that has not loaded yet can report `false` for a moment, and removing the value of
every returning visitor in that moment would be wrong. Removing the item is your decision, and `reset()` is how you make
it:

```ts
theme.reset()
```

`reset()` removes the stored item, including every older name that a cookie may have been written under, using the
definition's `path` and `domain`. It works while `consent` is `false`, sets the value in memory to the default, and
notifies subscribers.

`reset()` cannot reach a cookie of the same name that was set on a different path or on a different domain. If an older
version of your site, or another application, set such a cookie, it survives and a later read can find it. Expire those
cookies with the `path` and `domain` they were set with.

## The server does not evaluate the predicate

`readState()`, `PersistentStateProvider` and `readCookieState()` read cookies on the server, where there is no consent
manager to ask. They do not call `consent`. A cookie exists only if it was written while consent was given, so the server
reads it whenever it is present.

This matters for a visitor who withdrew consent and whose cookie was not removed with `reset()`: the server still
renders the stored value. After hydration, the client evaluates `consent`, finds that it is `false`, and shows the
default. Call `reset()` when a visitor withdraws, so that the server never sees the cookie again.

## Use it with ConsentLayer

[ConsentLayer](https://consentlayer.nicolopadovan.com) exposes the visitor's choice as `analytics.consent.getConsent()`,
which returns the consent state or `null`, and `analytics.consent.subscribe()`, which calls its listener with
`{ consent }` after every change. See [the consent events](https://consentlayer.nicolopadovan.com/guides/events/#consent).
Use the `preferences` category for UI state such as a theme.

```ts title="lib/state.ts"
import { persistentState, refreshConsent } from '@nicolopadovan/persistent-state'
import { analytics } from '@/lib/analytics'

export const theme = persistentState('theme', {
  default: 'system',
  storage: 'cookie',
  consent: () => analytics.consent.getConsent()?.preferences === true,
})

analytics.consent.subscribe(({ consent }) => {
  if (!consent?.preferences) theme.reset()
  refreshConsent()
})
```

The listener resets the definition when `preferences` is not granted, and then re-evaluates every definition so that a
grant is applied and a withdrawal stops writes.

`getConsent()` returns the visitor's choice. Before a choice it returns the categories that the visitor's region grants by
default, or `null` when it grants none; see [the regions guide](https://consentlayer.nicolopadovan.com/guides/regions/).
The predicate follows whatever it returns, so the behavior in a region follows the defaults that you configure there.
Pick the category that matches the purpose of each value; this guide does not decide which purposes need consent.

ConsentLayer also notifies subscribers when it restores a stored choice while it bootstraps, so the listener runs again
once the choice of a returning visitor is known.

<details>
<summary>The same wiring for any consent manager</summary>

The predicate is a plain function, so any source of consent works: a cookie of your own, a global that your consent
banner sets, or a call to your consent platform. Do two things:

1. Return `true` from `consent` only when the value may be stored.
2. Call `refreshConsent()` whenever the choice changes, and call `reset()` on the definitions whose value you must remove
   when it is withdrawn.

```ts
window.addEventListener('consent-changed', () => {
  if (!preferencesAllowed()) theme.reset()
  refreshConsent()
})
```

</details>
