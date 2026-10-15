export { persistentState, readCookieState, refreshConsent } from './core/state'
export { PersistentStateError } from './core/error'
export type { StandardSchemaV1 } from './core/standard-schema'
export type {
  CookieOptions,
  CookieSource,
  PersistentState,
  PersistentStateOptions,
  Serializer,
  StorageKind,
} from './core/types'
export {
  getPersistentCookieItem,
  getPersistentCookieValue,
  type PersistentCookieStore,
  type StorageType,
} from './core/legacy'
