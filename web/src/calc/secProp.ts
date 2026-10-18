// SecProp sheet: composite section (beam + effective skin plate), nominal flexural strength per
// AISC 360 Chapter F (F4/F5, as the workbook implements it), and analysis of each beam as simply
// supported over Lsup with the water load spread over the seal span Lse.
// Units: m, kN, kN·m; stresses in MPa; E, Fy in MPa.
import type { BeamSection } from './defineBeam'

export type SkinLocation = 'Upstream' | 'Downstream'

export interface Material {
  E: number // elastic modulus
  Fyb: number // yield strength, beams
  Fys: number // yield strength, plates
  Fyw: number // weld strength
  beta: number // GDF, gate design factor
  omegaB: number // Ωb, bending safety factor
}

export interface GateGeometry {
  loc: SkinLocation
  Lsup: number // span between supports
  Lse: number // span between seal centrelines (load width)
  tap: number // taper length from support (0 = no taper)
  dweb: number // web depth at support
}

/** A stack of rectangles measured from the skin plate face: [width, thickness][] */
type Layers = [number, number][]

const layersOf = (s: BeamSection, sk: number, ts: number, dw = s.dw): Layers => [
  [sk, ts], [s.bff, s.tff], [s.tw, dw], [s.bfb, s.tfb],
]

function stack(layers: Layers) {
  let y = 0, A = 0, Ay = 0, Ay2 = 0, I0 = 0
  for (const [b, t] of layers) {
    const yc = y + t / 2
    A += b * t
    Ay += b * t * yc
    Ay2 += b * t * yc ** 2
    I0 += (b * t ** 3) / 12
    y += t
  }
  return { A, d: y, ybar: Ay / A, Ix: Ay2 + I0 - Ay ** 2 / A }
}

/** Plastic neutral axis (from the skin face) and plastic modulus of a stack of rectangles. */
function plastic(layers: Layers) {
  const half = layers.reduce((s, [b, t]) => s + b * t, 0) / 2
  let y = 0, acc = 0, yp = 0
  for (const [b, t] of layers) {
    if (acc + b * t >= half) { yp = y + (half - acc) / b; break }
    acc += b * t
    y += t
  }
  let Zx = 0
  y = 0
  for (const [b, t] of layers) {
    const top = y, bot = y + t
    Zx += yp > top && yp < bot ? (b / 2) * ((yp - top) ** 2 + (bot - yp) ** 2) : b * t * Math.abs((top + bot) / 2 - yp)
    y = bot
  }
  return { yp, Zx }
}

export interface Composite {
  sk: number // effective skin plate width
  ts: number // average skin plate thickness
  A: number; Ix: number; Iy: number; d: number
  cgc: number; cgt: number // centroid to compression / tension face
  Sxc: number; Sxt: number
  J: number // torsional constant
  yp: number; Zx: number
  sSkin: number; sBack: number // section modulus at the skin face / back flange
}

/**
 * Beam i with the skin plate above (width wAbove, thickness tAbove) and below. wAbove/wBelow are the
 * effective-width contributions: spacing × width factor, halved unless it is the top/bottom cantilever.
 */
export function compositeSection(s: BeamSection, wAbove: number, tAbove: number, wBelow: number, tBelow: number, loc: SkinLocation): Composite {
  const ts = (tAbove + tBelow) / 2
  const sk = (wAbove * tAbove + wBelow * tBelow) / ts
  const layers = layersOf(s, sk, ts)
  const { A, d, ybar, Ix } = stack(layers)
  const Iy = (ts * sk ** 3 + s.tff * s.bff ** 3 + s.dw * s.tw ** 3 + s.tfb * s.bfb ** 3) / 12
  const [cgc, cgt] = loc === 'Upstream' ? [ybar, d - ybar] : [d - ybar, ybar] // skin side is in compression when upstream
  const J = (sk * ts ** 3 + s.bff * s.tff ** 3 + s.dw * s.tw ** 3 + s.bfb * s.tfb ** 3) / 3
  const Sxc = Ix / cgc, Sxt = Ix / cgt
  return {
    sk, ts, A, Ix, Iy, d, cgc, cgt, Sxc, Sxt, J, ...plastic(layers),
    sSkin: loc === 'Upstream' ? Sxc : Sxt, sBack: loc === 'Upstream' ? Sxt : Sxc,
  }
}

/** Nominal flexural strength, columns Y–AJ. Lb = spacing of lateral bracing (vertical stiffeners). */
export function flexuralStrength(s: BeamSection, c: Composite, Lb: number, m: Material, loc: SkinLocation) {
  const Fy = m.Fyb * 1000, E = m.E * 1000 // kN/m2
  const rootEF = Math.sqrt(m.E / m.Fyb)
  const up = loc === 'Upstream'
  // Compression flange yielding (F4.1)
  const Myc = c.Sxc * Fy
  const Mp = Math.min(c.Zx * Fy, 1.6 * Myc)
  const hc = 2 * (up ? c.cgc - c.ts - s.tff : c.cgc - s.tfb)
  const hp = 2 * (up ? c.yp - c.ts - s.tff : s.dw + s.tff + c.ts - c.yp)
  const lrw = 5.7 * rootEF
  const lpw = Math.min(hp > 0 ? hc / hp / (0.54 * Mp / Myc - 0.09) ** 2 : 5.7, 5.7) * rootEF
  const lw = hc / s.tw
  const Rpc = lw > lpw ? Mp / Myc - (Mp / Myc - 1) * (lw - lpw) / (lrw - lpw) : Mp / Myc
  const bfc = up ? c.sk : s.bfb
  const tfc = up ? c.ts + s.tff : s.tfb
  const aw = Math.min((hc * s.tw) / (bfc * tfc), 10)
  // ponytail: workbook uses 100 + 300aw; AISC F5-6 has 1200 + 300aw (flagged in docs)
  const Rpg = Math.min(1 - (aw / (100 + 300 * aw)) * (hc / s.tw - 5.7 * rootEF), 1)
  const Mn1 = (lw > lrw ? Rpg : Rpc) * Myc
  // Lateral-torsional buckling (F4.2 / F5.2)
  const Iyc = up ? (c.ts * c.sk ** 3 + s.tff * s.bff ** 3) / 12 : (s.tfb * s.bfb ** 3) / 12
  const ho = s.tfb / 2 + s.dw + s.tff / 2 + c.ts / 2
  // ponytail: workbook omits the 12 under the root that AISC F4-10 has (flagged in docs)
  const rt = bfc / Math.sqrt(1 * (ho / c.d + (aw / 6) * s.dw ** 2 / ho / c.d))
  const Lp = 1.1 * rt * rootEF
  const Jeff = Iyc / c.Iy > 0.23 ? c.J : 0
  const Fcr = (Math.PI ** 2 * E) / (Lb / rt) ** 2 * Math.sqrt(1 + (0.078 * Jeff) / c.Sxc / ho * (Lb / rt) ** 2)
  const FL = c.Sxt / c.Sxc < 0.7 ? Math.max(Fy * c.Sxt / c.Sxc, 0.5 * Fy) : 0.7 * Fy
  const Lr = 1.95 * rt * E / FL * Math.sqrt(c.J / c.Sxc / ho) * Math.sqrt(1 + Math.sqrt(1 + 6.76 * (FL / E * c.Sxc * ho / c.J) ** 2))
  const Mn2F4 = Math.min(Lb > Lr ? Fcr * c.Sxc : Rpc * Myc - (Rpc * Myc - FL * c.Sxc) * (Lb - Lp) / (Lr - Lp), Rpc * Myc)
  const Lr5 = Math.PI * rt * Math.sqrt(m.E / m.Fyb / 0.7)
  const Fcr5 = Lb > Lr5 ? Math.min(Math.PI ** 2 * E * (rt / Lb) ** 2, Fy) : Math.min(1 - 0.3 * (Lb - Lp) / (Lr5 - Lp), 1) * Fy
  const Mn2F5 = Rpg * Fcr5 * c.Sxc
  const Mn2 = Lb < Lp ? Mn1 : lw > lrw ? Mn2F5 : Mn2F4
  // Compression flange local buckling (F4.3 / F5.3)
  const kc = Math.max(Math.min(4 * Math.sqrt(s.tw / s.dw), 0.76), 0.35)
  const lpf = 0.38 * rootEF
  const lrf = 0.95 * Math.sqrt(E * kc / FL)
  const lf = bfc / 2 / tfc
  const Mn3F4 = lf > lrf ? 0.9 * E * kc * c.Sxc / lf ** 2 : Rpc * Myc - (Rpc * Myc - FL * c.Sxc) * (lf - lpf) / (lrf - lpf)
  const Fcr3 = lf < lrf ? (1 - 0.3 * (lf - lpf) / (lrf - lpf)) * Fy : 0.9 * E * kc / lf ** 2
  const Mn3F5 = Rpg * Fcr3 * c.Sxc
  const Mn3 = lf < lpf ? Mn1 : lw > lrw ? Mn3F5 : Mn3F4
  // Tension flange yielding (F4.4 / F5.4)
  const Myt = c.Sxt * Fy
  const Rpt = lw > lpw ? Math.min(Mp / Myt - (Mp / Myt - 1) * (lw - lpw) / (lrw - lpw), Mp / Myt) : Mp / Myt
  const Mn4 = c.Sxt < c.Sxc ? (lw > lrw ? Fy * c.Sxt : Rpt * Myt) : Mn1

  return {
    Myc, Mp, hc, hp, lpw, lrw, lw, Rpc, bfc, tfc, aw, Rpg, Mn1,
    Iyc, ho, rt, Lp, Fcr, FL, Lr, Mn2F4, Lr5, Fcr5, Mn2F5, Mn2,
    kc, lpf, lrf, lf, Mn3F4, Fcr3, Mn3F5, Mn3,
    Myt, Rpt, Mn4,
    Mn: Math.min(Mn1, Mn2, Mn3, Mn4),
  }
}
export type FlexuralStrength = ReturnType<typeof flexuralStrength>

/** Fillet weld leg, rounded up to 1/16 in. (The workbook rounds the size in metres, which always gives 1/16 in.) */
const weldLeg = (x: number) => (Math.ceil((x / 0.0254) * 16 - 1e-9) / 16) * 0.0254

/** Bending moment in the taper zone at distance x from the support. */
function taperMoment(q: number, x: number, g: GateGeometry) {
  const a = (g.Lsup - g.Lse) / 2 // unloaded length beyond the seals
  return x < a ? x * q * g.Lse / 2 : x * q * g.Lse / 2 - (q / 2) * (x - a) ** 2
}

/** Section and stresses at x from the support where the web tapers from dweb (at 0) to dw (at tap). */
export function taperSection(s: BeamSection, c: Composite, q: number, x: number, g: GateGeometry) {
  const dwe = Math.min((s.dw - g.dweb) * x / g.tap + g.dweb, s.dw)
  const { A, d, ybar, Ix } = stack(layersOf(s, c.sk, c.ts, dwe))
  const M = g.tap === 0 ? 0 : taperMoment(q, x, g)
  return { dwe, A, Ix, d, cg1: ybar, cg2: d - ybar, Sx1: Ix / ybar, Sx2: Ix / (d - ybar), M, fbt1: M / (Ix / ybar) / 1000, fbt2: M / (Ix / (d - ybar)) / 1000 }
}

/** TaperCalc: where in the taper the back-flange stress peaks (golden-section search, then the ends). */
export function taperMaxLocation(s: BeamSection, c: Composite, q: number, g: GateGeometry): number {
  if (g.tap <= 0) return 0
  const f = (x: number) => taperSection(s, c, q, x, g).fbt2
  return [0, goldenMax(f, 0, g.tap), g.tap].reduce((best, x) => (f(x) > f(best) ? x : best))
}

/** Golden-section search for the maximum of a unimodal f on [a, b]. */
export function goldenMax(f: (x: number) => number, a: number, b: number): number {
  const r = (Math.sqrt(5) - 1) / 2
  for (let i = 0; i < 80; i++) {
    const x1 = b - r * (b - a), x2 = a + r * (b - a)
    if (f(x1) < f(x2)) a = x1
    else b = x2
  }
  return (a + b) / 2
}

/** Beam analysis, columns T–W. q = beam load per metre of skin plate width (kN/m). */
export function beamAnalysis(s: BeamSection, c: Composite, fs: FlexuralStrength, q: number, wAbove: number, wBelow: number,
  fabricated: boolean, m: Material, g: GateGeometry, taperX?: number) {
  const E = m.E * 1000
  const { Lsup, Lse } = g
  const MB = q * Lse / 8 * (2 * Lsup - Lse)
  const allowM = fs.Mn / m.omegaB * m.beta
  const deflection = q * Lse / 384 / E / c.Ix * (8 * Lsup ** 3 - 4 * Lse ** 2 * Lsup + Lse ** 3)
  const V = q * Lse / 2 // end shear
  const weldAllow = m.beta * 0.3 * m.Fyw * 1000 / Math.SQRT2
  const ws = c.ts * (wAbove + wBelow) // skin plate area (the sheet's (O15+O24)·ts)
  // ponytail: lever arms below are the sheet's (cgt for the skin weld, cgc for the back flange weld); flagged in docs
  const weldSkin = weldLeg((V * ws * (c.cgt - c.ts / 2)) / 2 / c.Ix / weldAllow)
  const weldFlangeWeb = !fabricated || s.tff === 0 ? undefined
    : weldLeg((V * (ws + s.tff * s.bff) * (c.cgt - (ws * c.ts / 2 + s.tff * s.bff * (s.tff / 2 + c.ts)) / (ws + s.tff * s.bff))) / 2 / c.Ix / weldAllow)
  const weldWebBack = !fabricated ? undefined : weldLeg((V * s.tfb * s.bfb * (c.cgc - s.tfb / 2)) / 2 / c.Ix / weldAllow)
  const x = taperX ?? taperMaxLocation(s, c, q, g)
  const taper = taperSection(s, c, q, x, g)
  return {
    q, MB,
    fb1: MB / c.sSkin / 1000, fb1Allow: allowM / c.sSkin / 1000, // at the skin plate
    fb2: MB / c.sBack / 1000, fb2Allow: allowM / c.sBack / 1000, // at the back flange
    deflection, spanRatio: Lsup / deflection, spanRatioMin: 800,
    rotationDeg: (q * Lse / 48 / E / c.Ix * (3 * Lsup ** 2 - Lse ** 2)) * 180 / Math.PI,
    weldSkin, weldFlangeWeb, weldWebBack,
    // the sheet's cell for beam i reads beam i-1's block from beam 2 on (the last beam's shear is never shown)
    fv: V / (c.ts + s.tff + s.tfb + g.dweb) / s.tw / 1000, fvAllow: 0.4 * m.beta * m.Fyb,
    taperX: x, taper,
  }
}
export type BeamAnalysis = ReturnType<typeof beamAnalysis>
