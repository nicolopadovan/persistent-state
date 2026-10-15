import type { StandardSchemaV1 } from './standard-schema'

type PersistentStateErrorCode =
  'unavailable' | 'write-failed' | 'parse-failed' | 'invalid' | 'async-schema' | 'migrate-failed' | 'version-ahead'

const MESSAGES: Record<PersistentStateErrorCode, string> = {
  unavailable: 'storage is unavailable, so the value is kept in memory for this page',
  'write-failed': 'the value could not be written to storage and is kept in memory',
  'parse-failed': 'the stored value could not be decoded, so the default is used',
  invalid: 'the stored value does not match the schema, so the default is used',
  'async-schema': 'the schema validates asynchronously, which is not supported, so the default is used',
  'migrate-failed': 'the stored value could not be migrated, so the default is used',
  'version-ahead':
    'the stored value was written by a newer version, so the default is used and the stored value is kept',
}

/** What a {@link PersistentStateError} carries besides its code and key. */
export interface PersistentStateErrorDetails {
  /** The underlying error, if any. */
  cause?: unknown
  /** The issues the schema reported, if any. */
  issues?: readonly StandardSchemaV1.Issue[]
}

/**
 * A storage failure, passed to the `onError` option of a definition. No public function throws it.
 *
 * - `unavailable`: the storage cannot be used (blocked, disabled or throwing); the value lives in memory.
 * - `write-failed`: a write threw (for example a quota error) or a cookie did not read back after it was set.
 * - `parse-failed`: the custom serializer's `deserialize` threw, or the stored envelope is malformed; the default is
 *   used.
 * - `invalid`: the `schema` rejected the stored value (see `issues`), threw or returned nothing; the default is used.
 * - `async-schema`: the `schema` returned a promise, which is not supported; the default is used.
 * - `migrate-failed`: `migrate` threw or returned `undefined`; the default is used.
 * - `version-ahead`: the stored item was written under a higher `version`, or in a newer envelope format; the default
 *   is used.
 *
 * Reads leave the stored item of `invalid`, `async-schema`, `migrate-failed` and `version-ahead` untouched; `set()`
 * replaces it and `reset()` removes it.
 */
export class PersistentStateError extends Error {
  /** What failed. */
  readonly code: PersistentStateErrorCode
  /** The full stored name of the definition, namespace included. */
  readonly key: string
  /** The issues the schema reported, for `invalid`. */
  readonly issues?: readonly StandardSchemaV1.Issue[]

  /**
   * @param code - What failed.
   * @param key - The full stored name of the definition.
   * @param details - The underlying error and the schema issues, if any.
   */
  constructor(code: PersistentStateErrorCode, key: string, details: PersistentStateErrorDetails = {}) {
    super(`"${key}": ${MESSAGES[code]}`, { cause: details.cause })
    this.name = 'PersistentStateError'
    this.code = code
    this.key = key
    this.issues = details.issues
  }
}
