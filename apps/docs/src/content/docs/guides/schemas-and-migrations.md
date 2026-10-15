---
title: Schemas and migrations
description: Validate stored values with any Standard Schema library, upgrade older values with version and migrate, and limit how long a value is kept.
sidebar:
  order: 3
---

This page covers what persistent-state does with a value it reads: validating it with a schema, upgrading it from an
older shape with `version` and `migrate`, expiring it, and the text it stores.

Stored values are not trusted. A visitor, a script, an older release of your own code or a newer one can all leave
something in storage that your current types do not describe. A schema decides what is accepted, `version` and
`migrate` carry old values forward, and the default covers everything else.

## Validate with a schema

The `schema` option takes any library that implements [Standard Schema](https://standardschema.dev), such as zod,
valibot or ArkType. Every value read from storage is passed to the schema, and the type of the value is the schema's
output type.

```ts title="lib/settings.ts"
import { persistentState } from '@nicolopadovan/persistent-state'
import { z } from 'zod'

export const settings = persistentState('settings', {
  default: { theme: 'system', pageSize: 20 },
  schema: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    pageSize: z.number().int().min(1).max(100),
  }),
})
```

The same definition with valibot:

```ts title="lib/settings.ts"
import { persistentState } from '@nicolopadovan/persistent-state'
import * as v from 'valibot'

export const settings = persistentState('settings', {
  default: { theme: 'system', pageSize: 20 },
  schema: v.object({
    theme: v.picklist(['light', 'dark', 'system']),
    pageSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  }),
})
```

The type `T` is inferred from the schema, and `default` and the result of `migrate` must match it, so a mismatch is a
type error.

### What happens when a value is invalid

A stored value that the schema rejects is not used. `get()` returns the `default`, the failure is reported to `onError`
as a `PersistentStateError` with the code `invalid` and the schema's `issues`, and the stored item is left as it is.

```ts
import { persistentState, type PersistentStateError } from '@nicolopadovan/persistent-state'

export const settings = persistentState('settings', {
  default: { theme: 'system', pageSize: 20 },
  onError: (error: PersistentStateError) => {
    if (error.code === 'invalid') console.warn(error.key, error.issues)
  },
})
```

Without `onError`, every failure is logged with `console.warn` and the prefix `[persistent-state]`.

- The schema runs when storage is read: on the first `get()` in a page, when another tab changes the value, after
  `refreshConsent()` grants consent, and in `readState()` and `readCookieState()` on the server. It does not run on every
  `get()`.
- The `default` is not validated, and nothing is validated when nothing is stored.
- The schema must validate synchronously. A schema that returns a promise is reported as `async-schema` and the default
  is used.
- A schema that throws is reported as `invalid`, with the error as `cause`.

:::caution[A schema must accept its own output]
`set()` stores the value you pass as it is, which is a value of the schema's output type, and a value returned by
`migrate` is stored as the schema's output. The next read passes the stored value to the schema as input. A schema that
rejects its own output therefore reports `invalid` on the next read, and the value you set is replaced by the default.
:::

For example, this schema reads text and outputs a number. `set(5)` stores the number `5`, and the next read hands `5` to
a schema that expects text:

```ts
// Rejects its own output: set(5) is stored, then reported as invalid on the next read.
schema: z.string().transform((text) => Number(text))

// Accepts what it outputs: a number, or text that coerces to one.
schema: z.coerce.number()
```

Use a schema whose input accepts its output, or leave transformations to your own code after `get()`.

## Upgrade older values with version and migrate

Change the shape of a stored value by raising `version` and describing how to upgrade the old shape in `migrate`.
`version` and `migrate` must be set together: `persistentState()` throws a `TypeError` for one without the other.

A value stored without a version has version `0`, which includes every value that was stored before you added
`version`. The first `version` you set is therefore `1`, and `migrate` receives `0` for the old values.

```ts title="lib/profile.ts"
import { persistentState } from '@nicolopadovan/persistent-state'
import { z } from 'zod'

export const profile = persistentState('profile', {
  default: { name: 'Guest', visits: 0 },
  schema: z.object({ name: z.string(), visits: z.number() }),
  version: 1,
  migrate: (stored) => {
    const { username } = z.object({ username: z.string() }).parse(stored)
    return { name: username, visits: 0 }
  },
})
```

`migrate(stored, fromVersion)` receives the stored value, typed `unknown`, and the version it was stored under. It runs
when the stored version is lower than `version`. Its result goes through the `schema`, and the validated value is written
back once, in the browser, so the migration runs once per stored item. The server's `readState()` migrates and validates
but never writes.

Parse the old shape inside `migrate`, as the example does: if the parse throws, the failure is reported as
`migrate-failed` instead of producing a wrong value.

<details>
<summary>Migrating across several versions</summary>

A stored value can be several versions behind. Step through each version it has missed, so every older shape reaches the
current one:

```ts
const Profile = z.object({ name: z.string(), visits: z.number(), locale: z.string() })

export const profile = persistentState('profile', {
  default: { name: 'Guest', visits: 0, locale: 'en' },
  schema: Profile,
  version: 2,
  migrate: (stored, fromVersion) => {
    let value = stored
    if (fromVersion < 1) {
      const { username } = z.object({ username: z.string() }).parse(value)
      value = { name: username, visits: 0 }
    }
    if (fromVersion < 2) {
      value = { ...z.object({ name: z.string(), visits: z.number() }).parse(value), locale: 'en' }
    }
    return Profile.parse(value)
  },
})
```

</details>

### When migration fails

A `migrate` that throws, or that returns `undefined`, is reported as `migrate-failed`. `get()` returns the default, and
the stored item is kept as it is, so the migration is tried again on the next page after you fix it. A migrated value
that the schema rejects is reported as `invalid` and kept the same way.

### When the stored version is newer than the code

A stored version above `version` was written by newer code, for example by a deployment you rolled back or by another
app on the same origin. It is reported as `version-ahead`, and the newer code's data is protected:

- `get()` returns the default.
- `set(prev => ...)` starts from the default, because `prev` is what `get()` returns.
- `set(value)` replaces the newer item with a value of the current version.
- `reset()` removes the newer item.
- Reads never change or remove it. The item stays through every page load until a `set()` or a `reset()`.

The check comes before the expiry, so a newer item is never removed, even when it is past its expiry. An item that
another format of the envelope wrote is treated the same way. A definition without a `version` has version `0`, so a
value stored with any `version` is ahead of it.

A `set()` of a value that equals the current one does nothing, so setting the default does not replace a newer item.
Call `reset()` to remove it.

### What each failure does to the stored item

| Code             | Cause                                                                             | Value returned | Stored item                                          |
| ---------------- | --------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| `invalid`        | The schema rejected the value, threw, or returned no result.                      | The default.   | Kept. `set()` replaces it and `reset()` removes it.  |
| `async-schema`   | The schema returned a promise.                                                    | The default.   | Kept.                                                |
| `migrate-failed` | `migrate` threw or returned `undefined`.                                          | The default.   | Kept. The migration is tried again on the next read. |
| `version-ahead`  | The stored version is above `version`, or the envelope format is newer.           | The default.   | Kept, even when it is past its expiry.               |
| `parse-failed`   | The custom serializer's `deserialize` threw, or the stored envelope is malformed. | The default.   | Kept.                                                |

## Expiry

The `expires` option limits how long a value is kept. A number is a count of days, and a `Date` is a fixed point in time.
It means different things for each storage:

| `expires`                                          | `cookie`                                | `localStorage` and `sessionStorage`     |
| -------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| Not set                                            | 365 days from each write.               | Never expires.                          |
| A number of days, such as `7` or `0.5`             | That many days from each write.         | That many days from each write.         |
| `0`                                                | A session cookie.                       | No expiry, the same as not setting it.  |
| A `Date`                                           | That date, as the cookie's `Expires`.   | That date, fixed.                       |
| A negative or non-finite number, an invalid `Date` | A `TypeError` from `persistentState()`. | A `TypeError` from `persistentState()`. |

`expires: 0` is not "expire at once": for Web Storage it means no expiry, and for a cookie it means a session cookie,
which the browser discards when the session ends.

A number is counted from every write, so each `set()` pushes the expiry forward. A `Date` does not move.

```ts
export const banner = persistentState('promo-banner-dismissed', {
  default: false,
  expires: 30,
})
```

For a cookie, the browser enforces the expiry through the cookie's `Expires` attribute. For Web Storage, persistent-state
stores the expiry with the value and checks it when it reads the item: the read yields the default and removes the item
once the expiry has passed. A page that already holds the value in memory keeps it until the next read.

## The stored format

Without a `version` and without a Web Storage `expires`, the stored text is the serialized value alone, with no
envelope. Every value, strings included, goes through the serializer,
which is JSON by default, so the string `"42"` is stored as `"42"` with its quotes and reads back as a string.

With a `version`, or with a Web Storage `expires`, the stored text is an envelope, a JSON object that wraps the value:

```json
{ "__ps": 1, "v": { "name": "Ada", "visits": 3 }, "ver": 1, "exp": 1790000000000 }
```

| Field  | Content                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- |
| `__ps` | The envelope format, `1`.                                                                            |
| `v`    | The value. With a custom `serializer`, the text that `serialize()` returned.                         |
| `ver`  | The version the value was written under. Omitted for version `0`.                                    |
| `exp`  | The expiry in epoch milliseconds, for Web Storage. Omitted otherwise, and never written for cookies. |

When a value is read, persistent-state parses the text and treats it as follows:

- An object with `__ps: 1` is an envelope. A malformed one is reported as `parse-failed`.
- An object whose `__ps` is anything else was written in a newer envelope format. It is reported as `version-ahead`
  and is never written back.
- Anything else is a plain value with version `0` and no expiry, which includes everything written by version 0.2.1.

<details>
<summary>Plain strings written by 0.2.1</summary>

Version 0.2.1 stored strings without quotes. When the text is not valid JSON, or when `default` is a string and the
parsed value is not a string, the text itself is the value, so those strings still read correctly. A definition whose
default is not a string, such as `null` typed `string | null`, reads a raw `42` or `true` as that number or boolean, and a
schema that expects a string reports it as `invalid`. Give such a definition a string default, or have it save its value
again. See
[Migrating](/help/migrating/).

</details>
