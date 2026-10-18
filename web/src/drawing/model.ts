// Scaled drawing geometry built from the calculation results. Units: mm.
// Elevation (x, y): x across the span from the gate centreline, y up from the gate bottom (sill).
// Section A-A (z, y) and section B-B (x, z): z normal to the skin plate face, positive into the beams, as in
// Weight & cg. Views are stored after their projection mapping (first angle: A-A right of the elevation with
// downstream to the right, B-B below it with downstream at the bottom), so detail windows are plain rectangles.
import type { BeamSection } from '../calc/defineBeam'
import type { SealDims, SealsInput, SealType } from '../calc/seals'
import type { SkinLocation } from '../calc/secProp'
import type { GateType, Stiffener } from '../calc/stiffeners'

export type Pt = [number, number]
export type Layer = 'outline' | 'hidden' | 'center' | 'cut' | 'thin'
interface Style { layer: Layer; fill?: boolean; rubber?: boolean } // fill: opaque, hides what was drawn before it
export type Shape = ({ k: 'poly'; pts: Pt[]; closed?: boolean } | { k: 'circle'; c: Pt; r: number }) & Style
/** Linear dimension between two points. The dimension line sits off paper mm (+ = up / right) from base, a model
 *  coordinate (y for 'h', x for 'v') that defaults to point a's. */
export interface Dim { a: Pt; b: Pt; dir: 'h' | 'v'; off: number; base?: number; text?: string }
/** Leader from a point to a note dx, dy paper mm away. */
export interface Note { at: Pt; text: string; dx: number; dy: number }
export interface Label { at: Pt; text: string }
/** Cutting plane a → b viewed in direction dir. */
export interface Cut { a: Pt; b: Pt; dir: Pt; name: string }
/** Flow arrow: starts at `at` + off (paper mm), 15 mm long in dir. */
export interface Arrow { at: Pt; off: Pt; dir: Pt; text: string }
export interface View { title: string; shapes: Shape[]; dims: Dim[]; notes: Note[]; labels: Label[]; cuts: Cut[]; arrows: Arrow[] }
export interface Detail { title: string; src: 'section' | 'plan' | 'axle'; win: [number, number, number, number]; dims: Dim[]; notes: Note[] }

export interface WheelArrangement {
  double: boolean
  spacings: number[] // Wheel Spacing, wheels per side + 1
  Dw: number; tread: number; bh: number; d: number; y: number; b: number; c: number
  hubD?: number // elliptical contact dh; otherwise drawn as 2 d
  Lr: number; a: number // cantilevered: axle support span and inner support thickness
  track: { b: number; d: number }
}

export interface GateDrawingInput {
  gateType: GateType; loc: SkinLocation
  D: number; Lsup: number; Lse: number; tap: number; dweb: number; ts: number
  spacings: number[]; sections: BeamSection[]; names: string[]; t: number[]; stiff: Stiffener[]
  seals: SealsInput // mm
  wheels?: WheelArrangement
}

const IN8 = 0.125 * 25.4 // seal stem set-back from the bar end (Weight & cg)
const r0 = (v: number) => String(Math.round(v))
const view = (title: string): View => ({ title, shapes: [], dims: [], notes: [], labels: [], cuts: [], arrows: [] })
const poly = (pts: Pt[], layer: Layer, o: Omit<Style, 'layer'> = {}, closed = true): Shape => ({ k: 'poly', pts, closed, layer, ...o })
const seg = (a: Pt, b: Pt, layer: Layer): Shape => poly([a, b], layer, {}, false)
/** Rectangle from two corners in (p, q) coordinates, mapped to view coordinates by f. */
const box = (f: (p: number, q: number) => Pt, p0: number, q0: number, p1: number, q1: number, layer: Layer, o: Omit<Style, 'layer'> = {}) =>
  poly([f(p0, q0), f(p1, q0), f(p1, q1), f(p0, q1)], layer, o)
const chain = (vals: number[], at: (v: number) => Pt, dir: 'h' | 'v', off: number): Dim[] =>
  vals.slice(1).map((v, i) => ({ a: at(vals[i]), b: at(v), dir, off }))

/** Vertical stiffener positions across the span: offset from the centre, then every spacing, mirrored. */
export function stiffenerX(s: Stiffener): number[] {
  const xs: number[] = []
  for (let j = 0; xs.length < s.count; j++) {
    const x = s.offset + j * s.spacing
    xs.push(...(x === 0 ? [0] : [-x, x]))
  }
  return xs.slice(0, s.count).sort((a, b) => a - b) // ponytail: an odd count with an offset loses one side's last stiffener
}

/** Seal cross-section in local (u, w): u along the seal from the inner bar end, w out from the skin plate face. */
export function sealParts(type: SealType, d: SealDims) {
  const rects: { r: [number, number, number, number]; rubber?: boolean }[] = []
  if (type === 'Wedge Seal') {
    const tbt = d.tbt ?? 0, sh = d.sh ?? 0 // u = 0 at the gate bottom, the clamp bar flush with it (§7 sketch)
    rects.push({ r: [d.cw - sh, 0, d.cw, d.t], rubber: true }, { r: [0, d.t, d.cw, d.t + d.ct] }, { r: [d.cw, 0, d.cw + tbt, d.t + d.ct] })
    return { rects, uc: d.cw - sh, u1: d.cw + tbt, w1: d.t + d.ct, bulb: undefined, u: [d.cw - sh, 0, d.cw, d.cw + tbt], w: [0, d.t, d.t + d.ct] }
  }
  const uc = d.cw + d.x // bulb centre on the seal line
  const centre = type === 'Center Bulb Seal'
  const end = centre ? 2 * uc : uc
  const bars: [number, number][] = centre ? [[0, d.cw], [uc + d.x, end]] : [[0, d.cw]]
  for (const [a, b] of bars) rects.push({ r: [a, 0, b, d.mt] }, { r: [a, d.mt + d.t, b, d.mt + d.t + d.ct] })
  rects.push({ r: [IN8, d.mt, end - (centre ? IN8 : 0), d.mt + d.t], rubber: true })
  const u = centre ? [0, d.cw, uc, uc + d.x, end] : [0, d.cw, uc]
  return { rects, uc, u1: centre ? end : uc + d.B / 2, w1: d.mt + Math.max(d.B, d.t + d.ct), bulb: { c: [uc, d.mt + d.B / 2] as Pt, r: d.B / 2 }, u, w: [0, d.mt, d.mt + d.t, d.mt + d.t + d.ct] }
}

/** Seal shapes, the seal plate line and its detail dimensions, placed by f(u, w) → view point. */
function placeSeal(type: SealType, d: SealDims, f: (u: number, w: number) => Pt) {
  const s = sealParts(type, d)
  const shapes: Shape[] = s.rects.map(({ r, rubber }) => box(f, r[0], r[1], r[2], r[3], 'cut', { rubber }))
  if (s.bulb) {
    const [u, w] = s.bulb.c
    const c = f(u, w), e = f(u + s.bulb.r, w)
    shapes.push({ k: 'circle', c, r: Math.hypot(e[0] - c[0], e[1] - c[1]), layer: 'cut', rubber: true })
    const wp = d.mt + d.B - d.delta // embedded seal plate face after precompression
    shapes.push(seg(f(s.uc - 1.5 * d.B, wp), f(s.uc + 1.5 * d.B, wp), 'thin'))
  }
  // dimension directions: u and w each map to paper x or y; out = the paper side the seal grows towards
  const du = f(1, 0), dw = f(0, 1), o = f(0, 0)
  const uAxis = Math.abs(du[0] - o[0]) > 0.5 ? 'h' : 'v'
  const sgnW = Math.sign(uAxis === 'h' ? dw[1] - o[1] : dw[0] - o[0])
  const sgnU = Math.sign(uAxis === 'h' ? du[0] - o[0] : du[1] - o[1])
  const wAxis = uAxis === 'h' ? 'v' : 'h'
  const us = [...new Set(s.u)].sort((a, b) => a - b)
  const dims: Dim[] = [
    ...chain(us, (u) => f(u, s.w1), uAxis, 10 * sgnW),
    ...chain(s.w, (w) => f(us[0], w), wAxis, -10 * sgnU),
    ...(s.bulb ? [{ a: f(s.uc, d.mt), b: f(s.uc, d.mt + d.B), dir: wAxis, base: f(s.uc + d.B / 2, 0)[uAxis === 'h' ? 0 : 1], off: 6 * sgnU } as Dim] : []),
  ]
  const notes: Note[] = [{ at: f(s.bulb ? s.uc : (s.u[0] + s.u[2]) / 2, s.bulb ? d.mt + d.B : d.t / 2), text: s.bulb ? `${type.toUpperCase()}, BULB %%c${r0(d.B)}, PRECOMPRESSION ${d.delta}` : `${type.toUpperCase()} ${r0(d.sh ?? 0)} x ${r0(d.t)}`, dx: 12 * sgnU, dy: 10 }]
  return { shapes, dims, notes, s }
}

export function gateModel(inp: GateDrawingInput) {
  const k = 1000
  const D = inp.D * k, Lsup = inp.Lsup * k, Lse = inp.Lse * k, tap = inp.tap * k, dweb = inp.dweb * k, ts = inp.ts * k
  const L = inp.spacings.map((v) => v * k), t = inp.t.map((v) => v * k)
  const sec = inp.sections.map((s) => ({ bfb: s.bfb * k, tfb: s.tfb * k, tw: s.tw * k, dw: s.dw * k, bff: s.bff * k, tff: s.tff * k }))
  const stiff = inp.stiff.map((s) => ({ ...s, spacing: s.spacing * k, offset: s.offset * k, depth: s.depth * k, thickness: s.thickness * k }))
  const w = inp.wheels && {
    ...inp.wheels, spacings: inp.wheels.spacings.map((v) => v * k), track: { b: inp.wheels.track.b * k, d: inp.wheels.track.d * k },
    ...Object.fromEntries((['Dw', 'tread', 'bh', 'd', 'y', 'b', 'c', 'Lr', 'a'] as const).map((f) => [f, inp.wheels![f] * k])) as Record<'Dw' | 'tread' | 'bh' | 'd' | 'y' | 'b' | 'c' | 'Lr' | 'a', number>,
    hubD: (inp.wheels.hubD ?? 2 * inp.wheels.d) * k,
  }
  const n = sec.length
  const sgn = inp.loc === 'Upstream' ? 1 : -1
  const yb: number[] = []
  L.slice(0, n).reduce((y, l) => { yb.push(y - l); return y - l }, D)
  const yw: number[] = []
  w?.spacings.slice(0, -1).reduce((y, l) => { yw.push(y - l); return y - l }, D)
  const zFront = (j: number) => Math.max(t[j], t[j + 1])
  const zBack = (j: number, web = sec[j].dw) => zFront(j) + sec[j].tff + web + sec[j].tfb
  const xw = Lsup / 2 // wheel / support centreline

  // end of the gate on the +x side: end plates [x0, x1], outer face, axle extent (Weight & cg E33/E34, Wheel Design)
  let plates: [number, number][], outer: number, axle: [number, number] = [0, 0]
  if (!w) {
    outer = Lsup / 2
    plates = [[outer - 2 * stiff[0].thickness, outer]] // bulkhead: twice the stiffener thickness, as Weight & cg
  } else if (w.double) {
    const Sr = w.bh + 2 * w.b + w.c
    plates = [-1, 1].map((s) => [xw + s * Sr / 2 - w.c / 2, xw + s * Sr / 2 + w.c / 2])
    outer = xw + Sr / 2 + w.c / 2
    axle = [plates[0][0], outer]
  } else {
    outer = xw - w.bh / 2 - w.b
    const xa = outer - w.c / 2 - w.Lr
    plates = [[outer - w.c, outer], [xa - w.a / 2, xa + w.a / 2]]
    axle = [xa - w.a / 2, xw + w.bh / 2]
  }
  const W2 = w ? outer + ts : outer // half the skin plate width
  const sides = [-1, 1]
  const mirror = (s: number, a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-b, -a])
  const webAt = (j: number, x: number) => { // web depth across the span: dweb at the support, dw from tap inwards
    const s = Lsup / 2 - Math.abs(x)
    return tap > 0 && s < tap ? inp.dweb * k + (sec[j].dw - dweb) * Math.max(s, 0) / tap : sec[j].dw
  }
  const seals = { lintel: inp.seals.lintel, side: { type: inp.seals.side.type, dims: inp.seals.side.dims ?? inp.seals.lintel.dims }, sill: inp.seals.sill }
  const xs0 = stiffenerX(stiff[0])

  // ------------------------------------------------------------ elevation, viewed from the beam side
  const el = view(`ELEVATION (VIEWED FROM ${sgn > 0 ? 'DOWNSTREAM' : 'UPSTREAM'})`)
  const E = (x: number, y: number): Pt => [x, y]
  el.shapes.push(box(E, -W2, 0, W2, D, 'outline'))
  const panelY = (p: number): [number, number] => [p < n ? yb[p] + sec[p].bfb / 2 : 0, p > 0 ? yb[p - 1] - sec[p - 1].bfb / 2 : D]
  const vMember = (x0: number, x1: number, panels: number[]) => panels.forEach((p) => {
    const [a, b] = panelY(p)
    if (b > a) el.shapes.push(box(E, x0, a, x1, b, 'outline'))
  })
  const all = Array.from({ length: n + 1 }, (_, p) => p)
  for (const s of sides) for (const [a, b] of plates) vMember(...mirror(s, a, b), all)
  stiff.forEach((st, p) => stiffenerX(st).forEach((x) => vMember(x - st.thickness / 2, x + st.thickness / 2, [p])))
  sec.forEach((b, j) => el.shapes.push(box(E, -outer, yb[j] - b.bfb / 2, outer, yb[j] + b.bfb / 2, 'outline')))
  if (w) for (const s of sides) for (const y of yw) {
    const [a0, a1] = mirror(s, ...axle)
    el.shapes.push(
      box(E, a0, y - w.d / 2, a1, y + w.d / 2, 'outline', { fill: true }),
      box(E, s * xw - w.bh / 2, y - w.hubD / 2, s * xw + w.bh / 2, y + w.hubD / 2, 'outline', { fill: true }),
      box(E, s * xw - w.tread / 2, y - w.Dw / 2, s * xw + w.tread / 2, y + w.Dw / 2, 'outline', { fill: true }),
      seg(E(s * xw - w.bh / 2 - 30, y), E(s * xw + w.bh / 2 + 30, y), 'center'),
    )
  }
  // seals are on the skin plate face: hidden from the beam side
  const side = sealParts(seals.side.type, seals.side.dims)
  for (const s of sides) {
    const [x0, x1] = mirror(s, Lse / 2 - side.uc, Lse / 2 - side.uc + side.u1)
    el.shapes.push(box(E, x0, 0, x1, D, 'hidden'))
  }
  if (seals.lintel.type !== 'No Lintel Seal') {
    const l = sealParts(seals.lintel.type, seals.lintel.dims)
    el.shapes.push(box(E, -Lse / 2, D - l.uc, Lse / 2, D - l.uc + l.u1, 'hidden'))
  }
  const sill = sealParts(seals.sill.type, seals.sill.dims)
  const sillY: [number, number] = seals.sill.type === 'Wedge Seal' ? [sill.uc, sill.u1] : [sill.uc - sill.u1, sill.uc]
  el.shapes.push(box(E, -Lse / 2, sillY[0], Lse / 2, sillY[1], 'hidden'))
  el.shapes.push(seg([0, -0.04 * D], [0, 1.04 * D], 'center'))
  if (w) for (const s of sides) el.shapes.push(seg([s * xw, -0.04 * D], [s * xw, 1.04 * D], 'center'))
  const yCut = (D + yb[0] + Math.max(sec[0].bff, sec[0].bfb) / 2) / 2
  el.cuts.push({ a: [0, -0.08 * D], b: [0, 1.08 * D], dir: [1, 0], name: 'A' }, { a: [-W2 - 0.04 * D, yCut], b: [W2 + 0.04 * D, yCut], dir: [0, -1], name: 'B' })
  const xRight = Math.max(W2, w ? xw + w.tread / 2 : 0)
  el.dims.push(
    { a: [-Lse / 2, 0], b: [Lse / 2, 0], dir: 'h', off: -12 },
    { a: [-Lsup / 2, 0], b: [Lsup / 2, 0], dir: 'h', off: -20 },
    ...(Math.abs(2 * W2 - Lsup) > 0.5 ? [{ a: [-W2, 0], b: [W2, 0], dir: 'h', off: -28 } as Dim] : []),
    ...chain([D, ...yb, 0], (y) => [-W2, y], 'v', -10),
    { a: [-W2, D], b: [-W2, 0], dir: 'v', off: -20 },
    ...(w ? chain([D, ...yw, 0], (y) => [xRight, y], 'v', 10) : []),
  )
  const i0 = xs0.findIndex((x) => x >= 0)
  if (i0 >= 0 && i0 + 1 < xs0.length) el.dims.push({ a: [xs0[i0], D], b: [xs0[i0 + 1], D], dir: 'h', off: 10, text: `${r0(stiff[0].spacing)} TYP` })
  const xMark = xs0.includes(0) ? stiff[0].spacing / 2 : 0
  sec.forEach((_, j) => el.labels.push({ at: [xMark, yb[j]], text: `B${j + 1}` }))

  // ------------------------------------------------------------ section A-A at midspan, looking towards +x
  const sa = view('SECTION A-A')
  const Z = (z: number, y: number): Pt => [sgn * z, y]
  if (w) {
    sa.shapes.push(box(Z, w.y + w.Dw / 2, 0, w.y + w.Dw / 2 + w.track.d, D, 'thin'))
    for (const y of yw) sa.shapes.push(
      { k: 'circle', c: Z(w.y, y), r: w.Dw / 2, layer: 'outline' }, { k: 'circle', c: Z(w.y, y), r: w.d / 2, layer: 'outline' },
      seg(Z(w.y - w.Dw / 2 - 30, y), Z(w.y + w.Dw / 2 + 30, y), 'center'), seg(Z(w.y, y - w.Dw / 2 - 30), Z(w.y, y + w.Dw / 2 + 30), 'center'),
    )
  }
  sa.shapes.push(box(Z, ts, 0, ts + dweb, D, 'outline', { fill: true })) // end plate beyond
  const webY = (p: number): [number, number] => [p < n ? yb[p] + sec[p].tw / 2 : 0, p > 0 ? yb[p - 1] - sec[p - 1].tw / 2 : D]
  stiff.forEach((st, p) => sa.shapes.push(box(Z, t[p], webY(p)[0], t[p] + st.depth, webY(p)[1], stiffenerX(st).includes(0) ? 'cut' : 'outline', { fill: true })))
  t.forEach((tk, p) => sa.shapes.push(box(Z, 0, p < n ? yb[p] : 0, tk, p > 0 ? yb[p - 1] : D, 'cut')))
  sec.forEach((b, j) => {
    const z0 = zFront(j), y = yb[j]
    sa.shapes.push(
      box(Z, z0, y - b.bff / 2, z0 + b.tff, y + b.bff / 2, 'cut'),
      box(Z, z0 + b.tff, y - b.tw / 2, z0 + b.tff + b.dw, y + b.tw / 2, 'cut'),
      box(Z, z0 + b.tff + b.dw, y - b.bfb / 2, zBack(j), y + b.bfb / 2, 'cut'),
    )
    sa.notes.push({ at: Z(zBack(j), y), text: `B${j + 1} ${inp.names[j]}`, dx: sgn * 12, dy: 0 })
  })
  // lintel: bulb centre on the top seal line D, bars below; sill: bulb (or the wedge, clamp flush) at the bottom
  const lintelF = (u: number, v: number) => Z(-v, D - sealParts(seals.lintel.type, seals.lintel.dims).uc + u)
  const lintel = seals.lintel.type !== 'No Lintel Seal' ? placeSeal(seals.lintel.type, seals.lintel.dims, lintelF) : undefined
  const wedgeSill = seals.sill.type === 'Wedge Seal'
  const sillF = (u: number, v: number) => Z(-v, wedgeSill ? u : sill.uc - u)
  const sillSeal = placeSeal(seals.sill.type, seals.sill.dims, sillF)
  sa.shapes.push(...(lintel?.shapes ?? []), ...sillSeal.shapes)
  if (wedgeSill) {
    const yS = sill.uc + seals.sill.dims.delta // sill face, with the seal precompressed
    sa.shapes.push(seg(Z(-sill.w1 - 40, yS), Z(Math.max(zBack(n - 1), w ? w.y + w.Dw / 2 : 0) + 40, yS), 'thin'))
  }
  sa.dims.push({ a: Z(0, D), b: Z(zBack(0), yb[0] + sec[0].bfb / 2), dir: 'h', off: 10 })
  if (w) sa.dims.push({ a: Z(0, 0), b: Z(w.y, yw[yw.length - 1]), dir: 'h', off: -12, text: `${r0(w.y)} AXLE` })
  sa.notes.push({ at: Z(t[0] / 2, (D + yb[0]) / 2), text: `SKIN PL ${r0(t[0])}`, dx: -sgn * 14, dy: 6 })
  if (w) sa.notes.push({ at: Z(w.y + w.Dw / 2 * Math.SQRT1_2, yw[0] + w.Dw / 2 * Math.SQRT1_2), text: `WHEEL %%c${r0(w.Dw)}`, dx: sgn * 10, dy: 8 })
  sa.arrows.push({ at: Z(0, D), off: [-28, 22], dir: [1, 0], text: 'FLOW' })

  // ------------------------------------------------------------ section B-B above beam 1, looking down
  const pl = view('SECTION B-B')
  const X = (x: number, z: number): Pt => [x, -sgn * z]
  if (w) for (const s of sides) {
    const [a0, a1] = mirror(s, ...axle)
    pl.shapes.push(
      box(X, s * xw - w.track.b / 2, w.y + w.Dw / 2, s * xw + w.track.b / 2, w.y + w.Dw / 2 + w.track.d, 'thin'),
      box(X, a0, w.y - w.d / 2, a1, w.y + w.d / 2, 'outline', { fill: true }),
      box(X, s * xw - w.bh / 2, w.y - w.hubD / 2, s * xw + w.bh / 2, w.y + w.hubD / 2, 'outline', { fill: true }),
      box(X, s * xw - w.tread / 2, w.y - w.Dw / 2, s * xw + w.tread / 2, w.y + w.Dw / 2, 'outline', { fill: true }),
      seg(X(s * xw, w.y - w.Dw / 2 - 30), X(s * xw, w.y + w.Dw / 2 + 30), 'center'),
      seg(X(a0 - 30, w.y), X(a1 + 30, w.y), 'center'),
    )
  }
  // beam 1 below the cut: front face, flange lines, tapered back flange
  const xsB = [...new Set([-outer, -(Lsup / 2 - tap), Lsup / 2 - tap, outer].map((x) => Math.max(-outer, Math.min(outer, x))))].sort((a, b) => a - b)
  const z0 = zFront(0), b0 = sec[0]
  const webLine = xsB.map((x) => X(x, z0 + b0.tff + webAt(0, x)))
  const backLine = xsB.map((x) => X(x, z0 + b0.tff + webAt(0, x) + b0.tfb))
  pl.shapes.push(
    poly([X(-outer, z0), X(outer, z0), ...backLine.slice().reverse()], 'outline', { fill: true }),
    seg(X(-outer, z0 + b0.tff), X(outer, z0 + b0.tff), 'outline'),
    poly(webLine, 'outline', {}, false),
  )
  for (const x of xs0) pl.shapes.push(box(X, x - stiff[0].thickness / 2, t[0], x + stiff[0].thickness / 2, t[0] + stiff[0].depth, 'cut'))
  for (const s of sides) for (const [a, b] of plates) {
    const [x0, x1] = mirror(s, a, b)
    pl.shapes.push(box(X, x0, ts, x1, ts + dweb, 'cut'))
  }
  pl.shapes.push(box(X, -W2, 0, W2, t[0], 'cut'))
  const sideSeals = sides.map((s) => placeSeal(seals.side.type, seals.side.dims, (u, v) => X(s * (Lse / 2 - side.uc + u), -v)))
  for (const ss of sideSeals) pl.shapes.push(...ss.shapes)
  const zMax = Math.max(zBack(0), w ? w.y + w.Dw / 2 + w.track.d : 0)
  pl.shapes.push(seg(X(0, -side.w1 - 60), X(0, zMax + 60), 'center'))
  if (tap > 0 && tap < Lsup / 2) pl.dims.push({ a: X(Lsup / 2 - tap, zBack(0)), b: X(Math.min(Lsup / 2, outer), z0 + b0.tff + webAt(0, outer) + b0.tfb), dir: 'h', off: -10, text: `${r0(tap)} TAPER` })
  pl.dims.push({ a: X(outer, 0), b: X(outer, z0 + b0.tff + webAt(0, outer) + b0.tfb), dir: 'v', off: 10 })
  pl.notes.push(
    { at: X(-Lsup / 4, z0 + b0.tff + b0.dw / 2), text: `B1 ${inp.names[0]}, WEB ${r0(dweb)} DEEP AT SUPPORT`, dx: 8, dy: -12 },
    ...(i0 >= 0 ? [{ at: X(xs0[i0], t[0] + stiff[0].depth / 2), text: `${stiff[0].count} STIFF PL ${r0(stiff[0].thickness)} x ${r0(stiff[0].depth)}`, dx: 10, dy: 10 }] : []),
  )
  pl.arrows.push({ at: X(-W2, 0), off: [-16, 9], dir: [0, -1], text: 'FLOW' })

  // ------------------------------------------------------------ section C-C through the top wheel axle (wheel detail only)
  const ax = view('SECTION C-C')
  if (w) {
    const p = yb.filter((y) => y > yw[0]).length // the skin plate panel the axle passes
    for (const s of sides) {
      const [a0, a1] = mirror(s, ...axle)
      ax.shapes.push(
        box(X, s * xw - w.track.b / 2, w.y + w.Dw / 2, s * xw + w.track.b / 2, w.y + w.Dw / 2 + w.track.d, 'thin'),
        box(X, s * xw - w.tread / 2, w.y - w.Dw / 2, s * xw + w.tread / 2, w.y + w.Dw / 2, 'cut'),
        box(X, s * xw - w.bh / 2, w.y - w.hubD / 2, s * xw + w.bh / 2, w.y + w.hubD / 2, 'cut'),
        box(X, a0, w.y - w.d / 2, a1, w.y + w.d / 2, 'cut', { rubber: true }), // opposite hatch: the axle is a separate part
        seg(X(s * xw, w.y - w.Dw / 2 - 30), X(s * xw, w.y + w.Dw / 2 + 30), 'center'),
        seg(X(a0 - 30, w.y), X(a1 + 30, w.y), 'center'),
      )
      for (const [a, b] of plates) {
        const [x0, x1] = mirror(s, a, b)
        ax.shapes.push(box(X, x0, ts, x1, ts + dweb, 'cut'))
      }
    }
    for (const x of stiffenerX(stiff[p])) ax.shapes.push(box(X, x - stiff[p].thickness / 2, t[p], x + stiff[p].thickness / 2, t[p] + stiff[p].depth, 'cut'))
    ax.shapes.push(box(X, -W2, 0, W2, t[p], 'cut'))
    ax.shapes.push(...sides.flatMap((s) => placeSeal(seals.side.type, seals.side.dims, (u, v) => X(s * (Lse / 2 - side.uc + u), -v)).shapes))
  }

  // ------------------------------------------------------------ details: windows on A-A, B-B and C-C
  const details: Detail[] = []
  const win = (f: (p: number, q: number) => Pt, p0: number, q0: number, p1: number, q1: number): Detail['win'] => {
    const a = f(p0, q0), b = f(p1, q1)
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
  }
  if (w) {
    const x0 = Math.min(...plates.map((p) => p[0]), xw - w.tread / 2, axle[0]) - 80, x1 = Math.max(W2, axle[1], xw + w.tread / 2) + 80
    const zOut = w.y + w.Dw / 2, toSkin = sgn // paper y direction towards the skin plate
    const xr = Math.max(axle[1], xw + w.tread / 2)
    const dims: Dim[] = [
      w.double
        ? { a: X((plates[0][0] + plates[0][1]) / 2, zOut), b: X((plates[1][0] + plates[1][1]) / 2, zOut), dir: 'h', off: -10 * toSkin, text: `${r0(w.bh + 2 * w.b + w.c)} Sr` }
        : { a: X(plates[1][0] + w.a / 2, zOut), b: X(plates[0][0] + w.c / 2, zOut), dir: 'h', off: -10 * toSkin, text: `${r0(w.Lr)} Lr` },
      { a: X(xw - w.bh / 2, zOut), b: X(xw + w.bh / 2, zOut), dir: 'h', off: -18 * toSkin },
      { a: X(plates[0][1], w.y - w.hubD / 2), b: X(xw - w.bh / 2, w.y - w.hubD / 2), dir: 'h', off: 8 * toSkin, text: `${r0(w.b)} b` },
      { a: X(xw + w.tread / 2, w.y - w.Dw / 2), b: X(xw + w.tread / 2, w.y + w.Dw / 2), dir: 'v', base: xr, off: 8 },
      { a: X(xr, 0), b: X(xr, w.y), dir: 'v', off: 18 },
    ]
    details.push({
      title: `DETAIL 1: WHEEL AND AXLE, SECTION C-C ON WHEEL W1 AXIS (${w.double ? 'DOUBLE SUPPORT' : 'CANTILEVERED'})`, src: 'axle', win: win(X, x0, -side.w1 - 30, x1, w.y + w.Dw / 2 + w.track.d + 40), dims,
      notes: [
        { at: X(xw, w.y), text: `AXLE %%c${r0(w.d)}`, dx: 14, dy: 10 },
        { at: X(xw + w.tread / 2, w.y + w.Dw / 2), text: `TRACK ${r0(w.track.b)} x ${r0(w.track.d)}`, dx: 12, dy: -8 },
        { at: X(plates[0][0], ts + dweb * 0.8), text: `END PL ${r0(w.c)}${w.double ? '' : `, INNER PL ${r0(w.a)}`}`, dx: -40, dy: -10 * sgn },
      ],
    })
  }
  const sealDetail = (title: string, src: 'section' | 'plan', p: ReturnType<typeof placeSeal>, f: (u: number, v: number) => Pt, beamSide: number) => {
    const a = f(p.s.u[0] - 40, p.s.w1 + 30), b = f(Math.max(...p.s.u, p.s.u1) + 40, -beamSide)
    details.push({ title, src, win: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], dims: p.dims, notes: p.notes })
  }
  const deep = t[0] + 40
  if (lintel) sealDetail(`DETAIL ${details.length + 1}: LINTEL SEAL`, 'section', lintel, lintelF, deep)
  sealDetail(`DETAIL ${details.length + 1}: SIDE SEAL`, 'plan', sideSeals[1], (u, v) => X(Lse / 2 - side.uc + u, -v), deep)
  sealDetail(`DETAIL ${details.length + 1}: SILL SEAL`, 'section', sillSeal, sillF, deep)
  const seen = new Map<string, number[]>()
  inp.names.forEach((nm, j) => seen.set(nm, [...(seen.get(nm) ?? []), j]))
  for (const [nm, js] of seen) {
    const j = js[0], b = sec[j], y = yb[j], z0j = zFront(j), half = Math.max(b.bff, b.bfb) / 2
    details.push({
      title: `DETAIL ${details.length + 1}: ${js.map((i) => `B${i + 1}`).join(', ')} ${nm}`, src: 'section', win: win(Z, -40, y - half - 40, zBack(j) + 40, y + half + 40),
      dims: [
        ...chain([z0j, z0j + b.tff, z0j + b.tff + b.dw, zBack(j)], (z) => Z(z, y + half), 'h', 8),
        { a: Z(0, y + half), b: Z(zBack(j), y + half), dir: 'h', off: 16 },
        { a: Z(zBack(j), y - b.bfb / 2), b: Z(zBack(j), y + b.bfb / 2), dir: 'v', off: sgn * 8 },
        { a: Z(z0j, y - b.bff / 2), b: Z(z0j, y + b.bff / 2), dir: 'v', base: 0, off: -sgn * 8 },
      ],
      notes: [
        { at: Z(z0j + b.tff + b.dw / 2, y), text: `WEB ${r0(b.tw)} THK`, dx: 4, dy: -12 },
        { at: Z(t[j] / 2, y - half - 20), text: `SKIN PL ${r0(t[j])}/${r0(t[j + 1])}`, dx: -sgn * 10, dy: -8 },
      ],
    })
  }

  // schedule rows: panels, beams and wheels top to bottom
  const elev = (y: number) => (y / 1000).toFixed(3)
  const schedule: string[][] = [['MARK', 'SIZE', 'CL FROM SILL (M)', 'HEIGHT (MM)', 'SKIN PL', 'STIFFENERS']]
  for (let p = 0; p <= n; p++) {
    const st = stiff[p]
    schedule.push([`P${p}`, 'PANEL', '', r0(L[p]), r0(t[p]), `${st.count} x PL ${r0(st.thickness)} x ${r0(st.depth)} @ ${r0(st.spacing)}`])
    if (p < n) schedule.push([`B${p + 1}`, inp.names[p], elev(yb[p]), '', '', ''])
  }
  if (w) yw.forEach((y, i) => schedule.push([`W${i + 1}`, `WHEEL %%c${r0(w.Dw)} x ${r0(w.tread)}`, elev(y), '', '', `2 OFF, AXLE %%c${r0(w.d)}`]))

  const warnings: string[] = []
  const sd = seals.sill.dims
  if (wedgeSill && (sd.sh ?? 0) <= sd.cw) warnings.push(`Sill wedge seal: the rubber (h = ${sd.sh ?? 0} mm) is not longer than the clamp bar (cw = ${sd.cw} mm), so it does not reach the sill. Check the Seals inputs.`)

  return { elevation: el, section: sa, plan: pl, axle: ax, details, schedule, warnings, info: { W: 2 * W2, D, Lsup, Lse, n, yb, yw, outer, plates, sgn } }
}
export type GateModel = ReturnType<typeof gateModel>
