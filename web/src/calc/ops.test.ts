import { describe, expect, it } from 'vitest'
import { beamSpacing } from './beamSpacing'
import { beamSection, type BeamDef } from './defineBeam'
import { defaultDownpull, downpull, type DownpullContext, type DownpullInput, type GateLocation } from './downpull'
import { defaultOperation, operation, openings } from './operation'
import { defaultSeals, seals } from './seals'
import { resolveStiffeners, type GateType } from './stiffeners'
import { weight, weightEnds } from './weight'
import type { SkinLocation } from './secProp'
import { cell, num } from './golden'

const BS = 'Beam Spacing', SP = 'SecProp', VS = 'Stiffeners', WD = 'Wheel Design', DP = 'Downpull', WT = 'Weight & cg', OP = 'Operation'
const close = (actual: number, expected: number, rel = 1e-9, what = '') =>
  expect(Math.abs(actual - expected), what).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(expected)))
const cells = (sheet: string, map: Record<string, number>, rel = 1e-9) => {
  for (const [addr, v] of Object.entries(map)) close(v, num(sheet, addr), rel, `${sheet}!${addr}`)
}
const col = (i: number) => { // 1-based column number → letters
  let s = ''
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const HB = num(BS, 'F9'), D = num(BS, 'F7'), rw = num(BS, 'F12'), Lse = num(SP, 'I6'), Lsup = num(BS, 'F8')
const bs = beamSpacing({ n: num(BS, 'F4'), method: 'equal-moments', acc: 0, D, Lsup, HB, Hp: num(BS, 'F10'), alp: num(BS, 'F11'), rw })
const n = bs.beams.length
const gateType = cell(SP, 'U4') as GateType

describe('Downpull', () => {
  const inp: DownpullInput = {
    location: cell(DP, 'C6') as GateLocation, theta: num(DP, 'C7'), lip: num(DP, 'C8'), a1: num(DP, 'C10'), a2pp: num(DP, 'C11'),
    Q: num(DP, 'C12'), x: num(DP, 'C25'),
  }
  const ctx: DownpullContext = { HB, D, Lse, rw, a2: num(DP, 'C9'), d: num(DP, 'C14'), tsBottom: num(SP, `I${28 + 17 * (n - 1)}`) }
  const r = downpull(inp, ctx)

  it('the defaults are the workbook inputs', () => {
    for (const k of Object.keys(inp) as (keyof DownpullInput)[]) {
      if (typeof inp[k] === 'number') close(defaultDownpull[k] as number, inp[k] as number)
      else expect(defaultDownpull[k]).toBe(inp[k])
    }
  })

  it('matches the setup cells', () => {
    cells(DP, { C16: r.e, C17: r.yo, C18: r.As, C19: r.ratio, C20: r.C2, C21: r.Ao, H11: r.yc, J23: r.hmax })
  })

  const rows = (p: typeof r.at, c: string) => ({
    [`${c}26`]: p.y, [`${c}29`]: p.Cc, [`${c}38`]: p.kB, [`${c}40`]: p.h, [`${c}41`]: p.Vj, [`${c}42`]: p.Qp, [`${c}43`]: p.C1,
    [`${c}45`]: p.xi, [`${c}46`]: p.kTpp, [`${c}47`]: p.Qpp, [`${c}48`]: p.kTp, [`${c}49`]: p.kT, [`${c}50`]: p.dh2, [`${c}51`]: p.Qtot,
    [`${c}52`]: p.Vo, [`${c}53`]: p.Hce, [`${c}54`]: p.dh1, [`${c}55`]: p.hT, [`${c}57`]: p.F1, [`${c}58`]: p.F2, [`${c}59`]: p.F3,
    [`${c}60`]: p.F, [`${c}62`]: p.Qp62, [`${c}63`]: p.Qpp63,
  })

  it('matches the chosen opening and the min/max columns', () => {
    cells(DP, rows(r.at, 'C'))
    cells(DP, rows(r.min, 'D'))
    cells(DP, rows(r.max, 'E'))
    cells(DP, { J19: r.min.F, K19: r.min.x, J20: r.max.F, K20: r.max.x })
  })

  it('matches every column of the 1%–99% sweep', () => {
    r.sweep.forEach((p, i) => cells(DP, rows(p, col(10 + i)), 1e-8)) // J..DD; the sheet's x accumulates +0.01
  })

  it('every bottom-shape curve is selectable', () => {
    const at = (theta: number, lip: number) => downpull({ ...inp, theta, lip }, ctx).at.kB
    cells(DP, { C30: at(45, 0), C31: at(30, 0), C32: at(20, 0), C33: at(0, 0), C34: at(0, 0.15), C35: at(0, 0.3), C36: at(0, 0.45), C37: at(0, 0.6) })
  })
})

// ---------------------------------------------------------------- Weight & cg

const defs = Array.from({ length: n }, (_, j) => ({ type: cell('Define Beam', `D${11 + 3 * j}`), designation: cell('Define Beam', `E${11 + 3 * j}`) }) as BeamDef)
const sections = defs.map(beamSection)
const t = Array.from({ length: n + 1 }, (_, k) => num(SP, `I${k === 0 ? 13 : 11 + 17 * k}`))
const stiff = resolveStiffeners(Array.from({ length: n + 1 }, (_, k) => {
  const r = 13 + 8 * k
  return { spacing: num(VS, `D${r}`), offset: num(VS, `D${r + 1}`), depth: num(VS, `D${r + 2}`), thickness: num(VS, `D${r + 3}`), count: num(VS, `D${r + 4}`) }
}), sections)
const sl = seals(defaultSeals, bs.heads[0], HB, D, Lse, rw)
const wt = weight({
  gateType, D, Lsup, Lse, seals: defaultSeals, spacings: bs.spacings, sections, t, stiff, tap: num(SP, 'S7'), dweb: num(SP, 'S8'),
  wheels: { count: 2 * num('Wheel Spacing', 'E4'), wheelKN: num(WD, 'C67'), axleKN: num(WD, 'C141'), z: num(WD, 'C159') },
  ends: weightEnds(gateType, Lsup, num(WD, 'C157'), {
    cantBh: num(WD, 'C126'), cantB: num(WD, 'C132'), cantC: num(WD, 'C131'), cantA: num(WD, 'C133'), dsLr: num(WD, 'C83'), dsC: num(WD, 'C78'),
  }),
  erbisti: { clearSpan: num('Summary', 'D5'), clearHeight: num('Summary', 'D6'), head: num('Summary', 'D13') },
})

describe('Weight & cg', () => {
  // sheet rows, in the order the port lists the items (no sill bulb row for a wedge sill seal)
  const sheetRows = [15, 16, 17, 18, 20, 21, 22, 23, 25, 27, 28, 30, 31, 33, 34, 35,
    ...Array.from({ length: n }, (_, j) => [37, 38, 39, 40, 41, 42, 43].map((r) => r + 8 * j)).flat()]

  it('lists every item the sheet has, with volume, weight and cg', () => {
    expect(wt.items.length).toBe(sheetRows.length)
    wt.items.forEach((it, i) => {
      const r = sheetRows[i]
      cells(WT, { [`I${r}`]: it.volume, [`K${r}`]: it.weight, [`L${r}`]: it.z })
    })
  })

  it('matches the totals and the Erbisti estimate', () => {
    cells(WT, { D5: wt.volume, D6: wt.mass, D7: wt.cg, D8: wt.erbisti, D9: wt.diffPct })
  })

  it('a non-wedge sill seal adds a bulb in mm (the sheet reads an inch value as metres)', () => {
    const j = { ...defaultSeals, sill: { ...defaultSeals.sill, type: 'J Seal' as const } }
    const w = weight({ ...wtInput(), seals: j })
    const bulb = w.items.find((i) => i.group.startsWith('Sill') && i.name === 'Bulb')!
    expect(bulb.diameter).toBeCloseTo(defaultSeals.sill.dims.B / 1000, 12)
    expect(num(WT, 'H26')).toBe(1.75) // workbook: C51's leftover inch value, used as metres
  })
})
function wtInput() { // the same input as `wt`, for variations
  return {
    gateType, D, Lsup, Lse, seals: defaultSeals, spacings: bs.spacings, sections, t, stiff, tap: num(SP, 'S7'), dweb: num(SP, 'S8'),
    wheels: { count: 4, wheelKN: num(WD, 'C67'), axleKN: num(WD, 'C141'), z: num(WD, 'C159') },
    ends: { skinWidth: num(WT, 'E33'), endBeamT: num(WT, 'E34') },
    erbisti: { clearSpan: 3.5, clearHeight: 2.8, head: 7.53 },
  }
}

// ---------------------------------------------------------------- Operation

describe('Operation', () => {
  const ctx = {
    gateType, loc: cell(SP, 'I4') as SkinLocation, rw, HB, D, mass: num(WT, 'D6'), volume: num(WT, 'D5'),
    hydrostatic: num(OP, 'C8'), hardness: num(WD, 'C35'), wheelD: num(WD, 'C31'), axleD: num(WD, 'C127'), seals: sl,
  }
  const inp = { ballast: num(OP, 'C5'), ballastDensity: num(OP, 'C6'), bearingMu: num(OP, 'C7') }
  const r = operation(inp, ctx)

  it('the defaults are the workbook inputs', () => {
    expect(defaultOperation).toEqual(inp)
  })

  it('matches every column of the closed-to-open table', () => {
    close(r.rolling, num(OP, 'C9'))
    openings.forEach((x, i) => {
      const c = col(5 + i), p = r.columns[i]
      cells(OP, {
        [`${c}12`]: x, [`${c}15`]: p.weight, [`${c}17`]: p.bearing, [`${c}20`]: p.lintelDeflection, [`${c}21`]: p.lintelWater,
        [`${c}22`]: p.sideDeflection, [`${c}23`]: p.sideWater, [`${c}24`]: p.sillDeflection, [`${c}25`]: p.sillWater,
        [`${c}27`]: p.downpull, [`${c}29`]: p.lift, [`${c}30`]: p.lower,
      })
      close(p.rolling, num(OP, `${c}18`))
      expect(cell(OP, `${c}31`)).toBe('200+')
      expect(p.preponderance).toBe(Infinity)
    })
  })

  it('finds the min and max lifting load as the macro does', () => {
    cells(OP, { C12: r.min.x, C29: r.min.lift, D12: r.max.x, D29: r.max.lift, C17: r.min.bearing, D17: r.max.bearing })
  })

  it('downstream skin plate: buoyancy and downpull', () => {
    const dp = (x: number) => 10 * x // kN, any shape
    const d = operation(inp, { ...ctx, loc: 'Downstream', downpull: dp })
    const p = d.columns[3] // x = 0.3
    close(p.weight, num(WT, 'D6') * 9.81 - 1000 * rw * num(WT, 'D5') * 1)
    close(p.downpull, 3000)
    expect(d.columns[0].downpull).toBe(0)
    expect(d.columns[10].downpull).toBe(0)
    // out of the water the sheet's buoyancy factor turns negative; the port stops at 0
    const dry = operation(inp, { ...ctx, loc: 'Downstream', HB: 0.5 * D })
    close(dry.columns[8].weight, num(WT, 'D6') * 9.81)
  })
})
