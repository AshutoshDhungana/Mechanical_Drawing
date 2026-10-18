// Runs Define Beam → SecProp → Stress → Stiffeners in dependency order for a beam layout.
import type { BeamSpacingResult } from './beamSpacing'
import { beamSection, type BeamDef } from './defineBeam'
import { beamAnalysis, compositeSection, flexuralStrength, type GateGeometry, type Material, type SkinLocation } from './secProp'
import { modifiedLoads, panelChecks, plateMoments } from './stress'
import { resolveStiffeners, stiffenerStresses, suggestions, type GateType, type StiffenerInput } from './stiffeners'

export interface StructureInput {
  gateType: GateType
  loc: SkinLocation
  material: Material
  Lse: number // span between seal centrelines
  tap: number // web taper length from the support
  dweb: number // web depth at the support
  beams: (BeamDef | undefined)[] // per beam; a missing entry repeats the beam above (as the sheet's formulas do)
  skinThickness: (number | undefined)[] // per panel (n + 1); a missing entry repeats the panel above
  stiffeners: StiffenerInput[] // per panel; see resolveStiffeners
  endZone: number // Stiffeners!O15, wheel/end zone at each support (from the Wheel Design geometry)
  taperX?: number[] // fix the taper check location per beam instead of searching (tests)
}

/** Entry k, or the resolved entry above it when missing. */
export function chain<T>(a: (T | undefined)[], len: number): T[] {
  const out: T[] = []
  for (let k = 0; k < len; k++) out.push(a[k] ?? out[k - 1])
  return out
}

export function structure(bs: BeamSpacingResult, Lsup: number, inp: StructureInput) {
  const n = bs.beams.length
  const warnings: string[] = []
  if (inp.beams[0] === undefined || inp.skinThickness[0] === undefined) throw new RangeError('Define at least one beam and one skin plate thickness')
  if (inp.Lse > Lsup) warnings.push('Seal span exceeds the span between supports.')
  if (inp.tap > Lsup / 2) warnings.push('Taper length exceeds half the span.')
  const geom: GateGeometry = { loc: inp.loc, Lsup, Lse: inp.Lse, tap: inp.tap, dweb: inp.dweb }
  const defs = chain(inp.beams, n)
  const sections = defs.map(beamSection)
  const t = chain(inp.skinThickness, n + 1)
  const stiff = resolveStiffeners(inp.stiffeners, sections)
  const { spacings: L, widthFactors: J } = bs

  // SecProp: composite sections and strength (independent of the loads)
  const wAbove = (i: number) => L[i - 1] * J[i - 1] / (i === 1 ? 1 : 2) // i = 1-based beam number
  const wBelow = (i: number) => L[i] * J[i] / (i === n ? 1 : 2)
  const composites = sections.map((s, j) => compositeSection(s, wAbove(j + 1), t[j], wBelow(j + 1), t[j + 1], inp.loc))
  const strengths = sections.map((s, j) =>
    flexuralStrength(s, composites[j], Math.min(stiff[j].spacing, stiff[j + 1].spacing), inp.material, inp.loc))

  // Stress: plate moments → beam loads; SecProp: beam analysis; Stress: panel checks
  const panels = plateMoments(bs, sections, stiff)
  const loads = modifiedLoads(bs, panels)
  const analyses = sections.map((s, j) => beamAnalysis(s, composites[j], strengths[j], loads[j], wAbove(j + 1), wBelow(j + 1),
    defs[j].type === 'Fabricated Shape', inp.material, geom, inp.taperX?.[j]))
  const checks = panelChecks(bs, panels,
    sections.map((s, j) => ({ q: loads[j], sSkin: composites[j].sSkin, fb1Allow: analyses[j].fb1Allow, section: s })),
    stiff, t, inp.material, Lsup, inp.Lse)

  // Stiffeners
  const innerSpan = Lsup - inp.endZone
  const stiffStress = stiffenerStresses(stiff, sections, L, t, panels, loads)
  const suggested = stiff.map((st, k) => suggestions(st, sections[Math.max(k - 1, 0)], innerSpan))

  const maxRatio = Math.max(...checks.flat().map((c) => c.ratio))
  return { defs, sections, t, stiff, composites, strengths, panels, loads, analyses, checks, stiffStress, suggested, maxRatio, warnings }
}
export type StructureResult = ReturnType<typeof structure>
