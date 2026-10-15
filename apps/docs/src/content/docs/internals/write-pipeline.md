---
title: The write pipeline
description: What set() and reset() do, how debounced writes are flushed when the page is hidden, and how write failures are reported.
sidebar:
  order: 3
---

This page explains what happens between a call to `set()` and the bytes in storage: the steps of the write pipeline, how
`debounceMs` delays a write and when a delayed write is flushed, and how a failed write is reported. It is for readers
who need the exact behavior, for example to decide whether to debounce a value that changes on every keystroke, or to
understand why `isPersistent()` changed. Reading is covered in [The read pipeline](/internals/read-pipeline/).

The pipeline is in `src/core/state.ts` (`set`, `write`, `store`, `remove`, `flush` and `flushOnHide`). The text it writes
is described in [Stored format](/internals/stored-format/).

## The steps of `set()`

`set(next)` runs these steps in order. A call on the server throws, because there is no storage to write.

1. **Resolve the value.** The first `set()` in a page loads the [shared record](/internals/shared-record/) so that an
   updater function receives the stored value. `next` is the new value, or the result of `next(previous)`. A value of
   `undefined` is the same as `reset()`. A value that is `Object.is`-equal to the current one does nothing, so setting a
   new object with the same contents writes, and setting the same object does not.
2. **Update memory and notify.** The record takes the value, is marked as unsaved, and every subscriber is notified
   synchronously. Components re-render before anything is written.
3. **Cancel the pending write.** A write that was waiting for its debounce is replaced by this one.
4. **Write now, or later.** With `debounceMs` of `0`, the write runs at once. With a larger value, it is scheduled; see
   [Debounce and flush](#debounce-and-flush).
5. **Write.** The `consent` predicate is evaluated, and storage availability is checked. If consent is withheld or
   storage cannot be used, nothing is written, and `isPersistent()` becomes `false`. Otherwise the value is stored.
6. **Store.** The value is serialized with JSON or the `serializer`, wrapped in an envelope when `version` is set or a
   Web Storage `expires` is set, and written. A cookie is written to `document.cookie` and then read back to confirm it
   was accepted.
7. **Report the outcome.** A successful write clears the unsaved mark and sets `isPersistent()` to `true`; a failed one
   sets it to `false`. Subscribers are notified when `isPersistent()` changed.
8. **Announce a cookie write.** After a successful cookie write, a message is posted on the `BroadcastChannel` so other
   tabs re-read. Web Storage writes need no message, because the browser fires `storage` events in the other tabs.

## Write failures

A write that fails never throws. It is reported to `onError` as `write-failed`, the value stays in memory, and
`isPersistent()` is `false` until a later write succeeds. A write fails when:

- `setItem` throws, for example because the storage is full (`QuotaExceededError`);
- a cookie does not read back from `document.cookie`, because the browser blocked it or the cookie is over its size
  limit;
- the value cannot be serialized, for example a `serializer.serialize` that throws, or a value `JSON.stringify` rejects.

The error carries a `cause` when something threw; a cookie that does not read back has no underlying error. A `set()`
that finds storage unavailable reports `unavailable` when the record loads, as described in
[The read pipeline](/internals/read-pipeline/).

## `reset()`

`reset()` loads the record if needed, cancels a pending write, sets the value to the default, clears the unsaved mark,
notifies subscribers and removes the stored item. A cookie is removed under every name an older version may have written
it, using the definition's `path`, `domain`, `secure` and `sameSite`, and a message is posted on the
`BroadcastChannel`. A Web Storage item is removed with `removeItem`. Removal does not evaluate the `consent` predicate:
a visitor who withdraws consent can have the stored item deleted, while the predicate returns `false`. It notifies
subscribers even when the value was already the default.

## Debounce and flush

With `debounceMs` greater than `0`, step 4 does not write. It stores the write as the record's `pendingWrite` and starts a
timer for `debounceMs` milliseconds. A newer `set()` cancels both and starts again, so a value that changes on every
keystroke is written once, `debounceMs` after the last change.

While a write is pending:

- memory and subscribers already hold the new value;
- `isPersistent()` keeps its previous value, because only the write changes it;
- the `consent` predicate is evaluated when the write runs, not when `set()` was called;
- changes made by other tabs are ignored for this record, so they cannot overwrite the pending value;
- `reset()` discards the write.

The first debounced `set()` of a page installs two listeners, once per page:

| Listener                         | Fires when                          | Does                                                |
| -------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `pagehide` on `window`           | The page is navigated away from.    | Writes every pending write of every record at once. |
| `visibilitychange` on `document` | The tab's visibility state changes. | Does the same when the state is `hidden`.           |

Flushing writes each pending value immediately, through the same `write` step as any other write. There is no
`beforeunload` or `unload` listener, so using persistent-state does not make a page ineligible for the browser's
back/forward cache.

<details>
<summary>What is not flushed</summary>

A pending write is lost if the page is destroyed without a `pagehide` or `visibilitychange` to `hidden`, for example when
the browser process is killed. For values that must not be lost, leave `debounceMs` at `0`.

</details>
