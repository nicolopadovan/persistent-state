/** A stored item: the value, the version it was written under and the Web Storage expiry, if any. */
export interface Envelope {
  /** The value, or its serialized text when a custom serializer is used. */
  v: unknown
  /** The version the value was written under; `0` for a plain value. */
  ver: number
  /** The expiry in epoch milliseconds. */
  exp?: number
}

export const isEnvelope = (parsed: unknown): parsed is object =>
  typeof parsed === 'object' && parsed !== null && '__ps' in parsed

export const readEnvelope = (parsed: object): Envelope | undefined => {
  const { __ps, v, ver = 0, exp } = parsed as Record<string, unknown>
  // another format of the envelope was written by newer code, so it ranks above every version
  if (__ps !== 1) return { v: undefined, ver: Infinity }
  if (!('v' in parsed)) return undefined
  if (typeof ver !== 'number' || !Number.isInteger(ver) || ver < 0) return undefined
  if (exp !== undefined && (typeof exp !== 'number' || !Number.isFinite(exp))) return undefined
  return { v, ver, exp }
}

export const writeEnvelope = (v: unknown, ver: number, exp: number | undefined): string =>
  JSON.stringify({ __ps: 1, v, ver: ver || undefined, exp })
