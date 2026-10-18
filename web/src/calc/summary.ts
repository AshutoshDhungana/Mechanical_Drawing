// Summary sheet: the design report's key values, gathered from the other sheets.
import type { ProjectInput } from './project'
import type { SealsInput } from './seals'
import type { GateType, Stiffener } from './stiffeners'
import type { SkinLocation } from './secProp'
import type { BeamDef } from './defineBeam'
import type { WheelDesignInput } from './wheelDesign'
import type { HoistInput, HoistResult } from './hoist'
import type { EmbeddedResult } from './embedded'

export type Row = [label: string, value: number | string | undefined, unit?: string]
export interface SummarySection { title: string; rows: Row[] }

export interface SummaryContext {
  project: ProjectInput
  gateType: GateType
  heads: { hfl: number; nwl: number; deck: number }
  beams: { n: number; D: number; Lsup: number; HB: number; totalLoad: number; first: BeamDef }
  stiff: Stiffener // top panel
  loc: SkinLocation
  seals: SealsInput
  wheelsPerSide?: number
  wheel?: { input: WheelDesignInput; axleD: number; axleSpan: number; ts: number; dweb: number } // m
  massKg: number
  hydrostatic: number // kN
  maxLift: number // kN
  hoist?: { input: HoistInput; r: HoistResult; source: string }
  embedded?: EmbeddedResult
}

export function summary(c: SummaryContext): SummarySection[] {
  const p = c.project, s = c.seals, side = s.side.dims ?? s.lintel.dims
  const sections: SummarySection[] = [
    { title: 'Design parameters', rows: [
      ['Location', p.location], ['Type of gate', `Vertical ${c.gateType} Type`], ['Clear span', p.clearSpan, 'm'], ['Clear height', p.clearHeight, 'm'],
      ['Number of openings', p.openings], ['High flood level (HFL)', p.hfl, 'm'], ['Normal water level (NWL)', p.nwl, 'm'], ['Sill level', p.sill, 'm'],
      ['Hoist deck level', c.heads.deck, 'm'], ['Gate operating platform', p.platform, 'm'], ['Design head (at HFL)', c.heads.hfl, 'm'],
      ['Design head (at NWL)', c.heads.nwl, 'm'],
    ] },
    { title: 'Beam spacing', rows: [
      ['Number of beams', c.beams.n], ['Gate height to top seal', c.beams.D, 'm'], ['Span between supports', c.beams.Lsup, 'm'],
      ['Depth of water to sill', c.beams.HB, 'm'], ['Total beam load per metre width', c.beams.totalLoad, 'kN/m'],
    ] },
    { title: 'Beam definition', rows: [
      ['Beam type', c.beams.first.type], ['Designation', c.beams.first.type === 'I Shape' ? c.beams.first.designation : 'Fabricated'],
    ] },
    { title: 'Vertical stiffeners', rows: [
      ['Spacing', c.stiff.spacing * 1000, 'mm'], ['Depth', c.stiff.depth * 1000, 'mm'], ['Thickness', c.stiff.thickness * 1000, 'mm'],
      ['Number', c.stiff.count], ['Skin plate location', c.loc],
    ] },
    // the sheet types 4 mm deflections and a 75 mm sill seal height here; the port reports the Seals inputs
    { title: 'Lintel seal', rows: s.lintel.type === 'No Lintel Seal' ? [['Seal type', s.lintel.type]] : [
      ['Seal type', s.lintel.type], ['Bulb diameter', s.lintel.dims.B, 'mm'], ['Seal stem thickness', s.lintel.dims.t, 'mm'], ['Deflection', s.lintel.dims.delta, 'mm'],
    ] },
    { title: 'Side seals', rows: [
      ['Seal type', s.side.type], ['Bulb diameter', side.B, 'mm'], ['Seal stem thickness', side.t, 'mm'], ['Deflection', side.delta, 'mm'],
    ] },
    { title: 'Sill seal', rows: [
      ['Seal type', s.sill.type], ['Seal stem thickness', s.sill.dims.t, 'mm'],
      s.sill.type === 'Wedge Seal' ? ['Seal height', s.sill.dims.sh, 'mm'] : ['Deflection', s.sill.dims.delta, 'mm'],
    ] },
  ]
  if (c.wheel && c.wheelsPerSide) {
    const w = c.wheel, line = w.input.contact === 'Line Contact'
    const cw = line ? w.input.line : w.input.elliptical
    sections.push(
      { title: 'Wheels', rows: [
        ['Number of wheels', c.wheelsPerSide * 2], ['Type', c.gateType === 'Fixed Wheel (cantilevered)' ? 'Cantilevered' : 'Double support'],
        ['Contact', w.input.contact], ['Design wheel load', cw.P, 'kN'], ['Wheel diameter', cw.D * 1000, 'mm'],
        ['Wheel tread width', (line ? w.input.line.l : w.input.elliptical.bt) * 1000, 'mm'],
        ['Wheel axle diameter', w.axleD * 1000, 'mm'], ['Wheel axle support span', w.axleSpan * 1000, 'mm'],
      ] },
      { title: 'End beam design', rows: [['Skin plate thickness', w.ts * 1000, 'mm'], ['Web depth at support', w.dweb * 1000, 'mm']] },
    )
  }
  sections.push(
    // the sheet converts kg with CONVERT(…,"kg","ton"), which is the US short ton (907 kg); the port reports tonnes
    { title: 'Estimated gate weight', rows: [['Total weight', c.massKg / 1000, 't']] },
    { title: 'Gate operating loads', rows: [['Total hydrostatic load on gate', c.hydrostatic, 'kN'], ['Hoist load, lifting (max)', c.maxLift, 'kN']] },
  )
  if (c.hoist) {
    const { input: h, r } = c.hoist
    sections.push({ title: 'Hoisting system', rows: [
      ['Type', 'Rope Drum Hoist'], ['Lifting load', r.maxLift / 9.81, 't'], ['Lifting load (jammed condition)', h.liftingLoad / 9.81, 't'],
      ['Wire rope', h.ropeType], ['Rope diameter', h.ropeD, 'mm'], ['Rope grade', `${h.grade} ${h.core}`], ['Breaking force', r.mbf, 'kN'],
      ['Number of drums', h.drums], ['Safety factor for rope', `${r.fosRequired} for N and ${r.fosBDTRequired} for BDT`],
      ['Design diameter of drum', h.drumPcd, 'mm'], ['Number of grooves on drum', r.drum.totalGrooves],
      ['Length of drum', h.drum.length * 1000, 'mm'], // the sheet reads the legacy hoist's 500 mm (same value)
      ['Electric source', c.hoist.source], ['Motor rpm', h.motor.rpm], ['Lifting speed', h.speed, 'm/min'],
      ['Design capacity of motor', h.motor.power], ['Poles', 2 * Math.floor(60 * 50 / h.motor.rpm)],
      ['Handle diameter', h.manual.handleR * 2, 'm'], ['Handle radius', h.manual.handleR, 'm'],
      ['Average force of person for operation', h.manual.personForce / 9.81, 'kgf'], ['Operating force', r.manual.effort / 9.81, 'kgf'],
      ['Manual gate lifting speed', r.manual.speed, 'm/min'], ['Total number of people required', r.manual.people],
    ] })
  }
  if (c.embedded) {
    const e = c.embedded
    sections.push({ title: 'Embedded parts', rows: [
      ['Niche contour length (M)', e.niche.length, 'mm'], ['Niche contour depth (N)', e.niche.depth, 'mm'],
      ['Slot contour length (L)', e.slotLength, 'mm'], ['Slot contour depth (B)', e.slotDepth, 'mm'],
      ['Total weight of embedded parts', e.total, 'kg'],
    ] })
  }
  return sections
}
