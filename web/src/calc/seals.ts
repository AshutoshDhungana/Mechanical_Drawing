// Seals sheet: seal spring constant, water load on the seal and friction for the lintel, side and sill seals.
// Seal dimensions in mm (as the sheet), pressure in N/mm², lengths in m, forces in N.

export type SealType = 'J Seal' | 'Center Bulb Seal' | 'Wedge Seal' | 'No Lintel Seal'
export const lintelTypes: SealType[] = ['J Seal', 'Center Bulb Seal', 'No Lintel Seal']
export const sideTypes: SealType[] = ['J Seal', 'Center Bulb Seal']
export const sillTypes: SealType[] = ['J Seal', 'Center Bulb Seal', 'Wedge Seal']

export interface SealDims {
  B: number // bulb diameter
  t: number // seal stem thickness
  delta: number // deflection (precompression)
  x: number // projection from clamp
  mu: number // static coefficient of friction
  cw: number // clamp / mount bar width
  ct: number // clamp bar thickness
  mt: number // mount bar thickness
  tbt?: number // top bar thickness (wedge sill seal)
  sh?: number // seal height (wedge sill seal)
}

export interface SealInput { type: SealType; dims: SealDims }

export interface SealResult {
  active: boolean // false for a wedge seal or no lintel seal: no stem-bending friction calc
  k: number // spring constant, N/mm per mm of seal
  pressure: number // N/mm²
  length: number // m
  F: number // load on the seal from water pressure, N/mm
  deflectionLoad: number // N
  frictionDeflection: number // N
  frictionWater: number // N
  total: number // N
}

/** One seal block (Seals!C17:C24 for the lintel; C39:C46 side; C63:C70 sill). */
export function seal({ type, dims: s }: SealInput, pressure: number, length: number): SealResult {
  if (type === 'Wedge Seal' || type === 'No Lintel Seal') {
    return { active: false, k: 0, pressure, length, F: 0, deflectionLoad: 0, frictionDeflection: 0, frictionWater: 0, total: 0 }
  }
  const bulb = type === 'Center Bulb Seal'
  // the stiffness constants are psi-based (×0.00689476 → MPa) and the dimensions are scaled to a reference seal
  const k = (bulb ? 171.304 : 28.551) * 0.00689476 * (s.t / 0.709 * (bulb ? 1.181 : 1.575) / s.x) ** 3 * s.delta / 0.787
  const e = s.B - s.delta - s.t / 2 // lever of the friction force about the stem
  const F = bulb ? pressure * s.x
    : (pressure / 2 * ((s.B - s.delta) ** 2 - (s.B - s.delta) * s.t + s.x ** 2) - s.mu * k * e) / (s.mu * e + s.x)
  const deflectionLoad = k * length * 1000
  const frictionDeflection = deflectionLoad * s.mu
  const frictionWater = s.mu * length * F * 1000
  return { active: true, k, pressure, length, F, deflectionLoad, frictionDeflection, frictionWater, total: frictionDeflection + frictionWater }
}

export interface SealsInput {
  lintel: SealInput
  side: { type: SealType; dims?: SealDims } // dims follow the lintel seal until set (Seals!C29:C37 = C7:C15)
  sill: SealInput
}

/**
 * headTop = head at the top seal (Beam Spacing F18 = HB − D), HB = head at the sill, D = gate height, Lse = seal span.
 * The sheet's sill block still has the old inch/lbf formulas (no unit conversion); the port uses the SI ones above.
 */
export function seals(inp: SealsInput, headTop: number, HB: number, D: number, Lse: number, rw: number) {
  return {
    lintel: seal(inp.lintel, rw * Math.max(headTop, 0) * 0.001, Lse), // the sheet goes negative above the water surface
    side: seal({ type: inp.side.type, dims: inp.side.dims ?? inp.lintel.dims }, (headTop + HB) * rw / 2 * 0.001, 2 * D),
    sill: seal(inp.sill, rw * HB * 0.001, Lse),
  }
}
export type SealsResult = ReturnType<typeof seals>

export const defaultSeals: SealsInput = {
  lintel: { type: 'J Seal', dims: { B: 44, t: 14, delta: 3, x: 50, mu: 0.2, cw: 80, ct: 12, mt: 12 } },
  side: { type: 'J Seal' },
  // the workbook's sill cells hold inch values left by the VBA (1.75, 0.125, 1.5, 0.5625); replaced with the lintel's mm values
  sill: { type: 'Wedge Seal', dims: { B: 44, t: 12, delta: 3, x: 50, mu: 0.2, cw: 60, ct: 12, mt: 12, tbt: 12, sh: 50 } },
}
