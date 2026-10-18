// Wheel Design sheet (+ the hidden Wheel Design IS sheet, which is the line-contact block with its own inputs).
// Units: m, kN, kN·m, MPa, as the sheet. Weights in kN.
import shapes from '../../../data/tables/gate_shapes.json'
import { goldenMax, type Material } from './secProp'
import type { GateType } from './stiffeners'

export type ContactType = 'Line Contact' | 'Elliptical Contact'
export const concreteGrades = ['M15', 'M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50']

const psi = (x: number) => x * 0.00689475729316836 // CONVERT(x,"psi","Pa")/10^6
const STEEL = 7.85 * 9.81 // kN/m³

// ---------------------------------------------------------------- elliptical contact (C5:C27, F5:N27)

/** The sheet's 32-point Gauss–Legendre rule (I7:J22: nodes ±U, weights W on [−1, 1]). */
const U = [0.0483076656877383, 0.144471961582796, 0.239287362252137, 0.331868602282127, 0.421351276130635,
  0.506899908932229, 0.587715757240762, 0.663044266930215, 0.732182118740289, 0.794483795967942, 0.849367613732569,
  0.896321155766052, 0.934906075937739, 0.964762255587506, 0.985611511545268, 0.997263861849481]
const W = [0.0965400885147277, 0.0956387200792748, 0.0938443990808045, 0.0911738786957638, 0.0876520930044038,
  0.0833119242269467, 0.0781938957870702, 0.0723457941088484, 0.0658222227763618, 0.0586840934785356,
  0.0509980592623761, 0.0428358980222267, 0.0342738629130213, 0.025392065309262, 0.0162743947309055, 0.00701861000946937]

function gauss(f: (t: number) => number, phi: number) {
  let s = 0
  for (let i = 0; i < 16; i++) s += W[i] * (f(phi / 2 * (1 + U[i])) + f(phi / 2 * (1 - U[i])))
  return phi / 2 * s
}
/** Incomplete elliptic integrals of the second (E) and first (F) kind, modulus m. */
const ellE = (m: number, phi: number) => gauss((t) => Math.sqrt(1 - m * m * Math.sin(t) ** 2), phi)
const ellF = (m: number, phi: number) => gauss((t) => 1 / Math.sqrt(1 - m * m * Math.sin(t) ** 2), phi)

export interface EllipticalInput {
  P: number // design wheel load, kN
  D: number // wheel diameter
  Rt: number // wheel cross-radius
  RT: number // track cross-radius (0 = flat)
  nu: number
  E: number // MPa
  hardness: number // BHN, minimum of wheel and track
  c: number // allowance on each side of contact
  bt: number // tread width
  t: number // wheel centre thickness
  dh: number // hub OD
  dt: number // rim ID
}

/**
 * Contact ellipse and stresses (Skinner / Thomas & Hoersch). k′ (G8) solves the balance G12 = 0 and φ (G13)
 * maximises the subsurface stress Zy: the VBA's Findk and Maximize, which no longer run in the workbook
 * because the name WDref they start from is #REF!. psiDeg = maximum beam end rotation (SecProp AK).
 */
export function ellipticalContact(w: EllipticalInput, psiDeg: number, fixed: { kPrime?: number; phi?: number } = {}) {
  const A = ((w.RT === 0 ? 0 : 1 / w.RT) + 1 / w.Rt) / 2
  const B = 1 / w.D
  const bal = (kp: number) => {
    const E = ellE(kp, Math.PI / 2), K = ellF(kp, Math.PI / 2)
    return B / A - (E / (1 - kp * kp) - K) / (K - E)
  }
  let kp = fixed.kPrime
  if (kp === undefined) {
    let lo = 1e-6, hi = 0.9999 // Findk stops at 0.9999
    if (!(bal(lo) > 0)) throw new RangeError('Contact ellipse is undefined: 1/D must exceed (1/Rt + 1/RT)/2.')
    if (bal(hi) > 0) kp = hi
    else {
      for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (bal(m) > 0) lo = m; else hi = m }
      kp = (lo + hi) / 2
    }
  }
  const k = Math.sqrt(1 - kp * kp)
  const E = ellE(kp, Math.PI / 2), K = ellF(kp, Math.PI / 2)
  const Lam = 2 / (A + B) * (1 - w.nu ** 2) / w.E
  const a = Math.cbrt(Lam * E / (1 - kp * kp) * 3 * w.P / 2 / Math.PI) / 10
  const b = a * k
  const M = 2 * k * k / kp ** 2 / E
  const c0 = a / Lam * M
  const at = (phi: number) => {
    const zeta = 1 / Math.tan(phi)
    const tau = Math.sqrt((k * k + zeta ** 2) / (1 + zeta ** 2))
    const H = ellE(kp, phi), F = ellF(kp, phi)
    const Ox = (tau - 1) / 2 + zeta * (F - H)
    const Opx = -tau / k ** 2 + 1 + zeta * (H / k ** 2 - F)
    const Oy = 1 / 2 / tau + 1 / 2 - tau / k ** 2 + zeta * (H / k ** 2 - F)
    const Opy = -1 + tau + zeta * (F - H)
    const Yy = c0 * (Oy + w.nu * Opy), Zz = -c0 / 2 * (1 / tau - tau)
    return { phi, zeta, tau, H, F, Ox, Opx, Oy, Opy, Xx: c0 * (Ox + w.nu * Opx), Yy, Zz, Zy: Yy - Zz }
  }
  const s = at(fixed.phi ?? goldenMax((p) => at(p).Zy, 1e-3, Math.PI / 2))
  const offset = w.Rt * Math.sin(psiDeg * Math.PI / 180)
  return {
    A, B, kPrime: kp, k, E, K, bal: bal(kp), Lam, M, a, b, ...s,
    sigmaC: 1.5 * w.P / Math.PI / a / b / 1e3, sigmaCAllow: psi(Math.min(783.204 * w.hardness, 250000)),
    tau0: c0 * ((k - 1) / 2 + w.nu * (1 - 1 / k) + (1 / k - k) / 2) / 2,
    tauAllow: psi(Math.min(w.hardness / 255, 1) * 90000),
    tau1: s.Zy / 2,
    Zreq: 2 * a * s.zeta, // required depth of hardness
    psiDeg, offset, treadReq: 2 * (a + offset + w.c),
  }
}

// ---------------------------------------------------------------- line contact (C29:C55) and track (C56:C65)

export interface LineInput {
  P: number // design wheel load, kN
  D: number // wheel diameter
  l: number // tread width
  Yp: number // yield strength
  UTS: number
  hardness: number // BHN
  FOS: number
  fo: number // corner rounding on each side
}

/** E = elastic modulus used in the contact formula (the track's Es on Wheel Design, the wheel's own on Wheel Design IS). */
export function lineContact(w: LineInput, E: number) {
  const fpc = 1.4 * w.UTS
  const Sc = 169 * w.hardness - 15174 // critical stress of projected area, kN/m²
  const Sac = Sc / w.FOS
  const Apa = w.P / Sac
  const Iw = w.l + 2 * w.fo
  const fc = 0.418 * Math.sqrt(w.P * E * 1000 / (w.D / 2 * Iw)) / 1000
  const Ssa = Math.min(0.7 * w.UTS, 24 * w.hardness / 10 * 9.81)
  return { fpc, Sc, Sac, Apa, Inw: Apa / w.D, Iw, fc, Ssa, fsm: 0.304 * fc }
}

export interface TrackInput {
  Es: number // elastic modulus of the track, MPa
  beam: string // ISMB designation under the track plate
  b: number // track plate width
  d: number // track plate thickness
  concrete: string // 'M25' etc.
}

/** Track plate on an ISMB embedded in concrete (S39:AA52 and C61:C65). Yp = the wheel's yield strength (D65 = 0.4·C33). */
export function track(t: TrackInput, P: number, Yp: number) {
  const r = shapes.rows.find((s) => s.designation === t.beam)
  if (!r) throw new RangeError(`Unknown section ${t.beam}`)
  const h = Number(t.beam.slice(-3)) / 1000 // RIGHT(T43,3)/1000
  const I = r.Ixx / 100 ** 4
  const parts = [
    { A: t.b * t.d, y: t.d / 2, I: t.b * t.d ** 3 / 12 },
    { A: r.area, y: h / 2 + t.d, I },
  ]
  const sA = parts.reduce((s, p) => s + p.A, 0)
  const sAY = parts.reduce((s, p) => s + p.A * p.y, 0)
  const Yt = sAY / sA
  const Ina = parts.reduce((s, p) => s + p.A * p.y ** 2 + p.I, 0) - sA * Yt ** 2
  const Y = t.d + h
  const Zt = Ina / Yt, Zb = Ina / (Y - Yt)
  const fck = Number(t.concrete.slice(-2))
  const Ec = 5000 * Math.sqrt(fck)
  // ponytail: bearing uses the beam-only I, bending the composite Ina, and the bending allowable is 0.4 × the wheel's Yp (sheet); flagged in docs
  return {
    h, A: sA, Yt, Yb: Y - Yt, Ina, Zt, Zb, I, Ec,
    p: 0.218 * P * 1000 * Math.cbrt(Ec / (t.Es * I * t.b ** 2)) / 1e6, pAllow: 0.45 * fck,
    fb: 0.5 * P * 1000 / Math.min(Zt, Zb) * Math.cbrt(t.Es / Ec * Ina / t.b) / 1e6, fbAllow: 0.4 * Yp,
  }
}

// ---------------------------------------------------------------- end beam (C101:J117, C155:J171)

export interface EndBeamLoad {
  M: number // max end beam moment (Wheel Spacing K3)
  ts: number // skin plate thickness at beam 1 (SecProp S17)
  dweb: number // web depth at support
  Lb: number // unbraced length = max beam spacing (Beam Spacing S4)
}

/**
 * Skin plate (associated width x1) with `count` vertical stiffeners of thickness c as the stem, split by the
 * axle hole into lengths e (skin side) and f (back). Fy = the axle support plate's yield strength.
 */
function endBeam(L: EndBeamLoad, x1: number, count: number, c: number, e: number, f: number, Fy: number, m: Material) {
  const { ts, dweb } = L
  const cs = count * c
  const a1 = x1 * ts, a2 = cs * e, a3 = cs * f
  const h1 = ts / 2, h2 = ts + e / 2, h3 = ts + dweb - f / 2
  const A = a1 + a2 + a3
  const sAh = a1 * h1 + a2 * h2 + a3 * h3
  const I = a1 * h1 ** 2 + a2 * h2 ** 2 + a3 * h3 ** 2 + (x1 * ts ** 3 + cs * (e ** 3 + f ** 3)) / 12 - sAh ** 2 / A
  const cg1 = sAh / A, cg2 = dweb + ts - cg1
  const Sx1 = I / cg1, Sx2 = I / cg2
  // lateral torsional buckling of the stem
  const d = ts + dweb
  const J = (x1 * ts ** 3 + count * dweb * c ** 3) / 3
  const Iy = ts * x1 ** 3 / 12 // ignores the vertical stiffener
  const Bf = -2.3 * d / L.Lb * Math.sqrt(Iy / J) // negative: stem in compression
  const G = psi(11200000)
  const Mcr = Math.PI * Math.sqrt(m.E * 1000 * Iy * G * 1000 * J) / L.Lb * (Bf + Math.sqrt(1 + Bf ** 2))
  const Mn = Math.min(Fy * 1000 * Math.min(Sx1, Sx2), Mcr) // ponytail: Fy is the axle support plate's yield, as the sheet; flagged in docs
  return {
    e, f, x1, A, I, cg1, cg2, Sx1, Sx2, J, Iy, B: Bf, G, Mcr, Mn, M: L.M,
    fb1: L.M / Sx1 / 1000, fb1Allow: m.beta * Mn / m.omegaB / Sx1 / 1000,
    fb2: L.M / Sx2 / 1000, fb2Allow: m.beta * Mn / m.omegaB / Sx2 / 1000,
  }
}

// ---------------------------------------------------------------- double support axle (C73:C95)

export interface DoubleAxleInput {
  Wlat: number // lateral wheel load factor
  bh: number // wheel hub length
  d: number // axle diameter
  FyS: number // axle yield strength
  FyB: number // axle support plate yield strength
  c: number // support member thickness
  b: number // clearance wheel to member
  Fbe: number // allowable wheel bearing stress
  y: number // skin plate face to wheel axis
}

/** Axle span between two vertical stiffeners; triangular end bearing, so each support acts c/3 in from its inner face. */
export function doubleSupport(x: DoubleAxleInput, P: number, Dw: number, L: EndBeamLoad, m: Material) {
  const w = P / x.bh
  const Mo = x.Wlat * P * Dw / 2
  const wm = 6 * Mo / x.bh ** 2
  const Lr = x.bh + 2 * x.b + 2 / 3 * x.c
  const R1 = w * x.bh / 2 + Mo / Lr, R2 = w * x.bh / 2 - Mo / Lr
  const z = x.bh / 2 + x.b + x.c + x.bh / 2 / wm * (w - Math.sqrt(w ** 2 + wm ** 2 + 2 * wm * (w - 2 * R1 / x.bh)))
  const Mmax = R1 * (z - 2 / 3 * x.c) - (z - x.b - x.c) ** 2 / 2 * (w + wm + 2 * wm / 3 / x.bh * (x.b + x.c - z))
  const Plat = 3 * Mo / x.d / x.bh ** 2 / 1000, Prad = w / x.d / 1000
  const Sr = x.bh + 2 * x.b + x.c
  return {
    w, wm, Lr, Mo, R1, R2, z, Mmax,
    weight: Math.PI / 4 * x.d ** 2 * (x.bh + 2 * x.b + 2 * x.c) * STEEL,
    Plat, Prad, bearing: Plat + Prad, bearingAllow: x.Fbe,
    // ponytail: no β on the axle bending allowable here (the cantilevered block has 0.4·FyS·β); flagged in docs
    fb: Mmax * 32 / Math.PI / x.d ** 3 / 1000, fbAllow: 0.4 * x.FyS,
    fB: R1 / x.c / x.d / 1000, fBAllow: 0.9 * x.FyB * m.beta,
    Sr,
    endBeam: endBeam(L, 21 * L.ts + Sr + x.c / 2, 2, x.c, x.y - L.ts - x.d / 2, L.dweb + L.ts - x.y - x.d / 2, x.FyB, m),
  }
}

// ---------------------------------------------------------------- cantilevered axle (C125:C149)

export interface CantAxleInput {
  Wlat: number
  bh: number // wheel hub length
  d1: number // axle diameter at the wheel
  d2: number // axle diameter at R1
  FyS: number
  FyB: number
  c: number // main support member thickness
  b: number // clearance wheel to member
  a: number // secondary (inner) support member thickness
  Fbe: number
  Lr: number // axle support span
  y: number // skin plate face to wheel axis
}

/** Axle cantilevered from the main end stiffener (R2), held down by an inner stiffener (R1) at Lr. */
export function cantilevered(x: CantAxleInput, P: number, Dw: number, L: EndBeamLoad, m: Material) {
  const w = P / x.bh
  const Mo = x.Wlat * P * Dw / 2 // the sheet divides by 1000 here (C137), a unit slip: see the tests
  const arm = x.bh / 2 + x.b + x.c / 2
  const R1 = (w * x.bh * arm + Mo) / x.Lr, R2 = (w * x.bh * (arm + x.Lr) + Mo) / x.Lr
  const Mmax = w * x.bh * (x.bh / 2 + x.b) + Mo
  const Plat = 3 * Mo / x.d1 / x.bh ** 2 / 1000, Prad = w / x.d1 / 1000
  return {
    w, Mo, R1, R2, Mmax,
    weight: Math.PI / 4 * (x.d1 ** 2 * (x.bh + x.b + x.c) + (x.d1 + x.d2) ** 2 / 4 * (x.Lr - x.a / 2 - x.c / 2) + x.d2 ** 2 * x.a) * STEEL,
    Plat, Prad, bearing: Plat + Prad, bearingAllow: x.Fbe,
    fb: Mmax * 32 / Math.PI / x.d1 ** 3 / 1000, fbAllow: 0.4 * x.FyS * m.beta,
    fv1: R1 / Math.PI / x.d2 ** 2 * 4 / 1000, fv1Allow: 0.23 * x.FyS * m.beta,
    fB1: R1 / x.d2 / x.a / 1000, fB2: R2 / x.c / x.d1 / 1000, fBAllow: 0.9 * x.FyB * m.beta,
    endBeam: endBeam(L, 21 * L.ts + x.c / 2, 1, x.c, x.y - L.ts - x.d1 / 2, L.dweb + L.ts - x.y - x.d1 / 2, x.FyB, m),
  }
}

// ---------------------------------------------------------------- the sheet

export interface WheelDesignInput {
  contact: ContactType // SecProp!U6
  elliptical: EllipticalInput
  line: LineInput
  track: TrackInput
  double: DoubleAxleInput
  // cells that are inputs holding a formula; undefined = the formula
  cant: Omit<CantAxleInput, 'bh' | 'd2' | 'a' | 'Lr' | 'y'> & { bh?: number; d2?: number; a?: number; Lr?: number; y?: number }
  sealPlate: number // Embedded Parts!C21, seal plate thickness, mm (until Embedded Parts is ported)
}

export interface GeometryContext {
  gateType: GateType
  clearSpan: number
  Lsup: number
  t0: number // skin plate thickness, top panel (SecProp!I13)
  stiffSpacing: number // vertical stiffener spacing, top panel (Stiffeners!D13)
  stiffThickness: number // vertical stiffener thickness, top panel (Stiffeners!D16)
}

/** Wheel geometry needed before the structure: the end zone (Stiffeners!O15) and the cantilevered axle span (Y17). */
export function wheelGeometry(inp: WheelDesignInput, g: GeometryContext) {
  const line = inp.contact === 'Line Contact'
  const tread = line ? inp.line.l : inp.elliptical.bt // the sheet uses the line-contact tread (C32) for both
  const bh = inp.cant.bh ?? tread // C126 = C32
  // Stiffeners!Y15: distance from the clear opening edge to the first stiffener
  const edge = (g.clearSpan - (Math.ceil(g.clearSpan / g.stiffSpacing - 1e-9) - 1) * g.stiffSpacing) / 2
  // Y17 = 0.2 − C32/2 − 0.002 − SecProp!I13 − C131/2 + Y15; 0.2 and 0.002 are the default support offset and clearance
  const LrDefault = (g.Lsup - g.clearSpan) / 2 - tread / 2 - inp.cant.b - g.t0 - inp.cant.c / 2 + edge
  const Lr = inp.cant.Lr ?? LrDefault
  const zoneCant = bh + 2 * inp.cant.b + inp.cant.c + 2 * Lr // O14
  const zoneDouble = inp.double.bh + 2 * inp.double.b + 2 / 3 * inp.double.c + inp.double.c / 3 // O13 = C83 + C78/3
  const endZone = g.gateType === 'Fixed Wheel (cantilevered)' ? zoneCant : g.gateType === 'Fixed Wheel (double support)' ? zoneDouble : 0
  return { tread, bh, edge, LrDefault, Lr, a: inp.cant.a ?? g.stiffThickness, endZone, tapDefault: LrDefault /* SecProp!S7 = Y17 */ }
}
export type WheelGeometry = ReturnType<typeof wheelGeometry>

/** Embedded Parts!C25: slot contour length, mm, rounded up to 10 mm. Side seal in mm; t0, dweb, trackD in m. */
export const slotLength = (side: { B: number; mt: number; delta: number }, t0: number, dweb: number, trackD: number) =>
  Math.ceil((((side.B + side.mt - side.delta) / 1000 + t0 + dweb + 0.01 + trackD) * 1000) / 10 - 1e-9) * 10

/** Q161: skin plate face to wheel axis for the cantilevered wheel, from the side seal and the embedded slot depth. mm in, m out. */
export function wheelAxisOffset(side: { B: number; mt: number; delta: number }, sealPlate: number, t0: number, dweb: number, trackD: number, wheelD: number) {
  const slot = slotLength(side, t0, dweb, trackD)
  return (slot - sealPlate - side.B - side.mt + side.delta - trackD * 1000 - wheelD / 2 * 1000) / 1000
}

export interface WheelContext {
  geometry: WheelGeometry
  maxWheelLoad: number // Wheel Spacing K4
  endBeam: EndBeamLoad
  psiDeg: number // max beam end rotation
  sideSeal: { B: number; mt: number; delta: number }
  dweb: number
  t0: number
  material: Material
  fixed?: { kPrime?: number; phi?: number } // tests: the workbook's cached solver results
}

export function wheelDesign(inp: WheelDesignInput, gateType: GateType, ctx: WheelContext) {
  const warnings: string[] = []
  const line = inp.contact === 'Line Contact'
  const P = line ? inp.line.P : inp.elliptical.P
  const Dw = line ? inp.line.D : inp.elliptical.D
  if (P < ctx.maxWheelLoad) warnings.push('Design wheel load is less than the maximum wheel load from Wheel Spacing.')
  if (!line && inp.elliptical.t > inp.elliptical.bt) warnings.push('Wheel centre thickness exceeds the tread width.')
  if (!line && inp.elliptical.dt > inp.elliptical.D) warnings.push('Rim ID exceeds the wheel diameter.')

  const ell = line ? undefined : ellipticalContact(inp.elliptical, ctx.psiDeg, ctx.fixed)
  const lc = line ? lineContact(inp.line, inp.track.Es) : undefined
  const tr = track(inp.track, P, inp.line.Yp)

  const g = ctx.geometry
  const yCant = inp.cant.y ?? wheelAxisOffset(ctx.sideSeal, inp.sealPlate, ctx.t0, ctx.dweb, inp.track.d, Dw)
  const cantIn: CantAxleInput = { ...inp.cant, bh: g.bh, d2: inp.cant.d2 ?? inp.cant.d1 / 2, a: g.a, Lr: g.Lr, y: yCant }
  const cantilever = gateType === 'Fixed Wheel (cantilevered)'
  const axle = cantilever ? undefined : doubleSupport(inp.double, P, Dw, ctx.endBeam, ctx.material)
  const cant = cantilever ? cantilevered(cantIn, P, Dw, ctx.endBeam, ctx.material) : undefined

  const e = inp.elliptical, axleD = cantilever ? cantIn.d1 : inp.double.d
  const wheelWeight = line
    ? Math.PI / 4 * (inp.line.D ** 2 - axleD ** 2) * inp.line.l * STEEL
    : Math.PI / 4 * ((e.dh ** 2 - axleD ** 2) * (cantilever ? cantIn.bh : inp.double.bh) + (e.dt ** 2 - e.dh ** 2) * e.t + (e.D ** 2 - e.dt ** 2) * e.bt) * STEEL

  const checks = [
    ...(ell ? [ell.sigmaC / ell.sigmaCAllow, ell.tau0 / ell.tauAllow, ell.tau1 / ell.tauAllow, ell.treadReq / e.bt] : []),
    ...(lc ? [lc.Inw / inp.line.l, lc.fc / lc.fpc, lc.fsm / lc.Ssa] : []),
    tr.p / tr.pAllow, tr.fb / tr.fbAllow,
    ...(axle ? [axle.bearing / axle.bearingAllow, axle.fb / axle.fbAllow, axle.fB / axle.fBAllow] : []),
    ...(cant ? [cant.bearing / cant.bearingAllow, cant.fb / cant.fbAllow, cant.fv1 / cant.fv1Allow, cant.fB1 / cant.fBAllow, cant.fB2 / cant.fBAllow] : []),
    ...[axle?.endBeam ?? cant?.endBeam].flatMap((b) => (b ? [b.fb1 / b.fb1Allow, b.fb2 / b.fb2Allow] : [])),
  ]
  return { P, Dw, elliptical: ell, line: lc, track: tr, axle, cant, cantInput: cantIn, wheelWeight, maxRatio: Math.max(...checks), warnings }
}
export type WheelDesignResult = ReturnType<typeof wheelDesign>

/** The workbook's saved inputs. */
export const defaultWheelDesign: WheelDesignInput = {
  contact: 'Line Contact',
  elliptical: { P: 561.747455966, D: 0.15, Rt: 0.9, RT: 0, nu: 0.3, E: 193053, hardness: 255, c: 0.01, bt: 0.07, t: 0.01905, dh: 0.18, dt: 0.2 },
  line: { P: 165, D: 0.25, l: 0.08, Yp: 560, UTS: 700, hardness: 250, FOS: 3, fo: 0.005 },
  track: { Es: 206000, beam: 'ISMB 200', b: 0.1, d: 0.01, concrete: 'M25' },
  double: { Wlat: 0.3, bh: 0.2, d: 0.1, FyS: psi(105000), FyB: psi(50000), c: 0.032, b: 0.013, Fbe: psi(18865), y: 0.1 },
  cant: { Wlat: 0.3, d1: 0.12, FyS: 496, FyB: 250, c: 0.03, b: 0.002, Fbe: 130 },
  sealPlate: 8,
}

/** Wheel Design IS (hidden sheet): a stand-alone line-contact check with its own inputs. */
export interface WheelIsInput { line: LineInput; E: number; track: Omit<TrackInput, 'Es'> }
export const defaultWheelIs: WheelIsInput = {
  line: { P: 81, D: 0.15, l: 0.07, Yp: 549.17, UTS: 686.46, hardness: 207, FOS: 2, fo: 0.005 },
  E: 205900,
  track: { beam: 'ISMB 100', b: 0.08, d: 0.01, concrete: 'M25' },
}
export function wheelIs(inp: WheelIsInput) {
  return { line: lineContact(inp.line, inp.E), track: track({ ...inp.track, Es: inp.E }, inp.line.P, inp.line.Yp) }
}
