---
title: The shared record
description: How every definition with the same storage and key shares one in-memory record, and why the registry lives on globalThis.
sidebar:
  order: 1
---

This page explains where the state of a definition lives while the page is open: the shared record, the registry that
holds it and the page-level listeners that keep it current. It is for readers who need the exact behavior, for example
to understand why two definitions of one key stay in sync, or why a hot reload does not lose pending writes. Reading and
writing storage are covered in [The read pipeline](/internals/read-pipeline/) and
[The write pipeline](/internals/write-pipeline/).

The record and the registry are in `src/core/state.ts`. The definition object they serve is created by
`persistentState()` and typed in `src/core/types.ts`.

## What a definition holds

A definition returned by `persistentState()` holds no value and no listener of its own. It is a set of closures over the
options you passed: the full key, the storage, the schema, the serializer and the rest. Declaring a definition therefore
does not touch storage, does not register a listener and does not create a record. Its only effects are the validation of
the options, which throws a `TypeError` for an empty key, an invalid `expires` or `version`, and a `version` without
`migrate` (or the reverse), and the registration for server reads described next.

For server reads, `persistentState()` also registers the definition in a module-level `WeakMap` (`readers`) that holds a
function reading the definition's cookie from any source. `readCookieState()` looks the definition up there, which is why
it throws a `TypeError` for an object that was not created by `persistentState()`.

## The registry

The first browser call that needs state creates a record and stores it in the registry, an object kept on
`globalThis.__persistentState`:

| Field       | Holds                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `records`   | A `Map` from a record id to its record.                                                            |
| `available` | The result of the availability probe for each storage, so each storage is probed once per page.    |
| `flushing`  | Whether the `pagehide` and `visibilitychange` listeners that flush debounced writes are installed. |
| `channel`   | The `BroadcastChannel` used for cookie sync, or `null` when the browser has none.                  |

The registry is on `globalThis` rather than in a module variable so that a module evaluated again keeps the same state.
Hot module reloading evaluates the module that declares a definition again; the new definition finds the records,
timers, listeners and probe results of the old one instead of starting over, and a write that was waiting for its
debounce still flushes.

## The record

A record is created lazily, on the first `get()`, `set()`, `reset()`, `subscribe()` or `isPersistent()` of any definition
with its id, in the browser. The id is `` `${storage}:${fullKey}` ``, where the full key includes the namespace. The
cookie `theme` and the `localStorage` item `theme` are therefore different records, and `{ namespace: 'app' }` with the
key `theme` is `app:theme`.

| Field                   | Meaning                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `storage`               | The storage the record belongs to.                                                                  |
| `value`                 | The current value, starting at the definition's default.                                            |
| `loaded`                | Whether the first read has happened. The first `get()` loads the record.                            |
| `persistent`            | What `isPersistent()` returns. `false` while the value lives only in memory.                        |
| `granted`               | The last result of the `consent` predicate. Compared by `refreshConsent()`.                         |
| `unsaved`               | Whether the value was set in memory and has not reached storage yet.                                |
| `owner`                 | The definition that last touched the record. It handles consent refreshes and cross-tab re-reads.   |
| `listeners`             | The functions passed to `subscribe()`.                                                              |
| `timer`, `pendingWrite` | The debounce timer and the write it will run. See [The write pipeline](/internals/write-pipeline/). |

Creating the first record of a page also installs the page-level listeners: a `storage` listener on `window` and a
`visibilitychange` listener on `document`. The first cookie record also opens the `BroadcastChannel`. They are installed
once. See [Cross-tab sync](/internals/cross-tab-sync/).

On the server there is no `document`, so no record is ever created: `get()` returns the default, `subscribe()` returns a
no-op, `isPersistent()` returns `false`, and `set()` and `reset()` throw.

## Several definitions of one key

Every definition with the same storage and full key shares one record, so they share one value, one set of listeners,
one debounce timer and one persistence flag. A `set()` through any of them notifies the subscribers of all of them, and
two components that call `useStoredState()` with different definitions of one key re-render together.

The options of each definition still apply to its own reads and writes: a write through a definition uses that
definition's serializer, version, expiry and cookie attributes. Two things belong to the record instead, and follow the
`owner`, the definition that touched the record last: the consent predicate that `refreshConsent()` evaluates, and the
options (`sync`, `consent`, the schema and the rest) that a cross-tab re-read uses. Declare each key once, and import the
definition where it is needed, so the two never differ.

<details>
<summary>Why the first <code>get()</code> reads, and what <code>isPersistent()</code> triggers</summary>

`get()` and `isPersistent()` both load the record, so asking whether a value is persistent reads storage if nothing has
read it yet. A first `set()` or `reset()` also calls `get()` before it changes anything, so that an updater function
receives the stored value and not the default, and so that read failures such as `unavailable` or `version-ahead` are
reported before the write.

</details>
