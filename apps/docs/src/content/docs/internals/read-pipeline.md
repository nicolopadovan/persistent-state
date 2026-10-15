---
title: The read pipeline
description: The steps that turn stored text into a value, in order, and what each failure yields.
sidebar:
  order: 2
---

This page explains how persistent-state turns what a storage holds into a value: the nine steps of the read pipeline,
their order and what each failure yields. It is for readers who need the exact behavior, for example to debug a stored
value that reads as the default, or to design a `version` and a `migrate`. Writing is covered in
[The write pipeline](/internals/write-pipeline/), and the text itself in [Stored format](/internals/stored-format/).

The pipeline is in `src/core/state.ts` (`read`, `readStorage`, `readCookie`, `decode` and `resolve`). The envelope helpers
are in `src/core/envelope.ts` and the cookie helpers in `src/core/cookie.ts`.

## When it runs

The pipeline runs:

- on the first `get()` in a page, for a Web Storage or cookie definition;
- on a cross-tab update, as described in [Cross-tab sync](/internals/cross-tab-sync/);
- after `refreshConsent()` finds that consent was granted and there is no unsaved in-memory value;
- in `readCookieState()` and `readState()`, on the server, with the cookies of the request.

Every other `get()` returns the value cached in the [shared record](/internals/shared-record/).

## The steps

| Step | Name          | What happens                                                                                                                                                                                                               | On failure                                                                |
| ---- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | Consent       | In the browser, when `consent` returns `false`, storage is not read. The value is the default, or the value set in memory this page.                                                                                       | Not an error; `isPersistent()` is `false`.                                |
| 2    | Raw text      | Web Storage: `getItem(fullKey)`. Cookies: the first present name among the [cookie names](#cookie-names). No text means the default. Storage that cannot be used yields the default.                                       | `unavailable`, the default.                                               |
| 3    | Decode        | With a `serializer`, `deserialize(text)`. Otherwise `JSON.parse(text)`, with the [legacy rule for raw strings](#the-legacy-rule).                                                                                          | `parse-failed` when `deserialize` throws.                                 |
| 4    | Envelope      | A parsed object with `__ps: 1` is an [envelope](/internals/stored-format/#the-envelope). An object whose `__ps` is anything else was written by newer code. Anything else is a plain value with version `0` and no expiry. | `version-ahead`, or `parse-failed` when malformed.                        |
| 5    | Version ahead | A stored version above `version` yields the default and leaves the item untouched.                                                                                                                                         | `version-ahead`, the default.                                             |
| 6    | Expiry        | A Web Storage envelope past `exp` yields the default, and the item is removed. The `exp` of a cookie is ignored; the browser expires cookies.                                                                              | None.                                                                     |
| 7    | Migration     | A stored version below `version` goes through `migrate(value, storedVersion)`.                                                                                                                                             | `migrate-failed`, the default.                                            |
| 8    | Validation    | With a `schema`, `schema['~standard'].validate(value)`. The schema's output is the value.                                                                                                                                  | `invalid` or `async-schema`, the default.                                 |
| 9    | Write-back    | In the browser, a migrated value is written back once, so migration runs once per stored item.                                                                                                                             | `write-failed`; the value is still used, and `isPersistent()` is `false`. |

The order matters in two places.

**Version ahead is checked before expiry.** An item written by a newer version of your code is never removed by older
code, even when it is past its `exp`: step 5 returns the default before step 6 can remove the item. Only an item of the
current version, or an older one, expires.

**A foreign `__ps` envelope reads as version-ahead.** Step 4 treats any object whose `__ps` property is not the number
`1` as written in a newer envelope format, such as `{"__ps":2,…}`, `{"__ps":"1",…}` or `{"__ps":null,…}`. It ranks above
every version, so step 5 reports `version-ahead` and yields the default, whether or not the definition sets `version`.
The item is never written back.

## What a failed read leaves behind

A read that yields the default because of `parse-failed`, `invalid`, `async-schema`, `migrate-failed` or `version-ahead`
does not write to or remove the stored item. Only two things change storage during a read: the removal of an expired Web
Storage item in step 6 and the write-back of a migrated value in step 9. `set()` replaces an unreadable item, and
`reset()` removes it, so withdrawing consent can delete it.

After a read that reports `version-ahead`, the value in the record is the default. A later `set(prev => …)` therefore
starts from the default, not from the stored value, and its result replaces the item written by newer code, under the
current `version`.

<details>
<summary>Step 2 in detail: cookie names, decoding and the unavailable case</summary>

#### Cookie names

A cookie may have been written under one of several names, so the lookup tries each in order and uses the first that is
present:

1. the canonical name, the key encoded as js-cookie encodes names;
2. the raw key;
3. `encodeURIComponent(key)`;
4. `encodeURIComponent(encodeURIComponent(key))`.

Names that cannot be a cookie name (anything outside printable ASCII, or containing `"`, `,`, `;`, `=` or `\`) are left
out. Writes use only the canonical name, so an older name stays in the jar until `reset()` removes every variant.

#### The text

For cookies, the value of a cookie is URI-decoded once when the cookie jar is parsed, as js-cookie reads it. If JSON
parsing then fails, the decoder tries up to two more passes of the same decoding before it gives up and uses the text
as it is. This reads cookies written by 0.2.1 under single or double encoding. A lone `%` is not an escape and stays as
written. A percent-escape that is not valid UTF-8, such as `%E0%A4`, cannot be decoded: the read reports `parse-failed`,
yields the default and leaves the cookie in place. Surrounding double quotes are kept, because Next.js's request
cookies keep them, and the browser and the server must decode a value the same way. For Web Storage there are no extra
passes.

#### Unavailable storage

Before the first read, storage is probed once per page: a Web Storage `setItem` and `removeItem` of a probe key, or
`navigator.cookieEnabled` for cookies. A probe that throws a quota error still counts as available, so stored values of
a full storage can be read and removed. When the probe fails, or when reading itself throws, the pipeline reports
`unavailable` (with the thrown error as `cause`, if any), the value lives in memory and `isPersistent()` is `false`. The
report is made once per record, however often the record is read again.

</details>

## The legacy rule

Version 0.2.1, the last version before the first public release, stored strings raw. Step 3 therefore reads both
generations of data, as [Migrating](/help/migrating/) describes:

- When `JSON.parse` fails, the raw text is the value. A stored `dark` reads as `'dark'`.
- When the `default` is a string and the parsed value is not a string, the raw text is the value. A stored `42` reads as
  `'42'` for a string definition, and `true` reads as `'true'`.

A definition whose default is not a string, such as a `null` default typed `string | null`, reads a raw 0.2.1 value that
parses as JSON (`42`, `true`) as that number or boolean. With a `schema` that expects a string, it is reported as
`invalid`. Such a definition should re-save its value, or use a string default.

## Validation

Step 8 calls `schema['~standard'].validate(value)` once.

| Result                                      | Reported                 | Value          |
| ------------------------------------------- | ------------------------ | -------------- |
| Success                                     | nothing                  | `result.value` |
| Issues, or a falsy result                   | `invalid`                | the default    |
| `validate` threw                            | `invalid` (with `cause`) | the default    |
| A promise (anything with a `then` function) | `async-schema`           | the default    |

A schema must accept its own output. `set()` stores the value as it is, and the next read passes the stored value
through the schema again, so a schema that transforms a value into a different shape rejects what it produced. The
default is not validated.

## Server reads

`readCookieState()` runs the same steps for a cookie definition, with the cookies of the request as step 2. It differs in
three ways: it does not evaluate the `consent` predicate, because a cookie exists only if it was written with consent; it
does not probe storage; and it never writes back a migrated value. Failures still go to the definition's `onError`.
