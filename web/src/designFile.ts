// Design files: every input of the app as one JSON document. Loading checks the file against the defaults'
// shape (types of every default field) before anything reaches the calculation, then fills missing fields
// from the defaults.

export const designVersion = 1

export function saveDesign<T extends object>(inputs: T): string {
  return JSON.stringify({ app: 'VertGate', version: designVersion, saved: new Date().toISOString(), inputs }, null, 2)
}

/** Why `v` does not have the shape of `def`, or undefined if it does. null defaults (linked fields) accept a number. */
export function mismatch(def: unknown, v: unknown, path = 'inputs'): string | undefined {
  if (def === null) return v === null || typeof v === 'number' ? undefined : `${path} must be a number or null`
  if (Array.isArray(def)) {
    if (!Array.isArray(v)) return `${path} must be a list`
    if (def.length) for (let i = 0; i < v.length; i++) {
      // a list may hold gaps (null) where entries repeat the one above
      const e = v[i] === null ? undefined : mismatch(def[0], v[i], `${path}[${i}]`)
      if (e) return e
    }
    return undefined
  }
  if (typeof def === 'object') {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return `${path} must be an object`
    for (const k of Object.keys(def as object)) {
      if (!(k in v)) continue // missing: taken from the defaults
      const e = mismatch((def as Record<string, unknown>)[k], (v as Record<string, unknown>)[k], `${path}.${k}`)
      if (e) return e
    }
    return undefined
  }
  if (typeof def === 'number') return typeof v === 'number' && Number.isFinite(v) ? undefined : `${path} must be a number`
  return typeof v === typeof def ? undefined : `${path} must be a ${typeof def}`
}

/** Parse a design file; throws with a readable message when it is not one. */
export function loadDesign<T extends Record<string, unknown>>(text: string, defaults: T): T {
  let doc: unknown
  try { doc = JSON.parse(text) } catch { throw new Error('The file is not valid JSON.') }
  const d = doc as { app?: unknown; version?: unknown; inputs?: unknown }
  if (typeof doc !== 'object' || doc === null || d.app !== 'VertGate') throw new Error('The file is not a VertGate design.')
  if (d.version !== designVersion) throw new Error(`The design file version ${String(d.version)} is not supported (expected ${designVersion}).`)
  const e = mismatch(defaults, d.inputs)
  if (e) throw new Error(`The design file is damaged: ${e}.`)
  const inputs = d.inputs as Record<string, unknown>
  return Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k,
    k in inputs ? (typeof v === 'object' && v !== null && !Array.isArray(v) ? { ...v, ...(inputs[k] as object) } : inputs[k]) : v])) as T
}
