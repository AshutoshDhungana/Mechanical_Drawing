// Downpull sheet (hidden in the workbook unless the skin plate is downstream on a wheeled gate):
// hydraulic downpull on a partially open gate with a downstream lintel seal, per Naudascher, "Hydrodynamic
// Forces". Fully ventilated flow downstream assumed. Units: m, m³/s, kN.

export type GateLocation = 'Tunnel' | 'Face'
export const bottomAngles = [0, 20, 30, 45] as const // θ, degrees
export const lipRatios = [0, 0.15, 0.3, 0.45, 0.6] as const // e/d (used when θ = 0)

export interface DownpullInput {
  location: GateLocation
  theta: number // gate bottom angle, degrees
  lip: number // bottom lip ratio e/d
  a1: number // clearance upstream of the gate (Tunnel only)
  a2pp: number // recess depth a″2
  Q: number // maximum total flow, m³/s
  x: number // gate opening ratio shown in the single-opening column (C25)
}

export interface DownpullContext {
  HB: number // head to sill
  D: number // gate height
  Lse: number // seal span
  rw: number // unit weight of water
  a2: number // lintel seal protrusion = (lintel bulb + mount bar) / 1000 (C9)
  d: number // gate thickness = depth of the bottom beam (C14)
  tsBottom: number // skin plate thickness below the bottom beam (SecProp, C58)
}

const g = 9.81
const poly = (c: number[], x: number) => c.reduceRight((s, k) => s * x + k, 0)

// curve fits from the workbook (coefficients c0, c1, …)
const C2_FIT = [0, 0.95625, -3.22188, 18.08333, -26.01563, 11.19792] // C20, in a″2/(a2 + a″2)
const CC_FIT = [0.73, -0.00867, 0.079293, 0.058923] // C29
const EDDY_FIT = [1.13, -9.36599, 58.50411, -187.02067, 323.5414, -287.91644, 104.16659] // C45, in Cc·x
const KB_FITS = { // downpull coefficient κB, C30:C37
  t45: [1, -2.51659, -0.4766, 61.46441, -377.30463, 1335.14131, -3088.2976, 4690.56847, -4476.17076, 2421.04235, -564.45037],
  t30: [1, -4.472, -8.0835, 192.44, -923.22, 2185, -2798.6, 1856.3, -500.47],
  t20: [1, -8.6888, 40.798, -105.42, 71.062, 286.04, -728.16, 658.23, -214.86],
  e0: [1, -21.076, 111.5, -225.18, 80.822, 284.71, -352.57, 120.8],
  e15: [1, -6.3442, -18.781, 238.82, -734.89, 1035.2, -691.15, 176.11],
  e30: [1, -3.3532, -12.048, 85.668, -182.68, 176.39, -64.975],
  e45: [1, -1.4234, -16.176, 83.553, -165.72, 156.6, -57.837],
  e60: [1, -1.1966, -6.1008, 19.619, 6.459, -78.199, 99.043, -40.625],
}

/** C38: the curve for the bottom angle, or (θ = 0) for the lip ratio. */
function kappaB(theta: number, lip: number, x: number) {
  const f = theta === 30 ? KB_FITS.t30 : theta === 45 ? KB_FITS.t45 : theta === 20 ? KB_FITS.t20
    : lip === 0 ? KB_FITS.e0 : lip === 0.15 ? KB_FITS.e15 : lip === 0.3 ? KB_FITS.e30 : lip === 0.45 ? KB_FITS.e45 : KB_FITS.e60
  return poly(f, x)
}

/** Opening-independent values (C9:C21, J23). */
export function downpullSetup(inp: DownpullInput, c: DownpullContext) {
  const yo = inp.location === 'Face' ? c.HB : c.D // C17
  const ratio = inp.a2pp / (c.a2 + inp.a2pp) // C19
  const yc = Math.cbrt(27 * inp.Q ** 2 / 8 / c.Lse ** 2 / g) // H11
  const hmax = c.HB > yc // J23: largest downstream head that can pass Q
    ? c.HB / 3 * (2 * Math.cos((Math.acos(1 - 27 * inp.Q ** 2 / 4 / c.Lse ** 2 / g / c.HB ** 3) + 4 * Math.PI) / 3) + 1)
    : c.D
  return { yo, e: inp.lip * c.d, As: c.Lse * c.a2, ratio, C2: poly(C2_FIT, ratio), Ao: c.Lse * yo, yc, hmax }
}

/** One opening ratio x (a column of C25:C63). */
export function downpullAt(inp: DownpullInput, c: DownpullContext, s: ReturnType<typeof downpullSetup>, x: number) {
  const { Lse, rw, a2 } = c
  const y = x * s.yo
  const Cc = poly(CC_FIT, x)
  const kB = kappaB(inp.theta, inp.lip, x)
  const h = Cc * y // downstream head
  const Vj = h > s.hmax ? inp.Q / h / Lse : Math.sqrt(2 * g * (c.HB - h))
  const Qp = h * Lse * Vj // discharge under the gate Q′
  const C1 = 1 / Math.sqrt(1.15849 * x + 1.26922)
  const xi = poly(EDDY_FIT, Cc * x) // corner eddy coefficient
  const kTpp = inp.location === 'Face' ? 1 : 1 / (1 + (s.C2 * a2 / C1 / inp.a1) ** 2)
  const Qp62 = xi * h ** 2 * (kTpp * (s.C2 * Lse * Vj * a2) ** 2 - Qp ** 2) + (Qp * s.yo) ** 2
  const Qpp63 = inp.a2pp === 0 ? 0
    : (s.yo * Math.sqrt(Math.max(Qp62, 0)) / s.C2 / Lse / Vj / a2 / Math.sqrt(kTpp) + xi * h ** 2)
      / (xi * h ** 2 / Qp + Qp / kTpp * (s.yo / a2 / Vj / s.C2 / Lse) ** 2)
  const kTp = 1 - xi * (Cc * x) ** 2 * (1 - Qpp63 / Qp) ** 2
  const kT = kTp * kTpp
  const dh2 = Qp62 > 0 ? kT * Vj ** 2 / 2 / g : 0
  const Qpp = s.C2 * a2 * Lse * Math.sqrt(2 * g * dh2) // flow over the gate Q″
  const Qtot = Math.min(inp.Q, Qp + Qpp)
  const Vo = Qtot / s.Ao
  const Hce = xi * Vo ** 2 / 2 / g
  const dh1 = Vj ** 2 / 2 / g - Hce - dh2
  const vh = rw * Vj ** 2 / 2 / g // velocity head as pressure, kN/m²
  const F1 = h === 0 ? 0 : (kT - kB) * Lse * c.d * vh // top vs bottom surface of the gate
  const F2 = h === 0 ? 0 : kT * Lse * c.tsBottom * vh // extended skin plate
  const F3 = h === 0 || inp.a2pp > 0 ? 0 : kT * s.As * vh // lintel seal protrusion
  return {
    x, y, Cc, kB, h, Vj, Qp, C1, xi, kTpp, Qpp, kTp, kT, dh2, Qtot, Vo, Hce, dh1, hT: c.HB - Hce - dh1,
    F1, F2, F3, F: F1 + F2 + F3, Qp62, Qpp63,
  }
}
export type DownpullPoint = ReturnType<typeof downpullAt>

/** The sheet: setup, the chosen opening, and the sweep x = 0.01 … 0.99 (J25:DD60) with its min and max. */
export function downpull(inp: DownpullInput, c: DownpullContext) {
  const s = downpullSetup(inp, c)
  const sweep = Array.from({ length: 99 }, (_, i) => downpullAt(inp, c, s, (i + 1) / 100))
  const pick = (better: (a: number, b: number) => boolean) => sweep.reduce((m, p) => (better(p.F, m.F) ? p : m)) // first match, as MATCH
  return { ...s, at: downpullAt(inp, c, s, inp.x), sweep, min: pick((a, b) => a < b), max: pick((a, b) => a > b) }
}
export type DownpullResult = ReturnType<typeof downpull>

export const defaultDownpull: DownpullInput = {
  location: 'Tunnel', theta: 0, lip: 0, a1: 6 * 25.4 / 1000, a2pp: 3.9375 * 25.4 / 1000, Q: 90, x: 0.01,
}
