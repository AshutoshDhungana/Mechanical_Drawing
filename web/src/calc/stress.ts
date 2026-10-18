// Stress sheet: skin plate panel moments (flat-plate theory or beam theory), the beam loads they
// imply, and the combined stress checks at each point of each panel.
// Panels: 0 = top (seal to beam 1), i = between beam i and i+1, n = bottom (beam n to sill).
// Points follow the sheet's sketch: ① mid-panel, ② panel centre (vertical), ③/⑤ flange edges,
// ④ at the lower beam, ⑥ at the upper beam. Units: kN, m; moments kN·m/m; stresses MPa.
import plates from '../../../data/tables/plate_coefficients.json'
import type { BeamSpacingResult } from './beamSpacing'
import type { BeamSection } from './defineBeam'
import type { Material } from './secProp'

type Table = 'CCCF' | 'CCCC'
const POISSON = 0.3 // Stress!AC6
const CRITICAL_RATIO = 2 // Stress!AC5: plate theory below this b/a (twice this for the top/bottom panels)

/**
 * Coefficient at b/a by linear interpolation between table rows, as the sheet does it:
 * FORECAST over the bracketing rows of the ×0.0254 'as used' column, ROUND to 5 dp, then /0.0254.
 */
export function plateCoef(table: Table, name: string, ratio: number): number {
  const t = plates[table]
  const col = t.columns.find((c) => c.name === name)!
  const xs = t.b_over_a
  let j = 0
  while (j + 1 < xs.length && xs[j + 1] <= ratio) j++
  const [x0, x1, y0, y1] = [xs[j], xs[j + 1], col.as_used[j], col.as_used[j + 1]]
  const y = y0 + ((y1 - y0) * (ratio - x0)) / (x1 - x0)
  return Math.round(y * 1e5) / 1e5 / 0.0254 // ponytail: sheet's 5 dp rounding loses up to ~0.3%; drop when golden match no longer needed
}

export interface StiffenerLayout {
  spacing: number // s, vertical stiffener spacing
  offset: number // e, stiffener distance from gate centre
}

export type Point = '①' | '②' | '③' | '④' | '⑤' | '⑥'

export interface PanelPlate {
  ratio: number // b/a = stiffener spacing / panel height
  plateTheory: boolean // ratio below the critical value
  plate: Partial<Record<Point, number>> // Z column: flat plate theory
  beam: Partial<Record<Point, number>> // Y column: beam theory (skin plate continuous over the beams)
  P: Partial<Record<Point, number>> // adopted moment
}

const vonMises = (m: number, q: number) => Math.sqrt((m - POISSON * q) ** 2 + q ** 2 + (m - POISSON * q) * q)

/** Columns Y, Z, AB–AI: skin plate moments in each panel. */
export function plateMoments(bs: BeamSpacingResult, beams: BeamSection[], stiff: StiffenerLayout[]): PanelPlate[] {
  const n = beams.length
  const { spacings: Ls, pressures: p } = bs
  const Mb = bs.beams.map((b) => b.moment) // Mb[i-1] = beam i
  const panels: PanelPlate[] = []

  { // top panel, three edges fixed and the top edge free (CCCF), hydrostatic load case A
    const L = Ls[0], pu = p[0], dp = p[1] - p[0], bff = beams[0].bff
    const ratio = Math.min(L > 0 ? stiff[0].spacing / L : 0, 4.9999)
    const k = (c: string) => plateCoef('CCCF', c, ratio) * L ** 2
    const Mx4 = k('CCCFA') * pu + k('CCCFD') * dp
    // ponytail: My uses the hydrostatic case C coefficient (CCCFH) as the sheet does; case A would be CCCFE (flagged)
    const My1 = k('CCCFB') * pu + k('CCCFH') * dp
    const plate = { '①': My1, '②': 0, '③': L > 0 ? (1 - bff / 2 / L) ** 2 * Mx4 : 0, '④': Mx4 }
    const x = L - bff / 2
    const beam = { '③': L > 0 ? x ** 2 * (pu / 2 + dp / 6 / L * x) : 0, '④': Mb[0] }
    const use = ratio < 2 * CRITICAL_RATIO
    panels.push({ ratio, plateTheory: use, plate, beam, P: { '①': My1, '②': 0, '③': use ? plate['③'] : beam['③'], '④': use ? Mx4 : Mb[0] } })
  }

  for (let i = 1; i < n; i++) { // intermediate panels, all edges fixed (CCCC)
    const L = Ls[i], pu = p[i], dp = p[i + 1] - p[i]
    const ratio = Math.min(stiff[i].spacing / L, 4.9999)
    const k = (c: string) => plateCoef('CCCC', c, ratio) * L ** 2
    const A = k('CCCCA') * pu
    const z2 = k('CCCCB') * pu + k('CCCCG') * dp
    const z4 = A + k('CCCCE') * dp
    const z6 = A + k('CCCCF') * dp
    const plate = {
      '①': k('CCCCC') * pu + k('CCCCH') * dp,
      '②': z2,
      '③': (1 - beams[i].bff / L) ** 2 * (z2 + z4) - z2,
      '④': z4,
      '⑤': (1 - beams[i - 1].bff / L) ** 2 * (z6 + z2) - z2,
      '⑥': z6,
    }
    // beam theory: span between beams with end moments Mb[i-1] (upper) and Mb[i] (lower)
    const y4 = Mb[i], y6 = Mb[i - 1]
    const at = (x: number) => (y4 - y6) * x / L + y6 - pu * x / 2 * (L - x) - dp * x / 6 * (L - x ** 2 / L)
    const beam = {
      '②': Math.abs((y4 + y6) / 2 - (pu + p[i + 1]) * L ** 2 / 16),
      '③': at(L - beams[i].bff / 2),
      '④': y4,
      '⑤': at(beams[i - 1].bff / 2),
      '⑥': y6,
    }
    const use = ratio < CRITICAL_RATIO
    const P = { '①': plate['①'] } as PanelPlate['P']
    for (const pt of ['②', '③', '④', '⑤', '⑥'] as const) P[pt] = use ? plate[pt] : beam[pt]
    panels.push({ ratio, plateTheory: use, plate, beam, P })
  }

  { // bottom panel, bottom edge free (CCCF), hydrostatic load case C
    const L = Ls[n], pu = p[n], dp = p[n + 1] - p[n], bff = beams[n - 1].bff
    const ratio = L > 0 ? Math.min(stiff[n].spacing / L, 4.9999) : 0
    const k = (c: string) => plateCoef('CCCF', c, ratio) * L ** 2
    const Mx6 = k('CCCFA') * pu + k('CCCFG') * dp
    // The sheet's ⑤ multiplies by Stress!Z129, an empty cell, so it is always 0; this uses ⑥ as the top panel does.
    const plate = { '①': k('CCCFB') * pu + k('CCCFH') * dp, '②': 0, '⑤': L > 0 ? (1 - bff / 2 / L) ** 2 * Mx6 : 0, '⑥': Mx6 }
    // ponytail: sheet uses the effective width (L·J) rather than the spacing for the cantilever length here (flagged)
    const c = L * bs.widthFactors[n] - bff / 2
    const beam = { '⑤': L > 0 ? c ** 2 / 2 * (pu + dp * (1 - c / 3 / L)) : 0, '⑥': Mb[n - 1] }
    const use = ratio < 2 * CRITICAL_RATIO
    panels.push({ ratio, plateTheory: use, plate, beam, P: { '①': plate['①'], '②': 0, '⑤': use ? plate['⑤'] : beam['⑤'], '⑥': use ? Mx6 : Mb[n - 1] } })
  }
  return panels
}

/**
 * Columns AK–AN: beam loads from the panel loads and the adopted plate moments at each beam (average of
 * the panel above and below).
 */
export function modifiedLoads(bs: BeamSpacingResult, panels: PanelPlate[]): number[] {
  const n = bs.beams.length
  const { spacings: Ls, pressures: p } = bs
  const Mavg = Array.from({ length: n }, (_, j) => (panels[j].P['④']! + panels[j + 1].P['⑥']!) / 2)
  const q = new Array<number>(n).fill(0)
  q[0] += (p[0] + p[1]) * Ls[0] / 2
  q[n - 1] += (p[n] + p[n + 1]) * Ls[n] / 2
  for (let i = 1; i < n; i++) {
    const L = Ls[i], dM = (Mavg[i] - Mavg[i - 1]) / L
    // ponytail: the sheet adds +dM to the upper beam and -dM to the lower one, the reverse of the
    // continuous-beam reactions on Beam Spacing (flagged); totals are unaffected
    q[i - 1] += dM + L / 6 * (2 * p[i] + p[i + 1])
    q[i] += -dM + L / 6 * (p[i] + 2 * p[i + 1])
  }
  return q
}

export interface PointCheck {
  point: Point
  beamMoment: number // L: major-axis moment in the horizontal beam, kN·m
  beamStress: number // M
  beamAllow: number // O
  plateMoment: number // P
  plateStress: number // Q
  plateAllow: number // S
  combined?: number // T (von Mises)
  combinedAllow?: number // V
  ratio: number // W
}

export interface BeamForStress {
  q: number // modified beam load
  sSkin: number // section modulus at the skin face
  fb1Allow: number // allowable bending stress at the skin face (SecProp W16)
  section: BeamSection
}

/** Columns L–W: stresses at each point of each panel. t[k] = skin plate thickness of panel k. */
export function panelChecks(bs: BeamSpacingResult, panels: PanelPlate[], beams: BeamForStress[], stiff: StiffenerLayout[],
  t: number[], m: Material, Lsup: number, Lse: number): PointCheck[][] {
  const n = beams.length
  const plateAllowS = 1.5 / m.omegaB * m.beta * m.Fys
  const plateAllowB = 1.5 / m.omegaB * m.beta * Math.min(m.Fyb, m.Fys)
  const combAllowS = m.Fys * m.beta / 1.33
  const combAllowB = Math.min(m.Fyb, m.Fys) * m.beta / 1.33
  const Mcentre = (q: number, e: number) => q / 2 * (Lse / 2 * (Lsup - Lse / 2) - e ** 2)
  const Mmid = (q: number, s: number, e: number) => q / 8 * (s * (4 * e - s) + Lse * (2 * Lsup - Lse) - 4 * e ** 2)
  const sig = (M: number, t: number) => M / t ** 2 * 6 / 1000

  const point = (pt: Point, beamMoment: number, beamStress: number, beamAllow: number, plateMoment: number,
    plateStress: number, atBeam: boolean): PointCheck => {
    const plateAllow = atBeam ? plateAllowB : plateAllowS
    if (pt === '①') return { point: pt, beamMoment, beamStress, beamAllow, plateMoment, plateStress, plateAllow, ratio: beamStress / beamAllow + plateStress / plateAllow }
    const combined = vonMises(beamStress, plateStress), combinedAllow = atBeam ? combAllowB : combAllowS
    return { point: pt, beamMoment, beamStress, beamAllow, plateMoment, plateStress, plateAllow, combined, combinedAllow, ratio: combined / combinedAllow }
  }

  const out: PointCheck[][] = []
  { // top
    const L = bs.spacings[0], b = beams[0], { spacing: s, offset: e } = stiff[0], P = panels[0].P
    const mid = Mmid(b.q, s, e), mStress = (M: number) => M / b.sSkin / 1000
    const edge = L > 0
    out.push([
      point('①', edge ? Mcentre(b.q, e) : 0, mStress(edge ? Mcentre(b.q, e) : 0), b.fb1Allow, P['①']!, sig(P['①']!, t[0]), false),
      point('②', edge ? mid : 0, edge ? mStress(mid) : 0, b.fb1Allow, 0, 0, false),
      point('③', edge ? mid : 0, edge ? mStress(mid) : 0, b.fb1Allow, P['③']!, sig(P['③']!, t[0]), false),
      point('④', mid, mStress(mid), b.fb1Allow, P['④']!, sig(P['④']!, b.section.tff + t[0]), true),
    ])
  }
  for (let i = 1; i < n; i++) {
    const up = beams[i - 1], lo = beams[i], { spacing: s, offset: e } = stiff[i], P = panels[i].P, ti = t[i]
    const L4 = Mmid(lo.q, s, e), L6 = Mmid(up.q, s, e)
    const M4 = L4 / lo.sSkin / 1000, M6 = L6 / up.sSkin / 1000
    const O2 = (lo.fb1Allow + up.fb1Allow) / 2
    const L1 = (up.q + lo.q) / 4 * (Lse / 2 * (Lsup - Lse / 2) - e ** 2)
    out.push([
      point('①', L1, L1 * 2 / (lo.sSkin + up.sSkin) / 1000, O2, P['①']!, sig(P['①']!, ti), false),
      point('②', (L4 + L6) / 2, (M4 + M6) / 2, O2, P['②']!, sig(P['②']!, ti), false),
      point('③', L4, M4, lo.fb1Allow, P['③']!, sig(P['③']!, ti), false),
      point('④', L4, M4, lo.fb1Allow, P['④']!, sig(P['④']!, lo.section.tff + ti), true),
      point('⑤', L6, M6, up.fb1Allow, P['⑤']!, sig(P['⑤']!, ti), false),
      point('⑥', L6, M6, up.fb1Allow, P['⑥']!, sig(P['⑥']!, up.section.tff + ti), true),
    ])
  }
  { // bottom
    const L = bs.spacings[n], b = beams[n - 1], { spacing: s, offset: e } = stiff[n], P = panels[n].P, tn = t[n]
    const mid = Mmid(b.q, s, e), mStress = (M: number) => M / b.sSkin / 1000
    const edge = L > 0
    const L1 = edge ? Mcentre(b.q, e) : 0
    out.push([
      point('①', L1, mStress(L1), b.fb1Allow, P['①']!, sig(P['①']!, tn), false),
      point('②', edge ? mid : 0, edge ? mStress(mid) : 0, b.fb1Allow, 0, 0, false),
      point('⑤', edge ? mid : 0, edge ? mStress(mid) : 0, b.fb1Allow, P['⑤']!, sig(P['⑤']!, tn), false),
      point('⑥', mid, mStress(mid), b.fb1Allow, P['⑥']!, sig(P['⑥']!, b.section.tff + tn), true),
    ])
  }
  return out
}
