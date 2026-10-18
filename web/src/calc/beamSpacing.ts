// Beam Spacing sheet + BeamSpace VBA module.
//
// Layout (top to bottom): top seal, beam 1 .. beam n, sill. spacings[k] is the gap between node k and
// node k+1, where node 0 = top seal and node n+1 = sill, so spacings[0] is the top cantilever and
// spacings[n] the bottom one. Units: m, kN/m3, kN/m2 (pressure), kN/m (beam load per metre of
// width) and kN·m/m (skin plate moment).

export type SpacingMethod = 'equal-moments' | 'equal-load-classic' | 'equal-load-exact' | 'manual'

export const spacingMethods: Record<SpacingMethod, string> = {
  'equal-moments': 'Equal moments',
  'equal-load-classic': 'Equal load (classic method)',
  'equal-load-exact': 'Equal load (exact method)',
  manual: 'Manual',
}

/** 'Beam Spacing'!Q5:Q10: 0 (no rounding) and 1/16, 1/8, 1/4, 1/2, 1 inch in metres. */
export const roundingSteps = [0, 0.0015875, 0.003175, 0.00635, 0.0127, 0.0254]

export interface BeamSpacingInput {
  n: number // N, number of horizontal beams (2..99)
  method: SpacingMethod
  acc: number // Acc, rounding step for computed spacings, m (0 = none)
  D: number // gate height to top seal
  Lsup: number // span between supports
  HB: number // depth of water to sill
  Hp: number // upstream pool depth (Westergaard)
  alp: number // seismic OBE coefficient
  rw: number // unit weight of water, kN/m3
  manual?: number[] // spacings[1..n] when method = 'manual'; spacings[0] = D - sum
}

export interface Beam {
  head: number
  pressure: number
  load: number // H: reaction from the skin plate, kN/m
  moment: number // I: skin plate moment over the beam, kN·m/m
  effectiveWidth: number // K: effective skin plate width acting with the beam, m
}

export interface BeamSpacingResult {
  spacings: number[] // n+1 values, C20, C23 .. C(20+3n)
  heads: number[] // n+2 nodes, F column
  pressures: number[] // n+2 nodes, G column
  widthFactors: number[] // n+1, J column (per spacing)
  beams: Beam[]
  totalLoad: number // H17
  maxLoad: number // N4
  maxSpacing: number // S4, max of spacings[1..n] (the top cantilever is excluded, as in the sheet)
  warnings: string[]
}

// ---------------------------------------------------------------- VBA solvers

/** BeamSolve: real root of the cubic linking a spacing to the one above it. */
export function beamSolve(c1: number, c2: number): number {
  const c3 = 3 * c1 * c2 ** 3
  const c4 = 81 * c1 ** 2
  const c5 = 6 * Math.sqrt(Math.abs(c3 - c4))
  const c6 = 54 * c1 - c2 ** 3
  if (c3 > c4) {
    const c7 = Math.hypot(c6, c5)
    return (2 * Math.cbrt(c7) * Math.cos(Math.acos(c6 / c7) / 3) - c2) / 6
  }
  const c7 = Math.cbrt(c6 + c5)
  return (c7 + c2 ** 2 / c7 - c2) / 6
}

const vbaRound = (x: number, dp: number) => Math.floor(x * 10 ** dp + 0.5) / 10 ** dp // Int(x*10^dp+0.5)/10^dp

/** EqualMoment: equal skin plate moments above and below every beam (hydrostatic only). */
export function equalMoment(n: number, D: number, HB: number, warnings: string[] = []): number[] {
  const L = new Array<number>(n + 1).fill(0)
  const H = new Array<number>(n + 1).fill(0)
  H[0] = HB - D
  let lno = vbaRound(D / (2 * n), 9)
  for (let count = 100; ; ) {
    L[0] = lno
    H[1] = H[0] + L[0]
    L[1] = beamSolve(L[0] ** 2 * (30 * H[0] + 10 * L[0]), 5 * H[1])
    for (let x = 2; x < n; x++) {
      H[x] = H[x - 1] + L[x - 1]
      L[x] = beamSolve(L[x - 1] ** 2 * (5 * H[x - 1] + 3 * L[x - 1]), 5 * H[x])
    }
    H[n] = H[n - 1] + L[n - 1]
    L[n] = beamSolve((L[n - 1] ** 2 * (H[n - 1] + (3 * L[n - 1]) / 5)) / 2, 3 * H[n])
    lno = vbaRound((L[0] * D) / sum(L), 8)
    if (lno === L[0]) break
    if (--count === 0) {
      warnings.push('Equal moment iteration limit reached; check results.')
      break
    }
  }
  return L
}

/** EqualLoadClassic: a beam at the centroid of each equal-load strip (Erbiste, p. 130). */
export function equalLoadClassic(n: number, D: number, HB: number): number[] {
  const c = (n * (HB - D) ** 2) / (HB ** 2 - (HB - D) ** 2)
  const depth = (x: number) => ((2 / 3) * HB) / Math.sqrt(n + c) * ((x + c) ** 1.5 - (x - 1 + c) ** 1.5)
  const L = [depth(1) - (HB - D)]
  for (let x = 1; x < n; x++) L.push(depth(x + 1) - depth(x))
  L.push(HB - depth(n))
  return L
}

/** EqualLoadExact: start from equal moments, rescale spacings until every beam carries the same load. */
export function equalLoadExact(n: number, D: number, HB: number, rw: number, warnings: string[] = []): number[] {
  const lpb = ((HB ** 2 - (HB - D) ** 2) / 2 / n) * rw
  let L = equalMoment(n, D, HB, warnings)
  for (let count = 2000; ; ) {
    const heads = nodeHeads(L, HB)
    const { loads: R } = skinPlate(L, heads.map((h) => h * rw)) // hydrostatic only, as in the VBA
    const cor = R.map((r) => (lpb - r) / (lpb + r)) // cor[i] for beam i+1
    const next = L.map((l, x) =>
      x === 0 ? l * (1 + cor[0]) : x === n ? l * (1 + cor[n - 1]) : l * (1 + cor[x - 1]) * (1 + 2 * cor[x]),
    ) // the factor of 2 is the VBA's convergence accelerator
    const tot = sum(next)
    const scaled = next.map((l) => (l * D) / tot)
    const again = scaled.some((l, x) => Math.abs(l - L[x]) > 1e-7)
    L = scaled
    if (!again) break
    if (--count === 0) {
      warnings.push('Equal load iteration limit reached; check results.')
      break
    }
  }
  return L
}

/**
 * Accuracy: round every spacing down to a multiple of acc, then round up the spacings with the largest
 * rounding error until the total equals D rounded to acc. Done in whole steps to avoid the VBA's
 * single-precision drift and its endless loop when the spacings overshoot.
 */
export function roundSpacings(L: number[], D: number, acc: number): number[] {
  if (!(acc > 0)) return L
  const k = L.map((l) => Math.floor(l / acc + 1e-9))
  const target = Math.round(D / acc)
  for (let total = sum(k); total < target; total++) {
    let i = 0
    for (let x = 1; x < L.length; x++) if (L[x] - k[x] * acc > L[i] - k[i] * acc) i = x
    k[i]++
  }
  return k.map((v) => v * acc)
}

// ---------------------------------------------------------------- sheet formulas

/** F column: heads measured up from the sill, node 0 = top seal ... node n+1 = sill. */
function nodeHeads(L: number[], HB: number): number[] {
  const h = new Array<number>(L.length + 1)
  h[L.length] = HB
  for (let k = L.length - 1; k >= 0; k--) h[k] = h[k + 1] - L[k]
  return h
}

/** G column: hydrostatic + Westergaard seismic pressure. Zero above the water surface. */
export const pressure = (h: number, Hp: number, alp: number, rw: number) =>
  h > 0 ? (h + (7 / 8) * alp * Math.sqrt(Hp * h)) * rw : 0

/** J column: effective width factor of the skin plate for a span b. */
export const widthFactor = (b: number, Lsup: number) => Math.min(1, 1.1 / (1 + 2 * (b / Lsup) ** 2))

/**
 * Skin plate as a continuous beam over the horizontal beams, cantilevering past the top and bottom
 * beams, under pressure varying linearly between nodes. Columns I/R (moments) and H/Q (loads).
 * The sheet runs 11 Gauss-Seidel sweeps of the three-moment equation; this solves it exactly.
 */
export function skinPlate(L: number[], p: number[]) {
  const n = L.length - 1
  const M = new Array<number>(n + 2).fill(0) // M[i] at beam i (1..n)
  M[1] = (L[0] ** 2 * (2 * p[0] + p[1])) / 6
  M[n] = (L[n] ** 2 * (p[n] + 2 * p[n + 1])) / 6
  // Three-moment equation at beam i (1 < i < n), span above a = L[i-1], below b = L[i]:
  // a·M[i-1] + 2(a+b)·M[i] + b·M[i+1] = [(7p[i-1] + 8p[i])a³ + (8p[i] + 7p[i+1])b³] / 60
  const m = n - 2
  if (m > 0) {
    const lo: number[] = [], di: number[] = [], up: number[] = [], rhs: number[] = []
    for (let i = 2; i < n; i++) {
      const a = L[i - 1], b = L[i]
      lo.push(a)
      di.push(2 * (a + b))
      up.push(b)
      rhs.push(((7 * p[i - 1] + 8 * p[i]) * a ** 3 + (8 * p[i] + 7 * p[i + 1]) * b ** 3) / 60)
    }
    rhs[0] -= lo[0] * M[1]
    rhs[m - 1] -= up[m - 1] * M[n]
    for (let j = 1; j < m; j++) { // Thomas algorithm
      const w = lo[j] / di[j - 1]
      di[j] -= w * up[j - 1]
      rhs[j] -= w * rhs[j - 1]
    }
    M[n - 1] = rhs[m - 1] / di[m - 1]
    for (let j = m - 2; j >= 0; j--) M[j + 2] = (rhs[j] - up[j] * M[j + 3]) / di[j]
  }
  const loads: number[] = []
  for (let i = 1; i <= n; i++) {
    const a = L[i - 1], b = L[i]
    const above = i === 1 ? ((p[0] + p[1]) * a) / 2 : ((p[i - 1] + 2 * p[i]) * a) / 6 + (M[i] - M[i - 1]) / a
    const below = i === n ? ((p[n] + p[n + 1]) * b) / 2 : ((2 * p[i] + p[i + 1]) * b) / 6 - (M[i + 1] - M[i]) / b
    loads.push(above + below)
  }
  return { moments: M.slice(1, n + 1), loads }
}

// ---------------------------------------------------------------- the sheet

export function defaultManualSpacings(n: number, D: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? D / n / 2 : D / n)) // CalcBeam 'Manual'
}

export function beamSpacing(inp: BeamSpacingInput): BeamSpacingResult {
  const { n, D, HB, Hp, alp, rw, Lsup } = inp
  const warnings: string[] = []
  if (!Number.isInteger(n) || n < 2 || n > 99) throw new RangeError('Number of beams must be a whole number from 2 to 99')
  if (!(D > 0) || !(Lsup > 0) || !(rw > 0)) throw new RangeError('Gate height, span and water unit weight must be positive')
  if (HB < D) warnings.push('Depth of water to sill is less than the gate height: the top of the gate is dry.')
  if (Hp < HB) warnings.push('Upstream pool depth is less than the depth of water to the sill.')

  let L: number[]
  if (inp.method === 'manual') {
    const m = inp.manual ?? defaultManualSpacings(n, D)
    if (m.length !== n) throw new RangeError(`Manual spacing needs ${n} values (beam 1 to sill)`)
    L = [0, ...m]
  } else {
    L =
      inp.method === 'equal-moments' ? equalMoment(n, D, HB, warnings)
      : inp.method === 'equal-load-classic' ? equalLoadClassic(n, D, HB)
      : equalLoadExact(n, D, HB, rw, warnings)
    L = roundSpacings(L, D, inp.acc)
  }
  L[0] = D - sum(L.slice(1)) // C20 = D - SUM(M:M): the top cantilever absorbs any remainder
  if (L.some((l) => !(l >= 0))) warnings.push('A spacing is negative: the beams do not fit in the gate height.')

  const heads = nodeHeads(L, HB)
  const pressures = heads.map((h) => pressure(h, Hp, alp, rw))
  const widthFactors = L.map((l, k) => widthFactor(k === 0 || k === n ? 2 * l : l, Lsup))
  const { moments, loads } = skinPlate(L, pressures)
  const J = widthFactors
  const beams = loads.map((load, j) => {
    const i = j + 1
    const effectiveWidth =
      i === 1 ? L[0] * J[0] + (L[1] / 2) * J[1]
      : i === n ? (L[n - 1] / 2) * J[n - 1] + L[n] * J[n]
      : (L[i - 1] * J[i - 1] + L[i] * J[i]) / 2
    return { head: heads[i], pressure: pressures[i], load, moment: moments[j], effectiveWidth }
  })
  return {
    spacings: L,
    heads,
    pressures,
    widthFactors,
    beams,
    totalLoad: sum(loads),
    maxLoad: Math.max(...loads),
    maxSpacing: Math.max(...L.slice(1)),
    warnings,
  }
}

function sum(a: number[]) {
  return a.reduce((s, v) => s + v, 0)
}
