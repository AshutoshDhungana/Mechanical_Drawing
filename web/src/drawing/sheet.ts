// Drawing sheets: places the model views on an ISO A-size sheet at a standard scale and turns everything
// (shapes, hatching, dimensions, notes, frame, title block) into paper primitives in mm, y up. The SVG view and
// the DXF export both draw these primitives, so screen, PDF and CAD show the same thing.
import type { Detail, Dim, GateModel, Pt, Shape, View } from './model'

export type PLayer = 'OUTLINE' | 'HIDDEN' | 'CENTER' | 'CUT' | 'HATCH' | 'THIN' | 'DIM' | 'TEXT' | 'BORDER'
export type Prim =
  | { k: 'poly'; pts: Pt[]; closed?: boolean; layer: PLayer; fill?: 'white' | 'black' }
  | { k: 'circle'; c: Pt; r: number; layer: PLayer; fill?: 'white' }
  | { k: 'text'; p: Pt; s: string; h: number; layer: PLayer; anchor?: 'start' | 'middle' | 'end'; rot?: number }

export const sheetSizes = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297] } as const
export type SheetSize = keyof typeof sheetSizes
export const standardScales = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]

export interface SheetMeta {
  project: string; title: string; gate: string; opening: string; date: string; dwgNo: string; notes: string[]
}
export interface DrawingSettings { sheet: 'ga' | 'details'; size: SheetSize; scale: number | 'auto'; hidden: PLayer[] }
export const defaultDrawingSettings: DrawingSettings = { sheet: 'ga', size: 'A1', scale: 'auto', hidden: [] }
export interface Sheet { w: number; h: number; scale: number; scaleLabel: string; prims: Prim[]; warnings: string[] }

const TXT = 2.5 // dimension and note text height
const ARROW = 2.5
const HATCH = 2 // hatch spacing
const toLayer = { outline: 'OUTLINE', hidden: 'HIDDEN', center: 'CENTER', cut: 'CUT', thin: 'THIN' } as const
export const textWidth = (s: string, h: number) => s.replace(/%%c/g, 'x').length * h * 0.8 // ponytail: estimate, no font metrics

// ------------------------------------------------------------------ clipping (detail windows)

type Win = [number, number, number, number]
const inside = (p: Pt, w: Win) => p[0] >= w[0] && p[0] <= w[2] && p[1] >= w[1] && p[1] <= w[3]
const ring = (c: Pt, r: number, m = 48): Pt[] => Array.from({ length: m }, (_, i) => [c[0] + r * Math.cos(2 * Math.PI * i / m), c[1] + r * Math.sin(2 * Math.PI * i / m)])

/** Sutherland–Hodgman against an axis-aligned window. */
function clipPolygon(pts: Pt[], w: Win): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [0, 1, 2, 3].map((e) => {
    const axis = e % 2, v = w[e], keep = (p: Pt) => (e < 2 ? p[axis] >= v : p[axis] <= v)
    return [keep, (a: Pt, b: Pt): Pt => {
      const f = (v - a[axis]) / (b[axis] - a[axis])
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]
    }]
  })
  let out = pts
  for (const [keep, cut] of edges) {
    const src = out
    out = []
    src.forEach((b, i) => {
      const a = src[(i + src.length - 1) % src.length]
      if (keep(b)) { if (!keep(a)) out.push(cut(a, b)); out.push(b) } else if (keep(a)) out.push(cut(a, b))
    })
  }
  return out
}

/** Liang–Barsky segment clip. */
function clipSegment(a: Pt, b: Pt, w: Win): [Pt, Pt] | undefined {
  let t0 = 0, t1 = 1
  const d = [b[0] - a[0], b[1] - a[1]]
  for (const [p, q] of [[-d[0], a[0] - w[0]], [d[0], w[2] - a[0]], [-d[1], a[1] - w[1]], [d[1], w[3] - a[1]]]) {
    if (p === 0) { if (q < 0) return undefined; continue }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r)
    if (t0 > t1) return undefined
  }
  return [[a[0] + t0 * d[0], a[1] + t0 * d[1]], [a[0] + t1 * d[0], a[1] + t1 * d[1]]]
}

export function clipShapes(shapes: Shape[], w: Win): Shape[] {
  const out: Shape[] = []
  for (const s of shapes) {
    let pts: Pt[]
    let closed: boolean
    if (s.k === 'circle') {
      if (s.c[0] - s.r >= w[0] && s.c[0] + s.r <= w[2] && s.c[1] - s.r >= w[1] && s.c[1] + s.r <= w[3]) { out.push(s); continue }
      if (s.c[0] + s.r < w[0] || s.c[0] - s.r > w[2] || s.c[1] + s.r < w[1] || s.c[1] - s.r > w[3]) continue
      pts = ring(s.c, s.r); closed = true
    } else {
      if (s.pts.every((p) => inside(p, w))) { out.push(s); continue }
      pts = s.pts; closed = !!s.closed
    }
    const style = { layer: s.layer, fill: s.fill, rubber: s.rubber }
    if (closed && (s.fill || s.layer === 'cut')) {
      const c = clipPolygon(pts, w)
      if (c.length >= 3) out.push({ k: 'poly', pts: c, closed: true, ...style })
    } else {
      const n = closed ? pts.length : pts.length - 1
      for (let i = 0; i < n; i++) {
        const c = clipSegment(pts[i], pts[(i + 1) % pts.length], w)
        if (c) out.push({ k: 'poly', pts: c, ...style, fill: undefined })
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ paper primitives

/** Hatch lines at 45° (steel) or 135° (rubber), anchored to the sheet so neighbouring faces line up. */
export function hatch(pts: Pt[], rubber = false): Prim[] {
  const a = rubber ? -Math.PI / 4 : Math.PI / 4
  const u: Pt = [Math.cos(a), Math.sin(a)], nrm: Pt = [-u[1], u[0]]
  const dot = (p: Pt, v: Pt) => p[0] * v[0] + p[1] * v[1]
  const ns = pts.map((p) => dot(p, nrm))
  const out: Prim[] = []
  for (let c = Math.ceil(Math.min(...ns) / HATCH) * HATCH; c < Math.max(...ns); c += HATCH) {
    const hits: number[] = []
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length], np = ns[i], nq = ns[(i + 1) % pts.length]
      if ((np <= c) !== (nq <= c)) {
        const f = (c - np) / (nq - np)
        hits.push(dot([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])], u))
      }
    })
    hits.sort((x, y) => x - y)
    for (let i = 0; i + 1 < hits.length; i += 2) {
      out.push({ k: 'poly', layer: 'HATCH', pts: [hits[i], hits[i + 1]].map((s): Pt => [u[0] * s + nrm[0] * c, u[1] * s + nrm[1] * c]) })
    }
  }
  return out
}

const arrowHead = (tip: Pt, dir: Pt, layer: PLayer = 'DIM'): Prim => {
  const l = Math.hypot(dir[0], dir[1]), d: Pt = [dir[0] / l, dir[1] / l], hw = ARROW / 3.5
  const b: Pt = [tip[0] - d[0] * ARROW, tip[1] - d[1] * ARROW]
  return { k: 'poly', layer, closed: true, fill: 'black', pts: [tip, [b[0] - d[1] * hw, b[1] + d[0] * hw], [b[0] + d[1] * hw, b[1] - d[0] * hw]] }
}
const text = (p: Pt, s: string, h = TXT, layer: PLayer = 'TEXT', anchor: 'start' | 'middle' | 'end' = 'start', rot = 0): Prim => ({ k: 'text', p, s, h, layer, anchor, rot })
const line = (a: Pt, b: Pt, layer: PLayer): Prim => ({ k: 'poly', pts: [a, b], layer })

/** Linear dimension in paper space; the text gives the true length (model mm). */
function dimension(d: Dim, T: (p: Pt) => Pt): Prim[] {
  const h = d.dir === 'h', i = h ? 1 : 0, j = h ? 0 : 1 // i: offset axis, j: measuring axis
  const A = T(d.a), B = T(d.b)
  const at = (d.base === undefined ? A[i] : T(h ? [0, d.base] : [d.base, 0])[i]) + d.off
  const P = (m: number, o: number): Pt => (h ? [m, o] : [o, m])
  const lo = Math.min(A[j], B[j]), hi = Math.max(A[j], B[j]), len = hi - lo
  if (len < 1e-6) return []
  const label = d.text ?? String(Math.round(Math.abs((h ? d.b[0] - d.a[0] : d.b[1] - d.a[1]))))
  const out: Prim[] = []
  for (const Q of [A, B]) {
    const sgn = Math.sign(at - Q[i]) || 1
    if (Math.abs(at - Q[i]) > 1) out.push(line(P(Q[j], Q[i] + sgn * 1), P(Q[j], at + sgn * 1.5), 'DIM'))
  }
  const tw = textWidth(label, TXT)
  const roomy = len >= 2 * ARROW + 1
  out.push(line(P(roomy ? lo : lo - 4, at), P(roomy ? hi : hi + 4, at), 'DIM'))
  out.push(arrowHead(P(lo, at), P(roomy ? -1 : 1, 0)), arrowHead(P(hi, at), P(roomy ? 1 : -1, 0)))
  const fits = len >= tw + 2 * ARROW + 1
  const tm = fits ? (lo + hi) / 2 : hi + (roomy ? 1.5 : 5.5) + tw / 2
  // text sits on the side of the line away from the object; vertical text reads from the right
  out.push(h ? text([tm, at + 1], label, TXT, 'DIM', 'middle') : text([at - 1, tm], label, TXT, 'DIM', 'middle', 90))
  return out
}

/** Paper primitives for a view at 1:s with model origin at o (paper mm). */
export function explode(v: Pick<View, 'shapes' | 'dims' | 'notes'> & Partial<View>, s: number, o: Pt, win?: Win): Prim[] {
  const T = (p: Pt): Pt => [o[0] + p[0] / s, o[1] + p[1] / s]
  const out: Prim[] = []
  for (const sh of win ? clipShapes(v.shapes, win) : v.shapes) {
    const layer = toLayer[sh.layer]
    if (sh.k === 'circle' && sh.layer !== 'cut') { out.push({ k: 'circle', c: T(sh.c), r: sh.r / s, layer, fill: sh.fill ? 'white' : undefined }); continue }
    const pts = (sh.k === 'circle' ? ring(sh.c, sh.r, 32) : sh.pts).map(T)
    const closed = sh.k === 'circle' || !!sh.closed
    if (sh.layer === 'cut') {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
      const thin = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 2 * HATCH
      out.push({ k: 'poly', pts, closed, layer, fill: thin ? 'black' : 'white' })
      if (!thin) out.push(...hatch(pts, sh.rubber))
    } else out.push({ k: 'poly', pts, closed, layer, fill: sh.fill ? 'white' : undefined })
  }
  for (const d of v.dims) out.push(...dimension(d, T))
  for (const n of v.notes) {
    const A = T(n.at), B: Pt = [A[0] + n.dx, A[1] + n.dy], dir = Math.sign(n.dx) || 1
    out.push(arrowHead(A, [A[0] - B[0], A[1] - B[1]], 'TEXT'), line(A, B, 'TEXT'), line(B, [B[0] + dir * 3, B[1]], 'TEXT'))
    out.push(text([B[0] + dir * 4, B[1] - TXT / 2], n.text, TXT, 'TEXT', dir > 0 ? 'start' : 'end'))
  }
  for (const l of v.labels ?? []) {
    const p = T(l.at)
    out.push(text([p[0], p[1] - TXT / 2], l.text, TXT, 'TEXT', 'middle'))
  }
  for (const c of v.cuts ?? []) {
    const A = T(c.a), B = T(c.b), L = Math.hypot(B[0] - A[0], B[1] - A[1]), u: Pt = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
    out.push(line(A, B, 'CENTER'))
    for (const [P, sgn] of [[A, 1], [B, -1]] as const) {
      const E: Pt = [P[0] + sgn * u[0] * 6, P[1] + sgn * u[1] * 6], tip: Pt = [P[0] + c.dir[0] * 8, P[1] + c.dir[1] * 8]
      out.push({ k: 'poly', pts: [P, E], layer: 'OUTLINE' }, line(P, tip, 'OUTLINE'), arrowHead(tip, c.dir, 'OUTLINE'))
      out.push(text([tip[0] + c.dir[0] * 2 - u[0] * sgn * 3, tip[1] + c.dir[1] * 2 - u[1] * sgn * 3 - (c.dir[1] < 0 ? 5 : 0)], c.name, 5, 'TEXT', 'middle'))
    }
  }
  for (const a of v.arrows ?? []) {
    const P0 = T(a.at), S: Pt = [P0[0] + a.off[0], P0[1] + a.off[1]], E: Pt = [S[0] + a.dir[0] * 15, S[1] + a.dir[1] * 15]
    out.push(line(S, E, 'TEXT'), arrowHead(E, a.dir, 'TEXT'), text([S[0] + a.dir[0] * 7.5 + (a.dir[1] ? 2 : 0), S[1] + a.dir[1] * 7.5 + (a.dir[0] ? 1.5 : 0)], a.text, TXT, 'TEXT', a.dir[1] ? 'start' : 'middle'))
  }
  return out
}

export function bbox(prims: Prim[]): Win {
  const b: Win = [Infinity, Infinity, -Infinity, -Infinity]
  const add = (x: number, y: number) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) }
  for (const p of prims) {
    if (p.k === 'poly') p.pts.forEach((q) => add(q[0], q[1]))
    else if (p.k === 'circle') { add(p.c[0] - p.r, p.c[1] - p.r); add(p.c[0] + p.r, p.c[1] + p.r) }
    else {
      const w = textWidth(p.s, p.h), x0 = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0
      if (p.rot) { add(p.p[0] - p.h, p.p[1] + x0); add(p.p[0], p.p[1] + x0 + w) } else { add(p.p[0] + x0, p.p[1]); add(p.p[0] + x0 + w, p.p[1] + p.h) }
    }
  }
  return b
}

export function shift(prims: Prim[], d: Pt): Prim[] {
  const m = (p: Pt): Pt => [p[0] + d[0], p[1] + d[1]]
  return prims.map((p) => (p.k === 'poly' ? { ...p, pts: p.pts.map(m) } : p.k === 'circle' ? { ...p, c: m(p.c) } : { ...p, p: m(p.p) }))
}

/** A view (or detail window) with its title underneath, origin at the paper origin. */
function titled(v: View | (Detail & { shapes: View['shapes'] }), title: string, s: number, win?: Win): Prim[] {
  const prims = explode(v, s, [0, 0], win)
  const b = bbox(prims)
  const cx = (b[0] + b[2]) / 2
  return [...prims, text([cx, b[1] - 9], title, 3.5, 'TEXT', 'middle'), line([cx - textWidth(title, 3.5) / 2, b[1] - 10], [cx + textWidth(title, 3.5) / 2, b[1] - 10], 'TEXT'),
    text([cx, b[1] - 15], `SCALE 1:${s}`, TXT, 'TEXT', 'middle')]
}

// ------------------------------------------------------------------ frame, title block, tables

const COL = 180 // title block width (ISO 7200)
function frame(w: number, h: number, scaleLabel: string, meta: SheetMeta, size: SheetSize): Prim[] {
  const out: Prim[] = [
    { k: 'poly', pts: [[20, 10], [w - 10, 10], [w - 10, h - 10], [20, h - 10]], closed: true, layer: 'BORDER' },
    // centring marks
    line([w / 2, 0], [w / 2, 10], 'BORDER'), line([w / 2, h - 10], [w / 2, h], 'BORDER'), line([10, h / 2], [20, h / 2], 'BORDER'), line([w - 10, h / 2], [w, h / 2], 'BORDER'),
  ]
  const x0 = w - 10 - COL, y0 = 10
  const rows = [0, 6, 16, 26, 40, 50] // row lines above y0
  const box = (a: Pt, b: Pt): Prim => ({ k: 'poly', pts: [a, [b[0], a[1]], b, [a[0], b[1]]], closed: true, layer: 'BORDER' })
  out.push(box([x0, y0], [w - 10, y0 + 50]))
  for (const r of rows.slice(1, -1)) out.push(line([x0, y0 + r], [w - 10, y0 + r], 'BORDER'))
  for (const r of [16, 26]) out.push(line([x0 + 100, y0 + r - 10], [x0 + 100, y0 + r], 'BORDER'), line([x0 + 135, y0 + r - 10], [x0 + 135, y0 + r], 'BORDER'))
  const cell = (x: number, y: number, label: string, value: string, vh = TXT) => {
    out.push(text([x0 + x + 1.5, y0 + y + 6.5], label, 1.8, 'BORDER'), text([x0 + x + 1.5, y0 + y + 1.8], value, vh, 'BORDER'))
  }
  cell(0, 40, 'PROJECT', meta.project.toUpperCase())
  out.push(text([x0 + 1.5, y0 + 36], 'TITLE', 1.8, 'BORDER'), text([x0 + 18, y0 + 30], meta.title, 5, 'BORDER'))
  cell(0, 16, 'GATE', meta.gate)
  cell(100, 16, 'SCALE', scaleLabel)
  cell(135, 16, 'SHEET', `${size} (${w} x ${h})`)
  cell(0, 6, 'OPENING', meta.opening)
  cell(100, 6, 'DATE', meta.date)
  cell(135, 6, 'DWG NO / REV', `${meta.dwgNo} / 0`)
  out.push(text([x0 + 1.5, y0 + 1.8], 'GENERATED BY VERTGATE FROM THE DESIGN CALCULATION. CHECK BEFORE USE. FIRST ANGLE PROJECTION.', 1.8, 'BORDER'))
  return out
}

const wrap = (s: string, width: number, h: number) => s.split(' ').reduce<string[]>((ls, word) => {
  const last = ls[ls.length - 1]
  if (last !== undefined && textWidth(`${last} ${word}`, h) <= width) ls[ls.length - 1] = `${last} ${word}`
  else ls.push(word)
  return ls
}, [])

/** Notes (and an optional table) stacked upwards from y in the right-hand column. */
function column(w: number, y: number, notes: string[], table?: string[][]): { prims: Prim[]; top: number } {
  const x0 = w - 10 - COL, out: Prim[] = []
  const lines = notes.flatMap((n, i) => wrap(`${i + 1}. ${n}`, COL, TXT).map((l, k) => (k ? `    ${l}` : l)))
  let top = y
  out.push(text([x0, top + 2 + lines.length * 4.5], 'NOTES', 3.5, 'TEXT'))
  lines.forEach((l, i) => out.push(text([x0, top + 2 + (lines.length - 1 - i) * 4.5], l, TXT, 'TEXT')))
  top += lines.length * 4.5 + 10
  if (table) {
    const widths = [12, 40, 26, 20, 14, 68], rh = 5
    const xs = widths.reduce<number[]>((a, c) => [...a, a[a.length - 1] + c], [x0])
    const rows = table.length
    out.push({ k: 'poly', pts: [[x0, top], [x0 + COL, top], [x0 + COL, top + rows * rh], [x0, top + rows * rh]], closed: true, layer: 'BORDER' })
    for (let r = 1; r < rows; r++) out.push(line([x0, top + r * rh], [x0 + COL, top + r * rh], r === rows - 1 ? 'BORDER' : 'THIN'))
    xs.slice(1, -1).forEach((x) => out.push(line([x, top], [x, top + rows * rh], 'THIN')))
    table.forEach((row, r) => row.forEach((c, i) => out.push(text([xs[i] + 1, top + (rows - 1 - r) * rh + 1.4], c, r === 0 ? 1.8 : 2.2, 'TEXT'))))
    top += rows * rh
    out.push(text([x0, top + 2], 'SCHEDULE', 3.5, 'TEXT'))
    top += 8
  }
  return { prims: out, top }
}

const area = (w: number, h: number): Win => [25, 15, w - 10 - COL - 8, h - 15]
const fits = (b: Win, a: Win) => b[2] - b[0] <= a[2] - a[0] && b[3] - b[1] <= a[3] - a[1]

// ------------------------------------------------------------------ sheets

/** General arrangement: elevation, section A-A to its right, section B-B below, at one scale. */
export function gaSheet(m: GateModel, size: SheetSize, scale: number | 'auto', meta: SheetMeta): Sheet {
  const [w, h] = sheetSizes[size]
  const warnings: string[] = []
  const col = column(w, 10 + 50 + 4, meta.notes, m.schedule)
  if (col.top > h - 10) warnings.push('The notes and schedule do not fit the sheet height: choose a larger sheet.')
  const a = area(w, h)
  const compose = (s: number) => {
    const el = titled(m.elevation, m.elevation.title, s), sa = titled(m.section, m.section.title, s), pl = titled(m.plan, m.plan.title, s)
    const be = bbox(el), bs = bbox(sa), bp = bbox(pl)
    const gap = 12
    const saX = be[2] + gap - bs[0] // A-A projected level with the elevation
    const plY = Math.min(be[1], bs[1]) - gap - bp[3] // B-B projected below, aligned in x
    const prims = [...el, ...shift(sa, [saX, 0]), ...shift(pl, [0, plY])]
    return { prims, b: bbox(prims) }
  }
  const tries = scale === 'auto' ? standardScales : [scale]
  let best = compose(tries[tries.length - 1]), s = tries[tries.length - 1]
  for (const c of tries) {
    const r = compose(c)
    if (fits(r.b, a)) { best = r; s = c; break }
  }
  if (!fits(best.b, a)) warnings.push(`The views do not fit the sheet at 1:${s}: choose a larger sheet or scale.`)
  const d: Pt = [(a[0] + a[2]) / 2 - (best.b[0] + best.b[2]) / 2, (a[1] + a[3]) / 2 - (best.b[1] + best.b[3]) / 2]
  const label = `1:${s}`
  return { w, h, scale: s, scaleLabel: label, warnings, prims: [...shift(best.prims, d), ...col.prims, ...frame(w, h, label, { ...meta, title: 'GENERAL ARRANGEMENT', dwgNo: `${meta.dwgNo}-01` }, size)] }
}

/** Details: each detail window at the largest standard scale that fits its cell. */
export function detailSheet(m: GateModel, size: SheetSize, meta: SheetMeta): Sheet {
  const [w, h] = sheetSizes[size]
  const a = area(w, h)
  const N = m.details.length
  const cols = Math.min(N, Math.max(2, Math.round(Math.sqrt(N * (a[2] - a[0]) / (a[3] - a[1])))))
  const rows = Math.ceil(N / cols)
  const cw = (a[2] - a[0]) / cols, ch = (a[3] - a[1]) / rows
  const src = { section: m.section, plan: m.plan, axle: m.axle }
  const prims: Prim[] = [], warnings: string[] = [], used: number[] = []
  m.details.forEach((dt, i) => {
    const v = { ...dt, shapes: src[dt.src].shapes }
    let p: Prim[] = [], b: Win = [0, 0, 0, 0], s = standardScales[standardScales.length - 1]
    for (const c of standardScales) {
      p = titled(v, dt.title, c, dt.win); b = bbox(p); s = c
      if (fits(b, [0, 0, cw - 10, ch - 8])) break
    }
    used.push(s)
    const cx = a[0] + (i % cols + 0.5) * cw, cy = a[3] - (Math.floor(i / cols) + 0.5) * ch
    prims.push(...shift(p, [cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2]))
  })
  const col = column(w, 10 + 50 + 4, meta.notes)
  const main = used.sort((x, y) => used.filter((u) => u === y).length - used.filter((u) => u === x).length)[0] ?? 1
  return { w, h, scale: main, scaleLabel: 'AS SHOWN', warnings, prims: [...prims, ...col.prims, ...frame(w, h, 'AS SHOWN', { ...meta, title: 'DETAILS', dwgNo: `${meta.dwgNo}-02` }, size)] }
}
