// Embedded Parts sheet (+ the hidden legacy 'Embedded' sheet): sill beam check, slot and niche contours and the
// weight of the parts cast into the concrete. Units as the sheet: mm for dimensions, N and N·m, kg.
import bolts from '../../../data/tables/anchor_bolts.json'
import ismb from '../../../data/tables/ismb.json'
import ismc from '../../../data/tables/ismc.json'
import ismcLib from '../../../data/tables/ismc_lib.json'
import shapes from '../../../data/tables/gate_shapes.json'
import type { GateType } from './stiffeners'

export const channelSections = ismc.rows.map((r) => r.designation)
export const beamSections = ismb.rows.map((r) => r.designation)
export const boltSizes = ['M16', 'M20', 'M24', 'M27'] as const

function section(designation: string) {
  const r = ismc.rows.find((x) => x.designation === designation) ?? ismb.rows.find((x) => x.designation === designation)
  if (!r) throw new RangeError(`Unknown section ${designation}`)
  return { designation, w: r.w, area: r.area, h: r.h, b: r.b, tf: r.tf, tw: r.tw, Ixx: r.Ixx, Zxx: r.Zxx }
}
export type Section = ReturnType<typeof section>

/** kg per bolt, nut and washer (AA70:AC86, by the row block the sheet's lookups address). */
export function boltKg(size: string, length: number) {
  const r = bolts.rows.find((b) => b.size === size && b.length === length)
  if (!r) throw new RangeError(`No ${size} × ${length} bolt in the table`)
  return r.col_AC
}

export interface Item { name: string; count: number; width?: number; height?: number; depth?: number; diameter?: number; volume?: number; unit: number; total: number }
const plate = (name: string, count: number, width: number, height: number, depth: number): Item => {
  const volume = width * height * depth
  return { name, count, width, height, depth, volume, unit: volume * 7850 / 1e9, total: count * volume * 7850 / 1e9 }
}
const rolled = (name: string, count: number, s: Section, length: number): Item =>
  ({ name, count, width: s.b, height: length, depth: s.h, unit: s.w * length / 1000, total: count * s.w * length / 1000 })
const anchor = (name: string, count: number, length: number, diameter: number): Item => {
  const volume = Math.PI * diameter ** 2 / 4 * length
  return { name, count, height: length, diameter, volume, unit: volume * 7850e-9, total: count * volume * 7850e-9 }
}
const sum = (items: Item[]) => items.reduce((a, i) => a + i.total, 0)

export interface EmbeddedInput {
  sillAnchorSpacing: number // C4, mm
  sillBeam: string // C13
  sealPlateWidth: number // C20, mm
  cornerOffset: number // C26, mm
  channels: { downstream: string; upstream: string; lintel: string } // C29, D29, G29
  sidePlateT: number // C40, mm
  anchorSpacing: number // C43, mm
  anchorsPer: { downstream: number; upstream: number; plate: number; beam: number } // C44:C47
  anchor: { length: number; diameter: number } // E64:G67 (150, 16)
  sideSealPlateT: number // F69, mm (the sheet types 10 here; the seal plate thickness C21 is 8)
  sideTrack: { width: number; thickness: number } // D71, F71
  bolt: { size: string; length: number; lintelCount: number } // G73/F73, C79
  sillSealPlate: { width: number; thickness: number } // D83, F83 (typed 80 × 80 in the sheet)
}

export interface EmbeddedContext {
  Lsup: number // m
  clearSpan: number // m
  gateMass: number // kg (Weight & cg D6)
  Fyb: number
  slotLength: number // C25, mm (Wheel Design → wheelAxisOffset's slot)
  sealPlateT: number // C21, mm
  precompression: number // C22 = Seals!C9
  wheelBase: string // E29 = Wheel Design C58 (track beam)
  track: { b: number; d: number } // Wheel Design C59, C60, m
  sill: number; platform: number // C51, C52
  erbistiX: number // Weight & cg AA4
}

export function embeddedParts(inp: EmbeddedInput, c: EmbeddedContext) {
  // sill beam (C4:C17)
  const C5 = c.Lsup, C6 = c.gateMass * 9.81, C7 = 1.5 * C6, C8 = C7 / C5, C9 = 2 * C8
  const C11 = C9 * inp.sillAnchorSpacing ** 2 / 8 / 1e6
  const sillRow = shapes.rows.find((r) => r.designation === inp.sillBeam)
  if (!sillRow) throw new RangeError(`Unknown section ${inp.sillBeam}`)
  const allow = 0.4 * c.Fyb
  const sillStress = C11 / sillRow.Zx / 1e6
  const sillAnchors = Math.floor(C5 / inp.sillAnchorSpacing * 1000) - 1

  // sections C29:G37
  const ch = { downstream: section(inp.channels.downstream), upstream: section(inp.channels.upstream), wheelBase: section(c.wheelBase),
    sill: section(inp.sillBeam), lintel: section(inp.channels.lintel) }
  // side plate (C38:G41)
  const width = c.slotLength + ch.downstream.b + ch.upstream.b
  const force = 0.3 * c.gateMass * 9.81
  const sidePlate = { width, force, M: force * width ** 2 / 8 / 1e6, Z: width * inp.sidePlateT ** 2 / 6 * 1e-9, stress: 0, allow }
  sidePlate.stress = sidePlate.M / sidePlate.Z / 1e6

  const slotDepth = ch.upstream.h // C42
  const a = inp.anchor
  const niche = {
    length: Math.ceil(c.slotLength + ch.downstream.tw + ch.upstream.tw + a.length + Math.max(ch.wheelBase.h, a.length) - 1e-9), // C49
    depth: Math.ceil(slotDepth + inp.sidePlateT + a.length - 1e-9), // C50
  }

  // weights (rows 56:89)
  const H = (c.platform - c.sill) * 1000
  const n = inp.anchorsPer, sp = inp.anchorSpacing
  const nDown = (n.downstream * Math.floor(H / sp) - 1) * 2
  const side = [
    rolled('Channel section at downstream side', 2, ch.downstream, H),
    rolled('Channel section at upstream side', 2, ch.upstream, H),
    plate('Channel supporting plate', 2, width, H, inp.sidePlateT),
    rolled('I beam', 2, ch.wheelBase, H),
    anchor('Anchor for channel at downstream side', nDown, a.length, a.diameter),
    anchor('Anchor for channel at upstream side', (n.upstream * Math.floor(H / sp) - 1) * 2, a.length, a.diameter),
    anchor('Anchor for supporting plate', (n.plate * Math.floor(H / sp) - 1) * 2, a.length, a.diameter),
    anchor('Anchor for beam', (n.beam * Math.floor(H / sp) - 1) * 2, a.length, a.diameter),
    plate('Seal plate', 2, inp.sealPlateWidth, H, inp.sideSealPlateT),
    plate('Roller track plate', 2, c.track.b * 1000, H, c.track.d * 1000),
    plate('Side roller track plate', 2, inp.sideTrack.width, H, inp.sideTrack.thickness),
  ]
  const boltUnit = boltKg(inp.bolt.size, inp.bolt.length)
  side.push({ name: 'Bolt, Nut, Washers', count: nDown, height: inp.bolt.length, unit: boltUnit, total: nDown * boltUnit })
  const lintelLen = c.clearSpan * 1000 + 2 * slotDepth
  const lintel = [
    rolled('I beam', 1, ch.lintel, lintelLen),
    plate('Sill seal plate', 1, inp.sealPlateWidth, lintelLen, c.sealPlateT),
    anchor('Anchor for beam', Math.floor(lintelLen / sp) - 1, a.length, a.diameter),
    { name: 'Bolt, Nut, Washers', count: inp.bolt.lintelCount, height: inp.bolt.length, unit: boltUnit, total: inp.bolt.lintelCount * boltUnit },
  ]
  // the sheet types 106.68 kg as the sill I beam's weight (C5 = 4.2 m); the port uses the section weight × length like the other rows
  const sill = [
    rolled('I beam', 1, ch.sill, C5 * 1000),
    plate('Sill seal plate', 1, inp.sillSealPlate.width, C5 * 1000, inp.sillSealPlate.thickness),
    anchor('Anchor for beam', sillAnchors, a.length, a.diameter),
  ]
  const gross = sum(side) + sum(lintel) + sum(sill)
  const heavy = c.erbistiX > 2000
  return {
    sillBeam: { span: C5, weight: C6, design: C7, udl: C8, designUdl: C9, M: C11, allow, Z: sillRow.Zx, stress: sillStress, anchors: sillAnchors },
    precompression: c.precompression, sealPlateT: c.sealPlateT, slotLength: c.slotLength, slotDepth, sections: ch, sidePlate, niche,
    groups: [['Side embedded parts', side], ['Lintel beam embedded parts', lintel], ['Sill embedded parts', sill]] as [string, Item[]][],
    subtotals: [sum(side), sum(lintel), sum(sill)], gross, total: 1.1 * gross,
    erbisti: { min: (heavy ? 0.1 : 0.11) * c.gateMass, max: (heavy ? 0.5 : 0.54) * c.gateMass },
  }
}
export type EmbeddedResult = ReturnType<typeof embeddedParts>

export const defaultEmbedded: EmbeddedInput = {
  sillAnchorSpacing: 500, sillBeam: 'ISMB 200', sealPlateWidth: 80, cornerOffset: 50,
  channels: { downstream: 'ISMC 250', upstream: 'ISMC 300', lintel: 'ISMB 200' }, sidePlateT: 8, anchorSpacing: 500,
  anchorsPer: { downstream: 1, upstream: 2, plate: 2, beam: 2 }, anchor: { length: 150, diameter: 16 }, sideSealPlateT: 10,
  sideTrack: { width: 60, thickness: 14 }, bolt: { size: 'M16', length: 75, lintelCount: 4 }, sillSealPlate: { width: 80, thickness: 80 },
}

// ---------------------------------------------------------------- legacy 'Embedded' (hidden)

const libChannel = (d: string) => {
  const r = ismcLib.rows.find((x) => x.designation === d)
  if (!r) throw new RangeError(`Unknown channel ${d}`)
  return r
}
const libBeam = (d: string) => {
  const r = shapes.rows.find((x) => x.designation === d)
  if (!r) throw new RangeError(`Unknown section ${d}`)
  return r
}

export interface LegacyEmbeddedInput {
  sealPlate: { width: number; thickness: number } // C6, C7
  precompression: number // C8
  rail: { thickness: number; width: number } // C19, C20
  cornerOffset: number // C23
  sections: { ch1: string; ch2: string; beam: string; sill: string; lintel: string } // C31:G31
  holdingPlateT: number // C42
  anchorSpacing: number // C51
  lintelAnchorSpacing: number; lintelSealPlate: { width: number; thickness: number } // C54:C56
  sillAnchorSpacing: number; sillSealPlate: { width: number; thickness: number } // C59:C61
}

export interface LegacyEmbeddedContext {
  gateType: GateType
  side: { B: number; mt: number } // Seals C29, C37
  t0: number // m
  y: number // skin face to wheel axis, m
  wheel: { P: number; D: number; l: number } // Wheel Design C30:C32 (line contact, both branches)
  Sr: number; c: number // Wheel Design C108 (double) and support member thickness (C131 / C78), m
  Lsup: number; clearSpan: number; sill: number; platform: number
}

/** The old embedded-parts sheet. Its section lookups read gate_shapes columns under other labels: 'depth' is the back flange
 *  width, 'width' the flange thickness, 'flange thickness' the web thickness and 'web thickness' the web depth. */
export function legacyEmbedded(inp: LegacyEmbeddedInput, c: LegacyEmbeddedContext) {
  const cant = c.gateType === 'Fixed Wheel (cantilevered)'
  const C9 = c.t0 * 1000, C12 = c.wheel.P, C13 = c.wheel.D * 1000, C14 = c.wheel.l * 1000
  const hertz = 0.418 * Math.sqrt(C12 * 1000 * 200000 / (C14 * C13 * 0.5))
  const halfWidth = 1.52 * Math.sqrt(C12 * 1000 * C13 * 0.5 / (C14 * 200000))
  const C21 = inp.sealPlate.thickness + C13 + 62
  const C24 = cant ? 0 : c.Sr * 1000, C25 = c.c * 1000, C26 = c.Lsup * 1000
  const C27 = C26 + 2 * (C24 / 2 + C25 / 2 + C9)
  const C28 = (C27 - c.clearSpan * 1000) / 2
  const C29 = C28 - C24 / 2 - C25 / 2 - C9
  const s = inp.sections
  const ch1 = libChannel(s.ch1), ch2 = libChannel(s.ch2), bm = libBeam(s.beam), sl = libBeam(s.sill), li = libBeam(s.lintel)
  const asShape = (r: typeof bm) => ({ w: r.weight, depth: r.back_flange_width * 1000, width: r.back_flange_t * 1000, tf: r.web_t * 1000, tw: r.web_depth * 1000, I: r.Ixx * 1e4 })
  const E = asShape(bm), F = asShape(sl), G = asShape(li)
  const C40 = ch1.h - C29
  const C41 = C40 - (C28 - C29) + C28
  const C43 = C21 + ch1.b + ch2.b
  const C46 = 0.0588 * C12 * 1000 / Math.cbrt(E.depth ** 2 * E.I)
  const C50 = c.platform - c.sill
  const H = C50 * 1000
  const nCh1 = H / inp.anchorSpacing * 4, nCh2 = H / inp.anchorSpacing * 2
  const side = [
    { ...rolled('Channel section 1', 2, { ...section(s.ch1), w: ch1.w, b: ch1.b, h: ch1.h }, H) },
    { ...rolled('Channel section 2', 2, { ...section(s.ch2), w: ch2.w, b: ch2.b, h: ch2.h }, H) },
    plate('Channel supporting plate', 2, C43, H, inp.holdingPlateT),
    { name: 'I beam', count: 2, width: E.depth, height: H, depth: E.tw, unit: H * E.w / 1000, total: 2 * H * E.w / 1000 },
    anchor('Anchor for channel 1', nCh1, 150, 16), anchor('Anchor for channel 2', nCh2, 150, 16),
    anchor('Anchor for supporting plate', nCh1, 150, 16), anchor('Anchor for beam', nCh1, 75, 16),
    plate('Seal plate', 2, inp.sealPlate.width, H, inp.sealPlate.thickness),
    plate('Roller track plate', 2, inp.rail.width, H, inp.rail.thickness),
    plate('Side roller track plate', 2, 70, H, 16),
    { name: 'Bolt, Nut, Washers', count: nCh2, unit: 0.193, total: nCh2 * 0.193 },
  ]
  const C53 = c.clearSpan * 1000, C58 = c.clearSpan * 1000 + 2 * C41
  const lintel = [
    { name: 'I beam', count: 1, width: G.depth, height: C53, depth: G.tw, unit: G.w * C53 / 1000, total: G.w * C53 / 1000 },
    plate('Sill seal plate', 1, inp.lintelSealPlate.width, C53, inp.lintelSealPlate.thickness),
    anchor('Anchor for beam', C53 / inp.lintelAnchorSpacing, 150, 16),
    { name: 'Bolt, Nut, Washers', count: 8, unit: 0.193, total: 8 * 0.193 },
  ]
  const sill = [
    { name: 'I beam', count: 1, width: F.depth, height: C58, depth: F.tw, unit: F.w * C58 / 1000, total: F.w * C58 / 1000 },
    // the old sheet wires the plate as anchor spacing (C59) wide and seal-plate width (C60) thick; kept as it was (dead sheet)
    plate('Sill seal plate', 1, inp.sillAnchorSpacing, C58, inp.sillSealPlate.width),
    anchor('Anchor for beam', C58 / inp.sillAnchorSpacing, 150, 16),
  ]
  const gross = sum(side) + sum(lintel) + sum(sill)
  return {
    hertz, halfWidth, shearDepth: 0.78 * halfWidth, railT: 4 * 0.78 * halfWidth, slotLength: C21, offsets: [0.15 * C21, 0.1 * C21, 0.2 * C21],
    supports: C24, member: C25, span: C26, gateLength: C27, extension: C28, edgeToWheel: C29, shapes: { E, F, G, ch1, ch2 },
    clearance: C40, slotDepth: C41, holdingPlateW: C43, nicheLength: 150 + E.tw + C21 + ch2.tw + ch1.tw + 0.4, nicheDepth: C41 + inp.holdingPlateT + 150,
    concreteBearing: C46, concreteBearingAllow: 5,
    concreteShear: C46 * E.depth / (E.tw + 1.414 * (C29 + E.depth / 2)), concreteShearAllow: 0.69,
    operatingLength: C50, lintelLength: C53, sillLength: C58,
    groups: [['Side embedded parts', side], ['Lintel beam embedded parts', lintel], ['Sill embedded parts', sill]] as [string, Item[]][],
    subtotals: [sum(side), sum(lintel), sum(sill)], gross, total: 1.1 * gross,
  }
}

export const defaultLegacyEmbedded: LegacyEmbeddedInput = {
  sealPlate: { width: 80, thickness: 10 }, precompression: 4, rail: { thickness: 10, width: 80 }, cornerOffset: 50,
  sections: { ch1: 'ISMC 200', ch2: 'ISMC 250', beam: 'ISMB 350', sill: 'ISMB 200', lintel: 'ISMB 100' }, holdingPlateT: 12,
  anchorSpacing: 300, lintelAnchorSpacing: 300, lintelSealPlate: { width: 80, thickness: 10 },
  sillAnchorSpacing: 300, sillSealPlate: { width: 80, thickness: 10 },
}
