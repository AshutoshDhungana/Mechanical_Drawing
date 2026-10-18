// Stiffeners sheet: vertical stiffeners in each skin plate panel (0 = above beam 1, i = below beam i).
// Units: m, kN; stresses MPa.
import type { BeamSection } from './defineBeam'
import type { PanelPlate } from './stress'

export type GateType = 'Bulkhead (no wheels)' | 'Fixed Wheel (cantilevered)' | 'Fixed Wheel (double support)'

export interface StiffenerInput {
  spacing?: number
  offset?: number // distance of the nearest stiffener from the gate centre
  depth?: number
  thickness?: number
  count?: number
}

export interface Stiffener { spacing: number; offset: number; depth: number; thickness: number; count: number }

/**
 * Fill each panel from the one above, as the sheet's D-column formulas do. Panel 0 needs spacing, thickness
 * and count; its offset defaults to half a spacing for an even count (a gap at the centre) or 0 for odd,
 * and its depth to the web + front flange of beam 1.
 */
export function resolveStiffeners(input: StiffenerInput[], beams: BeamSection[]): Stiffener[] {
  const n = beams.length
  const first = input[0] ?? {}
  if (first.spacing === undefined || first.thickness === undefined || first.count === undefined)
    throw new RangeError('Stiffeners above beam 1 need spacing, thickness and count')
  // The sheet's depth suggestion for this panel reads beam 2 (an OFFSET slip); beam 1 is the one it sits on.
  let prev: Stiffener = {
    spacing: first.spacing, thickness: first.thickness, count: first.count,
    offset: first.offset ?? (first.count % 2 === 0 ? first.spacing / 2 : 0),
    depth: first.depth ?? beams[0].dw + beams[0].tff,
  }
  const out = [prev]
  for (let k = 1; k <= n; k++) {
    prev = { ...prev, ...definedOnly(input[k]) }
    out.push(prev)
  }
  return out
}

function definedOnly(o: StiffenerInput | undefined): Partial<Stiffener> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined))
}

/** Length at each end taken by the wheel/end stiffener zone (Stiffeners!O15); from Wheel Design geometry. */
export function endZone(gateType: GateType, cantilevered: number, doubleSupport: number) {
  return gateType === 'Fixed Wheel (cantilevered)' ? cantilevered : gateType === 'Fixed Wheel (double support)' ? doubleSupport : 0
}

/** Column E: suggested values for a panel. innerSpan = span between the inner end stiffeners (Lsup − end zone). */
export function suggestions(st: Stiffener, beam: BeamSection, innerSpan: number) {
  return {
    spacing: innerSpan / (st.count + 1),
    offset: st.count % 2 === 1 ? 0 : st.spacing / 2,
    depth: beam.dw + beam.tff,
    // the sheet rounds the web thickness in metres to 1/16, which always gives 0; this rounds to 1/16 in
    thickness: (Math.round((beam.tw / 0.0254) * 16) / 16) * 0.0254,
    count: Math.ceil(innerSpan / st.spacing - 1e-9) - 1,
  }
}

const STEEL = 7.85 * 9.81 // kN/m3

export interface StiffenerStress { weightAbove: number; shear: number; bending: number; compression: number; combined: number }

/**
 * Column J. Bending from the adopted skin plate moment at the beam(s) over the stiffener's tributary width;
 * shear from the change in beam load across the panel; compression from the weight of beams above.
 */
export function stiffenerStresses(st: Stiffener[], beams: BeamSection[], spacings: number[], t: number[],
  panels: PanelPlate[], q: number[]): StiffenerStress[] {
  const n = beams.length
  const out: StiffenerStress[] = []
  let weight = 0
  for (let k = 0; k <= n; k++) {
    const { spacing: s, depth: d, thickness: tt, count } = st[k]
    const on = count > 0 ? 1 : 0
    let shear = 0, moment: number
    if (k === 0) moment = panels[0].P['④']!
    else {
      const b = beams[k - 1]
      // ponytail: plate on both sides of every beam is counted, so plate between beams is counted twice (flagged)
      weight += (b.bfb * b.tfb + b.tw * b.dw + b.bff * b.tff + spacings[k - 1] * t[k - 1] + spacings[k] * t[k]) * s * STEEL
      if (k < n) shear = Math.abs(q[k - 1] - q[k]) * s / tt / d / 1000 * on
      moment = k < n ? Math.max(panels[k].P['⑥']!, panels[k].P['④']!) : panels[n].P['⑥']!
    }
    const bending = moment * s * 6 / tt / d ** 2 / 1000 * on
    const compression = k === 0 ? 0 : weight / tt / d / 1000 * on
    out.push({ weightAbove: k === 0 ? 0 : weight, shear, bending, compression, combined: Math.sqrt((bending + compression) ** 2 + 3 * shear ** 2) })
  }
  return out
}
