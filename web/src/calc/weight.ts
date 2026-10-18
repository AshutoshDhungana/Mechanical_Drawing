// Weight & cg sheet: estimated gate weight in air and centre of gravity (from the skin plate face, positive
// downstream into the beams). Ballast is not included. Units: m, kg.
import type { BeamSection } from './defineBeam'
import type { SealsInput } from './seals'
import type { GateType, Stiffener } from './stiffeners'

const STEEL = 7850
const RUBBER = 0.054 * 27679.905 // 0.054 lb/in³ in kg/m³ (J16)
const IN8 = 0.125 * 25.4 // CONVERT(0.125,"in","mm")

export interface WeightItem {
  group: string
  name: string
  count: number
  width?: number // along the span
  height?: number
  depth?: number // normal to the skin plate
  diameter?: number
  volume: number
  density?: number // kg/m³
  unit?: number // kg per item (wheels, axles)
  weight: number
  z: number // cg from the skin plate face
}

const box = (group: string, name: string, count: number, width: number, height: number, depth: number, density: number, z: number): WeightItem => {
  const volume = count * width * height * depth
  return { group, name, count, width, height, depth, volume, density, weight: volume * density, z }
}
const rod = (group: string, name: string, count: number, length: number, diameter: number, z: number, horizontal: boolean): WeightItem => {
  const volume = Math.PI * diameter ** 2 / 4 * length * count
  return { group, name, count, ...(horizontal ? { width: length } : { height: length }), diameter, volume, density: RUBBER, weight: volume * RUBBER, z }
}

export interface WeightInput {
  gateType: GateType
  D: number // gate height
  Lsup: number
  Lse: number
  seals: SealsInput
  spacings: number[] // Beam Spacing, n + 1
  sections: BeamSection[] // n
  t: number[] // skin plate thickness per panel, n + 1
  stiff: Stiffener[] // per panel, n + 1
  tap: number
  dweb: number
  wheels: { count: number; wheelKN: number; axleKN: number; z: number } // count = 2 × wheels per side
  /** Skin plate width and vertical end beam thickness from the wheel arrangement (E33, E34); see weightEnds. */
  ends: { skinWidth: number; endBeamT: number }
  erbisti: { clearSpan: number; clearHeight: number; head: number }
}

/** E33/E34 inputs: the wheel arrangement sets how far the skin plate extends and how thick the end beams are. */
export function weightEnds(gateType: GateType, Lsup: number, ts: number, w: { cantBh: number; cantB: number; cantC: number; cantA: number; dsLr: number; dsC: number }) {
  if (gateType === 'Bulkhead (no wheels)') return { skinWidth: Lsup, endBeamT: 0 } // bulkhead: twice each panel's stiffener thickness
  if (gateType === 'Fixed Wheel (cantilevered)') return { skinWidth: Lsup + 2 * (-w.cantBh / 2 - w.cantB + ts), endBeamT: 2 * (w.cantA + w.cantC) }
  return { skinWidth: Lsup + 2 * (w.dsLr / 2 + 2 / 3 * w.dsC + ts), endBeamT: 4 * w.dsC }
}

export function weight(inp: WeightInput) {
  const items: WeightItem[] = []
  const { seals: s, D, spacings: L, sections: sec, t, stiff, dweb } = inp
  const n = sec.length

  // seals: rubber on the upstream side of the skin plate (negative z)
  const side = s.side.dims ?? s.lintel.dims
  const sg = `Side - ${s.side.type}`
  const sStem = (side.x + side.cw - IN8) / 1000
  const sk = s.side.type === 'J Seal' ? 2 : 4
  items.push(
    box(sg, 'Mount bar', sk, side.cw / 1000, D, side.mt / 1000, STEEL, -side.mt / 2000),
    rod(sg, 'Bulb', 2, D, side.B / 1000, -side.mt / 1000 - side.B / 2000, false),
    box(sg, 'Stem', sk, sStem, D, side.t / 1000, RUBBER, -side.mt / 1000 - side.t / 2000),
    box(sg, 'Clamp bar', sk, side.cw / 1000, D, side.ct / 1000, STEEL, -(side.mt + side.t + side.ct / 2) / 1000),
  )
  const lt = s.lintel, l = lt.dims
  if (lt.type !== 'No Lintel Seal') {
    const lg = `Lintel - ${lt.type}`
    const k = lt.type === 'J Seal' ? 1 : 2
    items.push(
      box(lg, 'Mount bar', k, inp.Lse, l.cw / 1000, l.mt / 1000, STEEL, -l.mt / 2000),
      rod(lg, 'Bulb', 1, inp.Lse, l.B / 1000, -l.mt / 1000 - l.B / 2000, true),
      box(lg, 'Stem', k, inp.Lse, (l.x + l.cw - IN8) / 1000, l.t / 1000, RUBBER, -l.mt / 1000 - l.t / 2000),
      box(lg, 'Clamp bar', k, inp.Lse, l.cw / 1000, l.ct / 1000, STEEL, -(l.mt + l.t + l.ct / 2) / 1000),
    )
  }
  const sl = s.sill, d = sl.dims, wedge = sl.type === 'Wedge Seal'
  const ig = `Sill - ${sl.type}`, sillLen = inp.Lse - 2 * sStem, k = sl.type === 'Center Bulb Seal' ? 2 : 1
  const bar = { t: (wedge ? d.tbt ?? 0 : d.cw) / 1000, depth: (wedge ? d.t + d.ct : d.mt) / 1000 }
  const back = wedge ? 0 : -bar.depth
  items.push(box(ig, wedge ? 'Top bar' : 'Mount bar', k, sillLen, bar.t, bar.depth, STEEL, -bar.depth / 2))
  // the sheet sizes the sill bulb with C51 un-scaled (an inch value in a mm cell) and an lbf-based density; the port uses mm and rubber
  if (!wedge) items.push(rod(ig, 'Bulb', 1, sillLen, d.B / 1000, -bar.depth - d.B / 2000, true))
  items.push(
    box(ig, wedge ? 'Seal' : 'Stem', k, sillLen, (wedge ? d.sh ?? 0 : d.x + d.cw - IN8) / 1000, d.t / 1000, RUBBER, back - d.t / 2000),
    box(ig, 'Clamp bar', k, sillLen, d.cw / 1000, d.ct / 1000, STEEL, back - d.t / 1000 - d.ct / 2000),
  )

  // wheels and axles
  const w = inp.wheels
  if (w.count > 0) {
    for (const [name, kN] of [['Wheels', w.wheelKN], ['Wheel axles', w.axleKN]] as const) {
      const unit = kN * 1000 / 9.81
      items.push({ group: name, name, count: w.count, volume: w.count * unit / STEEL, unit, weight: w.count * unit, z: w.z })
    }
  }

  // structure: top panel, then per beam: flanges, web, taper, panel below
  const W = inp.ends.skinWidth
  const panel = (k: number, group: string, skinZ0: number) => {
    const h = L[k] - ((k > 0 ? sec[k - 1].tw : 0) + (k < n ? sec[k].tw : 0)) / 2
    const st = stiff[k]
    const zEnd = k === 0 ? skinZ0 + dweb / 2 : t[k] + dweb / 2 // L34 uses the larger adjacent skin; L42 this panel's (as the sheet)
    items.push(
      box(group, 'Skinplate', 1, W, L[k], t[k], STEEL, t[k] / 2),
      box(group, 'Vertical End Beams', 1, inp.gateType === 'Bulkhead (no wheels)' ? 2 * st.thickness : inp.ends.endBeamT, h, dweb, STEEL, zEnd),
      box(group, 'Vertical Stiffeners', st.count, st.thickness, h, st.depth, STEEL, zEnd),
    )
  }
  panel(0, 'Top panel', Math.max(t[0], t[1]))
  sec.forEach((b, j) => {
    const group = `Beam ${j + 1}`
    const z0 = Math.max(t[j], t[j + 1])
    items.push(
      box(group, 'Front flange', 1, W, b.bff, b.tff, STEEL, z0 + b.tff / 2),
      box(group, 'Web', 1, W, b.tw, b.dw, STEEL, z0 + b.tff + b.dw / 2),
      box(group, 'Back flange', 1, W, b.bfb, b.tfb, STEEL, z0 + b.tff + b.dw + b.tfb / 2),
    )
    const taper = box(group, 'Subtract taper', -2, inp.tap, b.tw, b.dw - dweb, STEEL, z0 + b.tff + b.dw - (b.dw - dweb) / 3)
    items.push({ ...taper, volume: taper.volume / 2, weight: taper.weight / 2 }) // triangle
    panel(j + 1, group, z0)
  })

  const volume = items.reduce((a, i) => a + i.volume, 0)
  const mass = items.reduce((a, i) => a + i.weight, 0)
  const cg = items.reduce((a, i) => a + i.weight * i.z, 0) / mass
  const e = inp.erbisti
  const X = e.clearSpan ** 2 * e.clearHeight * e.head // AA4
  const erbisti = (X > 2000 ? 0.735 * X ** 0.697 : 0.886 * X ** 0.654) * 1000 / 9.81 // D8, kg
  return { items, volume, mass, cg, erbisti, diffPct: (mass - erbisti) / erbisti * 100 }
}
export type WeightResult = ReturnType<typeof weight>
