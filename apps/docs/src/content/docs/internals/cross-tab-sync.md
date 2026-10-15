---
title: Cross-tab sync
description: How a change in one tab reaches the others, through storage events and a BroadcastChannel, and when a tab does not follow.
sidebar:
  order: 6
---

This page explains how a value changed in one tab reaches the other tabs of the same browser: the transport each storage
uses, what a message carries and the conditions under which a tab re-reads. It is for readers who need the exact
behavior, for example to understand why a `sessionStorage` value never syncs, or what `sync: false` stops.

The listeners, the channel and the re-read conditions are in `src/core/state.ts` (`onStorage`, `onVisible`, `channel` and
`reread`).

## In one tab

Every definition with the same storage and key shares one [record](/internals/shared-record/), so a `set()` through any
of them notifies the subscribers of all of them, synchronously, in the same tab. No transport is involved.

## Between tabs

A tab learns about a change made elsewhere in one of three ways.

| Storage          | Transport                                                 | Trigger                                     |
| ---------------- | --------------------------------------------------------- | ------------------------------------------- |
| `localStorage`   | The browser's `storage` event on `window`.                | Another tab calls `setItem`, `removeItem`.  |
| `cookie`         | A `BroadcastChannel` named `persistent-state`.            | Another tab writes or removes the cookie.   |
| `cookie`         | The `visibilitychange` event on `document`, to `visible`. | The tab becomes visible again.              |
| `sessionStorage` | None.                                                     | A `sessionStorage` item belongs to one tab. |

The writing tab does not receive its own `storage` event or channel message; it already holds the new value.

### The `storage` event

The `storage` listener ignores events for any storage other than `localStorage`. An event with a `key` finds the record
with the id `localStorage:<key>`. An event with a `null` key, which the browser fires when another tab calls
`localStorage.clear()`, finds every `localStorage` record. The record's [owner](/internals/shared-record/#several-definitions-of-one-key)
then re-reads it.

### The `BroadcastChannel`

Not every supported browser fires an event when another tab changes a cookie, so persistent-state announces its own
cookie writes. After a cookie is written successfully, and after one is removed, the tab posts the record's id, for
example `cookie:theme`, on the channel. The message carries no value and no cookie attributes: a receiving tab finds the
record with that id and re-reads `document.cookie` itself, through the same [read pipeline](/internals/read-pipeline/) as
any other read. It applies its own `consent`, `schema` and `migrate`, so a tab never takes a value it would not accept
from storage.

The channel is opened when the first cookie record of a page is created. A browser without `BroadcastChannel`, or one that
throws when opening it, leaves the channel unavailable for the page. Cookie sync then relies on the `visibilitychange`
event alone.

Messages are posted whether or not the posting definition has `sync: false`.

### Becoming visible

When a tab becomes `visible`, every cookie record in it is re-read. This catches changes made while the tab was in the
background, for example a cookie set by a `Set-Cookie` header on a response, and covers browsers without
`BroadcastChannel`. It applies only to cookies: Web Storage changes are always delivered by the `storage`
event.

## When a tab re-reads

A message, a `storage` event or the tab becoming visible finds a record, and the owner re-reads it only when all of these
hold:

- the owner's `sync` is not `false`, and its storage is not `sessionStorage`;
- the record has been loaded, because a record nobody has read yet has nothing to refresh;
- the record is persistent, so a value that lives only in memory, because storage is unavailable or consent is withheld,
  is never replaced by what other tabs wrote;
- no write is pending, so a value waiting for its debounce is not overwritten, see
  [Debounce and flush](/internals/write-pipeline/#debounce-and-flush);
- `consent` returns a truthy value, or is not set.

The re-read runs the whole read pipeline. The record's subscribers are notified only when the value, or whether it is
persistent, changed. A failure, such as a value another tab wrote that fails the `schema`, is reported to `onError` and the
record takes the default, as for any read.

## What `sync: false` does

`sync: false` stops one definition's tab from receiving updates: `storage` events and channel messages find the record,
and the re-read conditions fail. It does not change what the tab writes. A tab with `sync: false` still writes to storage,
still fires `storage` events in other tabs and still posts channel messages, so other tabs with `sync` left on follow it.
`sessionStorage` is never synced, whatever `sync` says.

<details>
<summary>Why the message carries only an id</summary>

A value in a message would be a second copy of the data, one that bypasses the receiving tab's `consent` check, its
`schema` and its `migrate`. An id keeps storage the single source of truth, and every tab validates what it reads in the
same way.

</details>
