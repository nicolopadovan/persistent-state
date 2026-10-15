---
title: Stored format
description: The text persistent-state stores, the envelope for versions and expiry, and the js-cookie-compatible cookie encoding.
sidebar:
  order: 4
---

This page explains exactly what persistent-state writes: the stored text, the envelope that carries a version and an
expiry, and how cookie names and values are encoded. It is for readers who need the exact bytes, for example to read a
value from another runtime, to inspect storage in the browser's developer tools, or to keep cookies compatible with
code written for an earlier version.

The envelope is in `src/core/envelope.ts`, the cookie encoding in `src/core/cookie.ts` and the encoding step in
`src/core/state.ts` (`encode` and `store`). Values stored by this package are readable and writable by the visitor and by
any script on the page; they are not encrypted or signed.

## The stored text

Without a `version` and without a Web Storage expiry, the stored text is the serialized value. With the default JSON
serializer, every value is stored through `JSON.stringify`, strings included, so the string `"42"` is stored with its
quotes and reads back as a string, not a number.

| Value            | Stored text     |
| ---------------- | --------------- |
| `'dark'`         | `"dark"`        |
| `'42'`           | `"42"`          |
| `42`             | `42`            |
| `{ open: true }` | `{"open":true}` |

With a custom `serializer`, the stored text is whatever `serialize(value)` returns, with no JSON wrapping. Reads
accept the raw text 0.2.1 wrote for strings; see [the legacy rule](/internals/read-pipeline/#the-legacy-rule).

## The envelope

When the definition sets `version`, or sets a Web Storage `expires` other than `0`, the stored text is a JSON envelope
instead:

```json
{ "__ps": 1, "v": { "mode": "dark" }, "ver": 2, "exp": 1792000000000 }
```

| Field  | Meaning                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `__ps` | The envelope format. Always `1` in this version.                                                                                             |
| `v`    | The value. With a custom `serializer`, the serialized string.                                                                                |
| `ver`  | The `version` the value was written under. Omitted when there is no `version`, and read as `0`.                                              |
| `exp`  | The expiry as epoch milliseconds. Written only for Web Storage with `expires` set; cookies expire through their own attribute and have none. |

Absent fields are omitted, so `{"__ps":1,"v":1,"exp":1792000000000}` is a versionless value with an expiry.

On read, a value that is not an envelope is a plain value with version `0` and no expiry. A plain value written before
`version` or `expires` was configured is therefore still read, passes through `migrate` as version `0`, and never
expires.

An envelope is malformed, and reported as `parse-failed`, when it has no `v`, when `ver` is not a non-negative integer,
when `exp` is not a finite number, or, with a custom serializer, when `v` is not a string. An object whose `__ps` is
anything other than `1` is not malformed: it was written in a newer envelope format and reads as `version-ahead`. See
[The read pipeline](/internals/read-pipeline/).

<details>
<summary>Why not store the version and expiry separately?</summary>

A Web Storage item is one string under one key, and a cookie is one name and value. Keeping the version and expiry in the
same text means a value, its version and its expiry always change together, in one write, in every storage. Without
either, the stored text stays the plain serialized value, so code written for 0.2.1, which reads the text with
`JSON.parse`, keeps working while projects migrate.

</details>

## Cookie encoding

Cookie names and values are encoded exactly as js-cookie 3 encodes them. persistent-state does not depend on js-cookie;
the encoding is part of `src/core/cookie.ts`. The goal is compatibility in both directions: a cookie written by 0.2.1,
which wrote cookies in the browser with js-cookie, through `next-client-cookies`, reads in this version, and a cookie
written here reads with 0.2.1's `getPersistentCookieItem`. The test fixtures carry a copy of that function to prove it.

**Names** are encoded with `encodeURIComponent`. Then `#`, `$`, `&`, `+`, `^`, the backtick and `|` are restored to the
literal character, and `(` and `)` are escaped as `%28` and `%29`.

**Values** are encoded with `encodeURIComponent`. Then the characters js-cookie leaves readable are restored: `#`, `$`,
`&`, `+`, `/`, `:`, `<`, `=`, `>`, `?`, `@`, `[`, `]`, `^`, the backtick, `{`, `|` and `}`.

| Key         | Canonical cookie name | Value written           | Cookie value as stored            |
| ----------- | --------------------- | ----------------------- | --------------------------------- |
| `theme`     | `theme`               | `"dark"`                | `%22dark%22`                      |
| `app:theme` | `app%3Atheme`         | `{"open":true,"w":280}` | `{%22open%22:true%2C%22w%22:280}` |
| `a(b)`      | `a%28b%29`            | `1`                     | `1`                               |

Reading reverses this: the cookie jar is parsed from `document.cookie` (or a `Cookie` header), and each value is
URI-decoded once, as js-cookie's read converter does. Names are compared as written.

### Cookie attributes

A cookie write sets these attributes, in this order:

| Attribute  | Value                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `path`     | The `path` option, `/` by default.                                                                  |
| `expires`  | `Date.now()` plus `expires` days, or the `Date` given. Omitted for a session cookie (`expires: 0`). |
| `samesite` | The `sameSite` option, `lax` by default.                                                            |
| `domain`   | The `domain` option. Omitted by default, which limits the cookie to the current host.               |
| `secure`   | Added when the `secure` option is `true`, which is the default on `https:` pages.                   |

The `path` and `domain` values are cut at the first `;`, so an option cannot add attributes of its own. A number of days
is recomputed on every write, and the default for cookies is `365` days. `expires: 0` writes no `Expires` attribute, so
the browser keeps the cookie until it closes; for Web Storage the same value means no expiry.

### Names an older version may have written

A cookie written by an older version may sit under the raw key, `encodeURIComponent(key)` or the double-encoded key
instead of the canonical name. Reads try the canonical name first and then those, and `reset()` removes every variant.
A write only ever uses the canonical name, so it does not remove an older variant; the canonical cookie wins from then
on, because it is tried first.

<details>
<summary>Cookie size and how a rejected cookie is detected</summary>

Browsers silently ignore a cookie they reject, for example one over their size limit, or `SameSite=None` without
`Secure`. `document.cookie = …` does not throw in that case, so after every write the cookie jar is read back and the
value compared with the text written. A mismatch is reported as `write-failed`, and the value stays in memory. Keep
cookie values small: they are sent with every request to the cookie's path.

</details>
