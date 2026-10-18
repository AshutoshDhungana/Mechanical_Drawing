import { describe, expect, it } from 'vitest'
import { beamSpacing, equalLoadClassic, roundSpacings, type BeamSpacingInput } from './beamSpacing'
import { cell, num } from './golden'

const BS = 'Beam Spacing'
const golden: BeamSpacingInput = {
  n: num(BS, 'F4'),
  method: 'equal-moments',
  acc: num(BS, 'F6'),
  D: num(BS, 'F7'),
  Lsup: num(BS, 'F8'),
  HB: num(BS, 'F9'),
  Hp: num(BS, 'F10'),
  alp: num(BS, 'F11'),
  rw: num(BS, 'F12'),
}

const close = (actual: number, expected: number, rel = 1e-9) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(expected)))

describe('Beam Spacing vs workbook golden values (equal moments, n = 5)', () => {
  it('uses the saved method', () => expect(cell(BS, 'F5')).toBe('Equal moments'))

  const r = beamSpacing(golden)
  const n = golden.n

  it('spacings C20..C35', () => r.spacings.forEach((l, k) => close(l, num(BS, `C${20 + 3 * k}`))))
  it('heads F and pressures G at seal, beams and sill', () =>
    r.heads.forEach((h, k) => {
      close(h, num(BS, `F${18 + 3 * k}`))
      close(r.pressures[k], num(BS, `G${18 + 3 * k}`))
    }))
  it('effective width factors J', () => r.widthFactors.forEach((j, k) => close(j, num(BS, `J${20 + 3 * k}`))))
  it('beam loads H, skin plate moments I, effective widths K', () =>
    r.beams.forEach((b, j) => {
      const row = 21 + 3 * j
      close(b.load, num(BS, `H${row}`))
      close(b.moment, num(BS, `I${row}`))
      close(b.effectiveWidth, num(BS, `K${row}`))
    }))
  it('totals H17, N4, S4 and beam count', () => {
    close(r.totalLoad, num(BS, 'H17'))
    close(r.maxLoad, num(BS, 'N4'))
    close(r.maxSpacing, num(BS, 'S4'))
    expect(r.beams).toHaveLength(n)
    expect(r.warnings).toEqual([])
  })
})

describe('independent checks', () => {
  const cases = [2, 3, 5, 8, 12].flatMap((n) =>
    (['equal-moments', 'equal-load-classic', 'equal-load-exact'] as const).map((method) => ({ ...golden, n, method })),
  )

  it.each(cases)('$method, n=$n: spacings fill the gate and loads balance the pressure', (inp) => {
    const r = beamSpacing(inp)
    close(r.spacings.reduce((a, b) => a + b), inp.D, 1e-9)
    expect(r.spacings.every((l) => l > 0)).toBe(true)
    // equilibrium: beam loads = area of the (piecewise-linear) pressure diagram
    const area = r.spacings.reduce((s, l, k) => s + ((r.pressures[k] + r.pressures[k + 1]) / 2) * l, 0)
    close(r.totalLoad, area, 1e-9)
  })

  it('equal load (exact) gives every beam the same hydrostatic load', () => {
    for (const n of [3, 5, 8]) {
      const inp = { ...golden, n, method: 'equal-load-exact' as const, alp: 0 }
      const r = beamSpacing(inp)
      const lpb = ((inp.HB ** 2 - (inp.HB - inp.D) ** 2) / 2 / n) * inp.rw
      r.beams.forEach((b) => close(b.load, lpb, 1e-4))
    }
  })

  it('equal load (classic) puts each beam at the centroid of an equal-load strip (Erbiste p.130)', () => {
    const { HB, D } = golden
    for (const n of [3, 5, 8]) {
      const L = equalLoadClassic(n, D, HB)
      const c = (n * (HB - D) ** 2) / (HB ** 2 - (HB - D) ** 2)
      const edge = (k: number) => HB * Math.sqrt((k + c) / (n + c)) // depth of strip boundary k
      close(edge(0), HB - D, 1e-12)
      let depth = HB - D
      for (let k = 1; k <= n; k++) {
        depth += L[k - 1]
        const [a, b] = [edge(k - 1), edge(k)]
        close(b ** 2 - a ** 2, (HB ** 2 - (HB - D) ** 2) / n, 1e-12) // equal load per strip
        close(depth, ((2 / 3) * (b ** 3 - a ** 3)) / (b ** 2 - a ** 2), 1e-12) // centroid
      }
    }
  })

  it('rounding: multiples of the step, total equals rounded D, worst errors rounded up', () => {
    const acc = 0.0127
    const L = [0.27235, 0.63825, 0.61009, 0.58677, 0.56699, 0.22555]
    const R = roundSpacings(L, 2.9, acc)
    R.forEach((l) => close(l / acc, Math.round(l / acc), 1e-9))
    close(R.reduce((a, b) => a + b), Math.round(2.9 / acc) * acc, 1e-9)
    R.forEach((l, i) => expect(Math.abs(l - L[i])).toBeLessThan(acc))
  })

  it('manual spacings pass through; the top cantilever takes the remainder', () => {
    const r = beamSpacing({ ...golden, n: 3, method: 'manual', manual: [0.9, 0.9, 0.5] })
    close(r.spacings[0], 2.9 - 2.3, 1e-12)
    expect(r.spacings.slice(1)).toEqual([0.9, 0.9, 0.5])
  })

  it('rejects bad input and warns on odd geometry', () => {
    expect(() => beamSpacing({ ...golden, n: 1 })).toThrow()
    expect(beamSpacing({ ...golden, method: 'manual', manual: [1, 1, 1, 1, 1] }).warnings.join()).toMatch(/negative/)
    expect(beamSpacing({ ...golden, HB: 2, Hp: 2 }).warnings.join()).toMatch(/dry/)
  })
})
