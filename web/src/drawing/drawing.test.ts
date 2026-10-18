import { describe, expect, it } from 'vitest'
import { beamSpacing } from '../calc/beamSpacing'
import { defaultProject, projectDefaults } from '../calc/project'
import { defaultSeals } from '../calc/seals'
import type { SkinLocation } from '../calc/secProp'
import type { GateType } from '../calc/stiffeners'
import { structure } from '../calc/structure'
import { defaultWheelDesign, wheelDesign, wheelGeometry } from '../calc/wheelDesign'
import { wheelSpacing } from '../calc/wheelSpacing'
import { weightEnds } from '../calc/weight'
import { toDxf } from './dxf'
import { gateModel, stiffenerX, type GateDrawingInput } from './model'
import { bbox, clipShapes, detailSheet, explode, gaSheet, hatch, type SheetMeta } from './sheet'

const meta: SheetMeta = { project: 'Test', title: '', gate: 'G', opening: 'O', date: '2026-10-18', dwgNo: 'VG', notes: ['ONE.', 'TWO.'] }

/** The app's default pipeline (App.tsx) for a gate type and skin plate location. */
function input(gateType: GateType, loc: SkinLocation): GateDrawingInput {
  const d = projectDefaults(defaultProject), wd = defaultWheelDesign
  const bsIn = { n: 5, method: 'equal-moments' as const, acc: 0, D: d.gateHeight, Lsup: d.supportSpan, HB: d.headHfl, Hp: d.headHfl, alp: 0.024, rw: 9.81 }
  const bs = beamSpacing(bsIn)
  const Lse = defaultProject.clearSpan + 0.1
  const stiffeners = [{ spacing: 0.3, thickness: 0.01, count: 12 }]
  const geom = wheelGeometry(wd, { gateType, clearSpan: defaultProject.clearSpan, Lsup: bsIn.Lsup, t0: 0.012, stiffSpacing: 0.3, stiffThickness: 0.01 })
  const st = structure(bs, bsIn.Lsup, {
    gateType, loc, material: { E: 206000, Fyb: 250, Fys: 250, Fyw: 400, beta: 0.75, omegaB: 1.67 }, Lse, tap: geom.tapDefault, dweb: 0.25,
    beams: [{ type: 'I Shape', designation: 'ISMB 350' }], skinThickness: [0.012], stiffeners, endZone: geom.endZone,
  })
  const base = {
    gateType, loc, D: bsIn.D, Lsup: bsIn.Lsup, Lse, tap: geom.tapDefault, dweb: 0.25, ts: st.composites[0].ts, spacings: bs.spacings,
    sections: st.sections, names: st.defs.map(() => 'ISMB 350'), t: st.t, stiff: st.stiff, seals: defaultSeals,
  }
  if (gateType === 'Bulkhead (no wheels)') return base
  const ws = wheelSpacing({ n: 2, method: 'equal-load', acc: 0, seismic: true }, bsIn, Lse)
  const r = wheelDesign(wd, gateType, {
    geometry: geom, maxWheelLoad: ws.maxLoad, psiDeg: Math.max(...st.analyses.map((a) => a.rotationDeg)),
    endBeam: { M: ws.maxMoment, ts: st.composites[0].ts, dweb: 0.25, Lb: bs.maxSpacing }, sideSeal: defaultSeals.lintel.dims, dweb: 0.25, t0: st.t[0],
    material: { E: 206000, Fyb: 250, Fys: 250, Fyw: 400, beta: 0.75, omegaB: 1.67 },
  })
  const c = r.cantInput, cant = gateType === 'Fixed Wheel (cantilevered)'
  return {
    ...base, wheels: {
      double: !cant, spacings: ws.spacings, Dw: r.Dw, tread: geom.tread, track: { b: wd.track.b, d: wd.track.d },
      ...(cant ? { bh: c.bh, d: c.d1, y: c.y, b: c.b, c: c.c, Lr: c.Lr, a: c.a } : { bh: wd.double.bh, d: wd.double.d, y: wd.double.y, b: wd.double.b, c: wd.double.c, Lr: 0, a: 0 }),
    },
  }
}

const cases: [GateType, SkinLocation][] = [
  ['Fixed Wheel (cantilevered)', 'Upstream'], ['Fixed Wheel (double support)', 'Upstream'], ['Bulkhead (no wheels)', 'Downstream'], ['Fixed Wheel (cantilevered)', 'Downstream'],
]

describe('scaled drawings', () => {
  it('place the beams, skin plate and wheels where the calculation has them', () => {
    const inp = input('Fixed Wheel (cantilevered)', 'Upstream')
    const m = gateModel(inp)
    let y = inp.D * 1000
    m.info.yb.forEach((yb, j) => { y -= inp.spacings[j] * 1000; expect(yb).toBeCloseTo(y, 6) })
    const w = inp.wheels!
    const ends = weightEnds(inp.gateType, inp.Lsup, inp.ts, { cantBh: w.bh, cantB: w.b, cantC: w.c, cantA: w.a, dsLr: 0, dsC: 0 })
    expect(m.info.W).toBeCloseTo(ends.skinWidth * 1000, 6) // Weight & cg E33
    expect(m.info.yw).toHaveLength(2)
  })

  it('draws at true scale: the elevation outline measures W / s and D / s on paper', () => {
    const m = gateModel(input('Fixed Wheel (double support)', 'Upstream'))
    const b = bbox(explode({ ...m.elevation, shapes: m.elevation.shapes.slice(0, 1), dims: [], notes: [], labels: [], cuts: [], arrows: [] }, 20, [0, 0]))
    expect(b[2] - b[0]).toBeCloseTo(m.info.W / 20, 9)
    expect(b[3] - b[1]).toBeCloseTo(m.info.D / 20, 9)
  })

  it.each(cases)('builds both sheets and a DXF for %s, skin plate %s', (gateType, loc) => {
    const m = gateModel(input(gateType, loc))
    for (const sh of [gaSheet(m, 'A1', 'auto', meta), detailSheet(m, 'A1', meta)]) {
      expect(sh.warnings).toEqual([])
      expect(JSON.stringify(sh.prims)).not.toMatch(/NaN|null|Infinity/)
      const dxf = toDxf(sh)
      expect(dxf).toMatch(/^ {2}0\r\nSECTION\r\n {2}2\r\nHEADER/)
      expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
      expect(dxf).not.toMatch(/NaN|undefined/)
    }
    const ga = gaSheet(m, 'A1', 'auto', meta)
    expect(ga.scale).toBe(10) // the largest standard scale that fits: 1:5 does not
    expect(gaSheet(m, 'A1', 5, meta).warnings.join()).toMatch(/do not fit/)
    const texts = ga.prims.flatMap((p) => (p.k === 'text' ? [p.s] : []))
    expect(texts).toContain(String(Math.round(m.info.W))) // overall width dimension
    expect(texts).toContain(String(Math.round(m.info.Lsup)))
    expect(texts).toContain('SECTION A-A')
    expect(m.details.length).toBeGreaterThanOrEqual(gateType === 'Bulkhead (no wheels)' ? 3 : 4)
  })

  it('warns instead of overflowing when the views cannot fit', () => {
    const m = gateModel(input('Fixed Wheel (cantilevered)', 'Upstream'))
    expect(gaSheet(m, 'A3', 2, meta).warnings.join()).toMatch(/do not fit/)
  })

  it('positions stiffeners symmetrically about the centre', () => {
    expect(stiffenerX({ spacing: 300, offset: 150, count: 4, depth: 0, thickness: 0 })).toEqual([-450, -150, 150, 450])
    expect(stiffenerX({ spacing: 300, offset: 0, count: 3, depth: 0, thickness: 0 })).toEqual([-300, 0, 300])
  })

  it('clips to a detail window and hatches cut faces', () => {
    const sq = { k: 'poly' as const, pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][], closed: true, layer: 'cut' as const }
    const [c] = clipShapes([sq], [5, -5, 20, 20])
    expect(c.k === 'poly' && bbox([{ k: 'poly', pts: c.pts, layer: 'CUT' }])).toEqual([5, 0, 10, 10])
    const open = clipShapes([{ ...sq, layer: 'outline' }], [5, -5, 20, 20]) // outline: segments only, no closing edge
    expect(open).toHaveLength(3)
    expect(hatch(sq.pts).length).toBe(7) // 45° lines every 2 mm across a 10 mm square: diagonal 14.1, so c = -6 .. 6
  })
})
