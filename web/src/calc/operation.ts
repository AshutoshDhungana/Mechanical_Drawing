// Operation sheet: hoist loads for raising and lowering the gate against its weight, wheel and seal friction and
// downpull, over the opening (0 = closed … 1 = fully open). Units: N (as the sheet), kg, m.
import type { SkinLocation } from './secProp'
import type { SealsResult } from './seals'
import type { GateType } from './stiffeners'

export interface OperationInput {
  ballast: number // ballast weight in air, kg
  ballastDensity: number // kg/m³
  bearingMu: number // wheel bearing friction coefficient
}

export interface OperationContext {
  gateType: GateType
  loc: SkinLocation
  rw: number // kN/m³
  HB: number
  D: number
  mass: number // gate weight in air, kg (Weight & cg D6)
  volume: number // steel + rubber volume, m³ (D5)
  hydrostatic: number // total hydrostatic load on the gate, kN (2 × Wheel Spacing G12)
  hardness: number // wheel/track hardness, BHN (active contact type)
  wheelD: number // wheel diameter (active contact type)
  axleD: number // axle diameter at the wheel
  seals: SealsResult
  downpull?: (x: number) => number // kN at opening ratio x (Downpull J60:DD60); undefined = none
}

export const openings = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] // columns E:O

/** One column of rows 15:31. */
export function operationAt(inp: OperationInput, c: OperationContext, x: number) {
  const wheels = c.gateType !== 'Bulkhead (no wheels)'
  // submerged fraction of the gate; the sheet's MIN(1, HB/D − x) goes negative once the gate leaves the water
  const submerged = Math.min(1, Math.max(0, c.HB / c.D - x))
  const weight = c.mass * 9.81 + inp.ballast * 9.81
    - (c.loc === 'Upstream' ? 0 : 1000 * c.rw * (c.volume + inp.ballast / inp.ballastDensity) * submerged)
  const rolling = (0.5 - (c.hardness - 150) / 150 * 0.3) / 1000 // C9, m (DIN 19704)
  const near = x <= 0.1 // lintel and sill seals bear only near the closed position
  const s = c.seals
  const rows = {
    bearing: wheels ? 1000 * inp.bearingMu * c.hydrostatic * c.axleD / c.wheelD * (1 - x) : 0,
    rolling: wheels ? rolling / (c.wheelD / 2) * c.hydrostatic * 1000 * (1 - x) : 0,
    lintelDeflection: near ? s.lintel.frictionDeflection : 0,
    lintelWater: near ? s.lintel.frictionWater : 0,
    sideDeflection: s.side.frictionDeflection * (1 - x),
    sideWater: s.side.frictionWater * (1 - x),
    sillDeflection: near ? s.sill.frictionDeflection : 0,
    sillWater: near ? s.sill.frictionWater : 0,
  }
  const friction = Object.values(rows).reduce((a, v) => a + v, 0)
  const downpull = x === 0 || x >= 1 || !c.downpull || c.loc !== 'Downstream' || !wheels ? 0 : c.downpull(x) * 1000
  const ratio = friction === 0 ? Infinity : weight / friction
  return {
    x, weight, ...rows, friction, downpull,
    lift: weight + friction + downpull,
    lower: weight - friction,
    preponderance: ratio > 2 ? Infinity : ratio * 100, // %; Infinity shows as "200+"
  }
}
export type OperationPoint = ReturnType<typeof operationAt>

export function operation(inp: OperationInput, c: OperationContext) {
  const columns = openings.map((x) => operationAt(inp, c, x))
  // Worksheet_Activate: scan 0..1 in 0.01 steps for the smallest and largest lifting load, starting from fully open
  const scan = Array.from({ length: 101 }, (_, i) => operationAt(inp, c, i / 100))
  const open = scan[100]
  const min = scan.reduce((m, p) => (p.lift < m.lift ? p : m), open)
  const max = scan.reduce((m, p) => (p.lift > m.lift ? p : m), open)
  return { rolling: (0.5 - (c.hardness - 150) / 150 * 0.3) / 1000, columns, min, max, lowerMin: Math.min(...scan.map((p) => p.lower)) }
}
export type OperationResult = ReturnType<typeof operation>

export const defaultOperation: OperationInput = { ballast: 0, ballastDensity: 7849.05, bearingMu: 0.02 }
