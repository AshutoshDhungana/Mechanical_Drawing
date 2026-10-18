// Define Beam sheet: the cross-section of each horizontal beam. Units: m.
import shapes from '../../../data/tables/gate_shapes.json'

export interface BeamSection {
  bfb: number // back flange width
  tfb: number // back flange thickness
  tw: number // web thickness
  dw: number // web depth (clear, between flanges)
  bff: number // front flange width (against the skin plate)
  tff: number // front flange thickness
}

/** 'I Shape' = a rolled ISMB from the table; 'Fabricated Shape' = plate sizes given directly.
 *  (The workbook also lists 'ISNT Shape', but has no table for it and its macro does nothing.) */
export type BeamDef =
  | { type: 'I Shape'; designation: string }
  | ({ type: 'Fabricated Shape' } & BeamSection)

export const rolledSections = shapes.rows.map((r) => r.designation)

export function beamSection(def: BeamDef): BeamSection {
  if (def.type === 'Fabricated Shape') {
    const { bfb, tfb, tw, dw, bff, tff } = def
    return { bfb, tfb, tw, dw, bff, tff }
  }
  const r = shapes.rows.find((s) => s.designation === def.designation)
  if (!r) throw new RangeError(`Unknown section ${def.designation}`)
  return {
    bfb: r.back_flange_width, tfb: r.back_flange_t, tw: r.web_t, dw: r.web_depth, bff: r.flange_width, tff: r.flange_t,
  }
}
