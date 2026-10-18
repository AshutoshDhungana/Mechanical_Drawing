import { describe, expect, it } from 'vitest'
import { beamSpacing } from './beamSpacing'
import type { BeamDef } from './defineBeam'
import { structure, type StructureInput } from './structure'
import { taperMaxLocation, taperSection } from './secProp'
import { modifiedLoads, plateCoef, type Point } from './stress'
import { resolveStiffeners } from './stiffeners'
import { cell, num } from './golden'

const BS = 'Beam Spacing', DB = 'Define Beam', SP = 'SecProp', ST = 'Stress', VS = 'Stiffeners'
const IN = 0.0254 // the sheets carry some quantities multiplied by 0.0254

const close = (actual: number, expected: number, rel = 1e-9, what = '') =>
  expect(Math.abs(actual - expected), what).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(expected)))

const bs = beamSpacing({
  n: num(BS, 'F4'), method: 'equal-moments', acc: 0, D: num(BS, 'F7'), Lsup: num(BS, 'F8'),
  HB: num(BS, 'F9'), Hp: num(BS, 'F10'), alp: num(BS, 'F11'), rw: num(BS, 'F12'),
})
const n = bs.beams.length
const Lsup = num(BS, 'F8')
const beamRow = (i: number) => 11 + 3 * (i - 1)
const block = (i: number) => 13 + 17 * (i - 1) // SecProp block of beam i
const panelRow = (k: number) => 13 + 8 * k // Stiffeners block of panel k

const input: StructureInput = {
  gateType: cell(SP, 'U4') as StructureInput['gateType'],
  loc: cell(SP, 'I4') as StructureInput['loc'],
  material: { E: num(SP, 'I5'), Fyb: num(SP, 'S4'), Fys: num(SP, 'S5'), Fyw: num(SP, 'S6'), beta: num(SP, 'I7'), omegaB: num(SP, 'I8') },
  Lse: num(SP, 'I6'), tap: num(SP, 'S7'), dweb: num(SP, 'S8'),
  beams: Array.from({ length: n }, (_, j) => ({ type: cell(DB, `D${beamRow(j + 1)}`), designation: cell(DB, `E${beamRow(j + 1)}`) }) as BeamDef),
  skinThickness: Array.from({ length: n + 1 }, (_, k) => num(SP, `I${k === 0 ? 13 : 11 + 17 * k}`)),
  stiffeners: Array.from({ length: n + 1 }, (_, k) => {
    const r = panelRow(k)
    return { spacing: num(VS, `D${r}`), offset: num(VS, `D${r + 1}`), depth: num(VS, `D${r + 2}`), thickness: num(VS, `D${r + 3}`), count: num(VS, `D${r + 4}`) }
  }),
  endZone: num(VS, 'O15'),
  taperX: Array.from({ length: n }, (_, j) => num(SP, `V${block(j + 1) + 12}`)), // TaperCalc's saved result
}
const r = structure(bs, Lsup, input)

describe('Define Beam', () => {
  it('sections F–K', () => r.sections.forEach((s, j) => {
    const row = beamRow(j + 1)
    ;(['bfb', 'tfb', 'tw', 'dw', 'bff', 'tff'] as const).forEach((k, c) => close(s[k], num(DB, `${'FGHIJK'[c]}${row}`)))
  }))
})

describe('SecProp', () => {
  const at = (col: string, row: number) => num(SP, `${col}${row}`)
  it('composite section S14–S27', () => r.composites.forEach((c, j) => {
    const b = block(j + 1)
    const map: [keyof typeof c, number][] = [['A', 1], ['sk', 3], ['ts', 4], ['Ix', 5], ['Iy', 6], ['d', 7], ['cgc', 8], ['cgt', 9], ['Sxc', 10], ['Sxt', 11], ['J', 12], ['yp', 13], ['Zx', 14]]
    for (const [k, o] of map) close(c[k], at('S', b + o), 1e-9, `beam ${j + 1} ${k}`)
  }))
  it('flexural strength Y–AJ and Mn', () => r.strengths.forEach((f, j) => {
    const b = block(j + 1)
    const map: [keyof typeof f, string, number][] = [
      ['Myc', 'Z', 2], ['Mp', 'Z', 3], ['hc', 'Z', 4], ['hp', 'Z', 5], ['lpw', 'Z', 6], ['lrw', 'Z', 7], ['lw', 'Z', 8], ['Rpc', 'Z', 9],
      ['bfc', 'Z', 10], ['tfc', 'Z', 11], ['aw', 'Z', 12], ['Rpg', 'Z', 13], ['Mn1', 'Z', 14],
      ['Iyc', 'AC', 2], ['ho', 'AC', 3], ['rt', 'AC', 4], ['Lp', 'AC', 5], ['Fcr', 'AC', 6], ['FL', 'AC', 7], ['Lr', 'AC', 8],
      ['Mn2F4', 'AC', 9], ['Lr5', 'AC', 10], ['Fcr5', 'AC', 11], ['Mn2F5', 'AC', 12], ['Mn2', 'AC', 13],
      ['kc', 'AF', 2], ['lpf', 'AF', 3], ['lrf', 'AF', 4], ['lf', 'AF', 5], ['Mn3F4', 'AF', 6], ['Fcr3', 'AF', 7], ['Mn3F5', 'AF', 8], ['Mn3', 'AF', 9],
      ['Myt', 'AI', 2], ['Rpt', 'AI', 3], ['Mn4', 'AI', 6], ['Mn', 'S', 15],
    ]
    for (const [k, col, o] of map) close(f[k], at(col, b + o), 1e-9, `beam ${j + 1} ${k}`)
    close(Math.min(r.stiff[j].spacing, r.stiff[j + 1].spacing), at('S', b + 2))
  }))
  it('beam analysis T–W', () => r.analyses.forEach((a, j) => {
    const b = block(j + 1)
    close(a.q * IN, at('V', b + 1))
    const map: [number, string, number][] = [
      [a.MB, 'V', 2], [a.fb1, 'V', 3], [a.fb1Allow, 'W', 3], [a.fb2, 'V', 4], [a.fb2Allow, 'W', 4], [a.deflection, 'V', 5],
      [a.spanRatio, 'V', 6], [a.rotationDeg, 'V', 7], [a.fvAllow, 'W', 11],
      [a.taperX, 'V', 12],
      // beams 2..n: the sheet's taper moment lacks the /0.0254 that beam 1 has, so it is 0.0254× too small
      ...([[a.taper.M, 'V', 13], [a.taper.fbt1, 'V', 14], [a.taper.fbt2, 'V', 15]] as const).map(([v, c, o]) => [j === 0 ? v : v * IN, c, o] as [number, string, number]),
      [a.taper.A, 'AO', 1], [a.taper.Ix, 'AO', 2], [a.taper.d, 'AO', 3], [a.taper.cg1, 'AO', 4], [a.taper.cg2, 'AO', 5],
      [a.taper.Sx1, 'AO', 6], [a.taper.Sx2, 'AO', 7], [a.taper.dwe, 'AO', 8],
    ]
    map.forEach(([v, col, o]) => close(v, at(col, b + o), 1e-9, `beam ${j + 1} ${col}${b + o}`))
    expect(cell(SP, `V${b + 9}`)).toBe('NA') // rolled sections: no fabrication welds
    expect(a.weldFlangeWeb).toBeUndefined()
  }))
  it('deviation: shear at support — sheet shows beam i-1 value for beam i', () => r.analyses.forEach((a, j) =>
    close(j === 0 ? a.fv : r.analyses[j - 1].fv, at('V', block(j + 1) + 11))))
  it('deviation: skin weld rounded to 1/16 in on the inch value (sheet always gives 1/16 in)', () => {
    expect(num(SP, 'V21')).toBeCloseTo(IN / 16, 12)
    close(r.analyses[0].weldSkin, 2 * IN / 16, 1e-12) // 3.16 mm required → 1/8 in
  })
})

describe('Stress', () => {
  it('modified beam loads AL', () => r.loads.forEach((q, j) => close(q * IN, num(ST, `AL${16 + 12 * j}`))))
  it('total load AK10 equals Beam Spacing total (moments only redistribute)', () => close(r.loads.reduce((a, b) => a + b) * IN, num(ST, 'AK10')))

  const rows: { k: number; row: number; pt: Point }[] = [
    ...(['①', '②', '③', '④'] as const).map((pt, o) => ({ k: 0, row: 11 + o, pt })),
    ...Array.from({ length: n - 1 }, (_, j) => (['①', '②', '③', '④', '⑤', '⑥'] as const).map((pt, o) => ({ k: j + 1, row: 19 + 12 * j + o, pt }))).flat(),
    ...(['①', '②', '⑤', '⑥'] as const).map((pt, o) => ({ k: n, row: 18 + 12 * (n - 1) + o, pt })),
  ]
  const deviates = (k: number, pt: Point) => k === n && pt === '⑤' // sheet reads empty Z129 here
  it.each(rows)('panel $k point $pt (row $row)', ({ k, row, pt }) => {
    const c = r.checks[k].find((x) => x.point === pt)!
    const g = (col: string) => num(ST, `${col}${row}`)
    close(c.beamMoment, g('L'))
    close(c.beamStress, g('M'))
    close(c.beamAllow, g('O'))
    close(c.plateAllow, g('S'))
    if (c.combinedAllow !== undefined) close(c.combinedAllow, g('V'))
    if (deviates(k, pt)) {
      expect(g('P')).toBe(0)
      close(c.plateMoment, (1 - r.sections[n - 1].bff / 2 / bs.spacings[n]) ** 2 * r.checks[k].find((x) => x.point === '⑥')!.plateMoment)
      return
    }
    close(c.plateMoment * IN, g('P'))
    close(c.plateStress, g('Q'))
    if (c.combined !== undefined) close(c.combined, g('T'))
    close(c.ratio, g('W'))
  })
  it('panel b/a ratios', () => {
    close(r.panels[0].ratio, num(ST, 'AB12'))
    for (let j = 0; j < n - 1; j++) close(r.panels[j + 1].ratio, num(ST, `AB${22 + 12 * j}`))
    close(r.panels[n].ratio, num(ST, `AB${20 + 12 * (n - 1)}`))
  })
})

describe('Stiffeners', () => {
  it('stresses J', () => r.stiffStress.forEach((s, k) => {
    const row = panelRow(k)
    ;[s.weightAbove, s.shear, s.bending, s.compression, s.combined].forEach((v, o) => close(v, num(VS, `J${row + o}`), 1e-9, `panel ${k} J${row + o}`))
  }))
  it('suggestions E (thickness deviates: sheet rounds metres to 1/16 → 0)', () => r.suggested.forEach((s, k) => {
    const row = panelRow(k)
    close(s.spacing, num(VS, `E${row}`))
    close(s.offset, num(VS, `E${row + 1}`))
    close(s.depth, num(VS, `E${row + 2}`))
    expect(num(VS, `E${row + 3}`)).toBe(0)
    close(s.thickness, 5 / 16 * IN) // 8.1 mm web → 5/16 in
    close(s.count, num(VS, `E${row + 4}`))
  }))
  it('defaults chain from the panel above', () => {
    const st = resolveStiffeners([{ spacing: 0.3, thickness: 0.01, count: 12 }, {}, { spacing: 0.25 }], r.sections)
    expect(st.map((s) => s.spacing)).toEqual([0.3, 0.3, 0.25, 0.25, 0.25, 0.25])
    expect(st[0].offset).toBe(0.15) // even count → half a spacing
    close(st[0].depth, num(VS, 'D15'))
  })
})

describe('independent checks', () => {
  it('plate coefficient interpolation hits table rows and halves between them', () => {
    expect(plateCoef('CCCF', 'CCCFA', 1)).toBeCloseTo(0.05271, 4)
    expect(plateCoef('CCCC', 'CCCCA', 1.5)).toBeCloseTo(0.07566, 3) // sheet rounds 0.07566×0.0254 to 5 dp
    expect(plateCoef('CCCC', 'CCCCA', 1.05)).toBeCloseTo((0.05133 + 0.0581) / 2, 3)
  })
  it('modified loads always sum to the pressure area', () => {
    const total = bs.spacings.reduce((s, l, k) => s + (bs.pressures[k] + bs.pressures[k + 1]) / 2 * l, 0)
    close(modifiedLoads(bs, r.panels).reduce((a, b) => a + b), total, 1e-12)
  })
  it('taper search finds the maximum back-flange stress', () => {
    const [s, c, a] = [r.sections[0], r.composites[0], r.analyses[0]]
    const g = { loc: input.loc, Lsup, Lse: input.Lse, tap: input.tap, dweb: input.dweb }
    const x = taperMaxLocation(s, c, a.q, g)
    const f = (x: number) => taperSection(s, c, a.q, x, g).fbt2
    for (let k = 0; k <= 200; k++) expect(f(x)).toBeGreaterThanOrEqual(f(input.tap * k / 200) - 1e-12)
    close(x, num(SP, 'V25'), 1e-4) // VBA step search lands within its 0.0001 in step
  })
  it('composite section of a symmetric I alone: centroid at mid-depth, plastic NA too', () => {
    const s = r.sections[0]
    const c = structure(bs, Lsup, { ...input, skinThickness: [1e-9] }).composites[2]
    close(c.yp, c.d / 2, 1e-4)
    close(c.Ix, (s.bff * s.tff ** 3 / 12 + s.bff * s.tff * ((s.dw + s.tff) / 2) ** 2) * 2 + s.tw * s.dw ** 3 / 12, 1e-4)
  })
})
