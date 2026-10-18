// Wheel Spacing sheet + WheelSpace VBA module. The module is a copy of BeamSpace (same solvers, same
// row layout), so this runs the Beam Spacing calculation with wheels in place of beams: each side's end
// beam carries half the seal span (Lse/2) and rests on the wheels.
import { beamSpacing, type BeamSpacingInput } from './beamSpacing'

export type WheelMethod = 'equal-load' | 'manual'
export const wheelMethods: Record<WheelMethod, string> = { 'equal-load': 'Equal load', manual: 'Manual' }

export interface WheelSpacingInput {
  n: number // wheels per side
  method: WheelMethod
  acc: number // rounding step, m
  seismic: boolean // E7: include the Westergaard term
  manual?: number[] // spacings[1..n] when method = 'manual'
}

/** bs = the Beam Spacing inputs (D, HB, Hp, alp, rw, Lsup); Lse = span between seal centrelines. */
export function wheelSpacing(inp: WheelSpacingInput, bs: BeamSpacingInput, Lse: number) {
  if (!Number.isInteger(inp.n) || inp.n < 2 || inp.n > 99) throw new RangeError('Number of wheels must be a whole number from 2 to 99')
  const r = beamSpacing({
    ...bs, n: inp.n, acc: inp.acc, alp: inp.seismic ? bs.alp : 0, manual: inp.manual,
    method: inp.method === 'manual' ? 'manual' : 'equal-load-exact',
  })
  const side = Lse / 2
  const wheels = r.beams.map((b) => ({
    head: b.head, pressure: b.pressure,
    loadPerM: b.load, // N: reaction per metre of gate width, kN/m
    load: b.load * side, // G: wheel load, kN
    moment: b.moment * side, // H: end beam moment over the wheel, kN·m
  }))
  return {
    spacings: r.spacings, heads: r.heads, pressures: r.pressures, wheels,
    totalLoad: r.totalLoad * side, // G12, per side
    maxLoad: Math.max(...wheels.map((w) => w.load)), // K4
    maxMoment: Math.max(...wheels.map((w) => w.moment)), // K3; ponytail: moments over the wheels only, span moments not checked (flagged)
    warnings: r.warnings.map((w) => w.replace(/beam/g, 'wheel')),
  }
}
export type WheelSpacingResult = ReturnType<typeof wheelSpacing>
