import { describe, expect, it } from 'vitest'
import { beamSpacing, type BeamSpacingInput } from './beamSpacing'
import { seal, seals, type SealDims, type SealType } from './seals'
import { wheelSpacing } from './wheelSpacing'
import {
  cantilevered, defaultWheelDesign, defaultWheelIs, doubleSupport, ellipticalContact, wheelIs, lineContact, track, wheelAxisOffset, wheelDesign, wheelGeometry,
  type EllipticalInput, type EndBeamLoad, type WheelDesignInput,
} from './wheelDesign'
import type { Material } from './secProp'
import type { GateType } from './stiffeners'
import { cell, num } from './golden'

const BS = 'Beam Spacing', SE = 'Seals', WS = 'Wheel Spacing', WD = 'Wheel Design', SP = 'SecProp', VS = 'Stiffeners'
const close = (actual: number, expected: number, rel = 1e-9, what = '') =>
  expect(Math.abs(actual - expected), what).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(expected)))
const cells = (sheet: string, map: Record<string, number>, rel = 1e-9) => {
  for (const [addr, v] of Object.entries(map)) close(v, num(sheet, addr), rel, `${sheet}!${addr}`)
}

const bsIn: BeamSpacingInput = {
  n: num(BS, 'F4'), method: 'equal-moments', acc: 0, D: num(BS, 'F7'), Lsup: num(BS, 'F8'),
  HB: num(BS, 'F9'), Hp: num(BS, 'F10'), alp: num(BS, 'F11'), rw: num(BS, 'F12'),
}
const bs = beamSpacing(bsIn)
const Lse = num(SP, 'I6')
const material: Material = { E: num(SP, 'I5'), Fyb: num(SP, 'S4'), Fys: num(SP, 'S5'), Fyw: num(SP, 'S6'), beta: num(SP, 'I7'), omegaB: num(SP, 'I8') }
const gateType = cell(SP, 'U4') as GateType

describe('Seals', () => {
  const dims = (r: number): SealDims => ({
    B: num(SE, `C${r}`), t: num(SE, `C${r + 1}`), delta: num(SE, `C${r + 2}`), x: num(SE, `C${r + 3}`), mu: num(SE, `C${r + 4}`),
    cw: num(SE, `C${r + 6}`), ct: num(SE, `C${r + 7}`), mt: num(SE, `C${r + 8}`),
  })
  const r = seals({
    lintel: { type: cell(SE, 'C6') as SealType, dims: dims(7) },
    side: { type: cell(SE, 'C28') as SealType },
    sill: { type: cell(SE, 'C50') as SealType, dims: dims(51) },
  }, bs.heads[0], bsIn.HB, bsIn.D, Lse, bsIn.rw)

  it('matches the lintel and side seal blocks', () => {
    const block = (s: typeof r.lintel, row: number) => ({
      [`C${row}`]: s.k, [`C${row + 1}`]: s.pressure, [`C${row + 2}`]: s.length, [`C${row + 3}`]: s.F,
      [`C${row + 4}`]: s.deflectionLoad, [`C${row + 5}`]: s.frictionDeflection, [`C${row + 6}`]: s.frictionWater, [`C${row + 7}`]: s.total,
    })
    cells(SE, block(r.lintel, 17))
    cells(SE, block(r.side, 39))
  })

  it('a wedge sill seal has no friction from the stem formulas', () => {
    expect(r.sill.active).toBe(false)
    cells(SE, { C68: r.sill.frictionDeflection, C69: r.sill.frictionWater, C70: r.sill.total })
  })

  it('a J sill seal uses the SI formulas (the sheet still has lbf/psi ones)', () => {
    const lintelLike = seal({ type: 'J Seal', dims: dims(7) }, bsIn.rw * bsIn.HB * 0.001, Lse)
    expect(lintelLike.k).toBeCloseTo(num(SE, 'C17'), 12) // same seal, same stiffness as the lintel
    expect(lintelLike.pressure).toBeCloseTo(bsIn.rw * bsIn.HB / 1000, 12) // sheet C64: Rw·HB, no 0.001
  })
})

describe('Wheel Spacing', () => {
  const ws = wheelSpacing({ n: num(WS, 'E4'), method: 'equal-load', acc: num(WS, 'E6'), seismic: cell(WS, 'E7') === 'Included' }, bsIn, Lse)

  it('solves the equal-load spacings the VBA saved', () => {
    cells(WS, { B15: ws.spacings[0], B18: ws.spacings[1], B21: ws.spacings[2] }, 1e-7) // VBA stops at 1e-7 m
  })

  it('matches heads, pressures, wheel loads and end beam moments', () => {
    const fixed = wheelSpacing({ n: 2, method: 'manual', acc: 0, seismic: true, manual: [num(WS, 'B18'), num(WS, 'B21')] }, bsIn, Lse)
    cells(WS, {
      E13: fixed.heads[0], F13: fixed.pressures[0], E16: fixed.heads[1], F16: fixed.pressures[1],
      E19: fixed.heads[2], F19: fixed.pressures[2], E22: fixed.heads[3], F22: fixed.pressures[3],
      N16: fixed.wheels[0].loadPerM, G16: fixed.wheels[0].load, H16: fixed.wheels[0].moment,
      N19: fixed.wheels[1].loadPerM, G19: fixed.wheels[1].load, H19: fixed.wheels[1].moment,
      G12: fixed.totalLoad, K3: fixed.maxMoment, K4: fixed.maxLoad,
    })
  })

  it('seismic off drops the Westergaard term', () => {
    const dry = wheelSpacing({ n: 2, method: 'manual', acc: 0, seismic: false, manual: [1.5, 0.6] }, bsIn, Lse)
    close(dry.pressures[1], dry.heads[1] * bsIn.rw)
  })
})

// ---------------------------------------------------------------- Wheel Design

const ellIn: EllipticalInput = {
  P: num(WD, 'C6'), D: num(WD, 'C7'), Rt: num(WD, 'C8'), RT: num(WD, 'C9'), nu: num(WD, 'C10'), E: num(WD, 'C11'),
  hardness: num(WD, 'C12'), c: num(WD, 'C22'), bt: num(WD, 'C23'), t: num(WD, 'C24'), dh: num(WD, 'C25'), dt: num(WD, 'C26'),
}
const psiDeg = num(WD, 'C20')
const endLoad: EndBeamLoad = { M: num(WD, 'C101'), ts: num(WD, 'C103'), dweb: num(WD, 'C104'), Lb: num(WD, 'J109') }

describe('Wheel Design: elliptical contact', () => {
  const e = ellipticalContact(ellIn, psiDeg, { kPrime: num(WD, 'G8'), phi: num(WD, 'G13') })

  it('matches every cell with the saved k′ and φ', () => {
    cells(WD, {
      G6: e.A, G7: e.B, G9: e.k, G10: e.E, G11: e.K, G14: e.Lam, G15: e.H, G16: e.F, G17: e.zeta, G18: e.M, G19: e.tau,
      G20: e.Ox, G21: e.Opx, G22: e.Oy, G23: e.Opy, G24: e.Xx, G25: e.Yy, G26: e.Zz, G27: e.Zy,
      C13: e.a, C14: e.b, C15: e.sigmaC, D15: e.sigmaCAllow, C16: e.tau0, D16: e.tauAllow, C17: e.tau1, C18: e.Zreq,
      C21: e.offset, D23: e.treadReq,
    })
    expect(Math.abs(e.bal)).toBeLessThan(1e-8) // G12 = -2e-9
  })

  it('Findk and Maximize: solves k′ and φ itself', () => {
    const s = ellipticalContact(ellIn, psiDeg)
    expect(Math.abs(s.bal)).toBeLessThan(1e-12)
    close(s.kPrime, num(WD, 'G8'), 1e-8)
    expect(s.Zy).toBeGreaterThanOrEqual(num(WD, 'G27') - 1e-9) // at least the VBA's maximum
    expect(Math.abs(s.phi - num(WD, 'G13'))).toBeLessThan(3e-5) // the VBA steps φ down to 1e-5
    close(s.Zy, num(WD, 'G27'), 1e-8) // a true maximum, a hair above the VBA's
  })

  it('the quadrature agrees with the closed-form complete integrals', () => {
    const s = ellipticalContact({ ...ellIn, D: 0.6 }, 0)
    // Legendre relation: E·K' + E'·K − K·K' = π/2
    const kp = s.kPrime, k = s.k
    const other = ellipticalContact({ ...ellIn, D: 0.6 }, 0, { kPrime: k })
    expect(s.E * other.K + other.E * s.K - s.K * other.K).toBeCloseTo(Math.PI / 2, 9)
    expect(kp).toBeGreaterThan(0)
  })
})

const lineIn = {
  P: num(WD, 'C30'), D: num(WD, 'C31'), l: num(WD, 'C32'), Yp: num(WD, 'C33'), UTS: num(WD, 'C34'),
  hardness: num(WD, 'C35'), FOS: num(WD, 'C39'), fo: num(WD, 'C46'),
}
const trackIn = { Es: num(WD, 'C57'), beam: cell(WD, 'C58') as string, b: num(WD, 'C59'), d: num(WD, 'C60'), concrete: cell(WD, 'C62') as string }

describe('Wheel Design: line contact and track', () => {
  it('matches the line contact block', () => {
    const l = lineContact(lineIn, trackIn.Es)
    cells(WD, { C40: l.fpc, C41: l.Sc, C42: l.Sac, C45: l.Apa, C47: l.Inw, C48: l.Iw, C51: l.fc, C54: l.Ssa, C55: l.fsm })
  })

  it('matches the track block', () => {
    const t = track(trackIn, lineIn.P, lineIn.Yp)
    cells(WD, { W44: t.A, U47: t.Yt, U49: t.Yb, C61: t.I, C63: t.Ec, C64: t.p, D64: t.pAllow, D65: t.fbAllow })
  })

  it('track plate own inertia is b·d³/12 (the sheet has b·d²/12)', () => {
    const t = track(trackIn, lineIn.P, lineIn.Yp)
    const Ina = t.Ina + trackIn.b * trackIn.d ** 2 / 12 - trackIn.b * trackIn.d ** 3 / 12 // workbook AA42
    const Zt = Ina / t.Yt, Zb = Ina / t.Yb
    cells(WD, { AA42: trackIn.b * trackIn.d ** 2 / 12, U50: Ina, U51: Zt, U52: Zb,
      C65: 0.5 * lineIn.P * 1000 / Math.min(Zt, Zb) * Math.cbrt(trackIn.Es / t.Ec * Ina / trackIn.b) / 1e6 })
    expect(t.fb).toBeGreaterThan(num(WD, 'C65')) // the smaller corrected inertia raises the stress
  })

  it('matches the hidden Wheel Design IS sheet', () => {
    const IS = 'Wheel Design IS'
    const l = lineContact({ P: num(IS, 'C4'), D: num(IS, 'C5'), l: num(IS, 'C6'), Yp: num(IS, 'C7'), UTS: num(IS, 'C8'),
      hardness: num(IS, 'C10'), FOS: num(IS, 'C13'), fo: num(IS, 'C20') }, num(IS, 'C9'))
    cells(IS, { C14: l.fpc, C15: l.Sc, C16: l.Sac, C19: l.Apa, C21: l.Inw, C22: l.Iw, C25: l.fc, C28: l.Ssa, C29: l.fsm })
    const t = track({ Es: num(IS, 'C9'), beam: cell(IS, 'C34') as string, b: num(IS, 'C32'), d: num(IS, 'C33'), concrete: cell(IS, 'C36') as string },
      num(IS, 'C4'), num(IS, 'C7'))
    cells(IS, { C35: t.I, C37: t.Ec, C38: t.p, D38: t.pAllow })
    const d = wheelIs(defaultWheelIs)
    cells(IS, { C25: d.line.fc, C38: d.track.p })
  })
})

describe('Wheel Design: axles and end beams', () => {
  it('double support: matches the sheet, which loads it with the elliptical-contact P and D', () => {
    const x = doubleSupport({
      Wlat: num(WD, 'C73'), bh: num(WD, 'C74'), d: num(WD, 'C75'), FyS: num(WD, 'C76'), FyB: num(WD, 'C77'),
      c: num(WD, 'C78'), b: num(WD, 'C79'), Fbe: num(WD, 'C80'), y: num(WD, 'C105'),
    }, num(WD, 'C6'), num(WD, 'C7'), endLoad, material)
    cells(WD, {
      C81: x.w, C82: x.wm, C83: x.Lr, C84: x.Mo, C85: x.R1, C86: x.R2, C87: x.z, C88: x.Mmax, C89: x.weight,
      C91: x.Plat, C92: x.Prad, C93: x.bearing, D93: x.bearingAllow, C94: x.fb, D94: x.fbAllow, C95: x.fB, D95: x.fBAllow, C108: x.Sr,
    })
    const b = x.endBeam
    cells(WD, {
      C106: b.e, C107: b.f, J92: b.x1, C109: b.A, C110: b.I, C111: b.cg1, C112: b.cg2, C113: b.Sx1, C114: b.Sx2,
      J111: b.J, J112: b.Iy, J113: b.B, J114: b.G, J115: b.Mcr, J116: b.Mn, C116: b.fb1, D116: b.fb1Allow, C117: b.fb2, D117: b.fb2Allow,
    })
  })

  const cantIn = {
    Wlat: num(WD, 'C125'), bh: num(WD, 'C126'), d1: num(WD, 'C127'), d2: num(WD, 'C128'), FyS: num(WD, 'C129'), FyB: num(WD, 'C130'),
    c: num(WD, 'C131'), b: num(WD, 'C132'), a: num(WD, 'C133'), Fbe: num(WD, 'C134'), Lr: num(WD, 'C135'), y: num(WD, 'C159'),
  }
  const P = num(WD, 'C30'), Dw = num(WD, 'C31')
  const x = cantilevered(cantIn, P, Dw, { ...endLoad, M: num(WD, 'C155'), ts: num(WD, 'C157'), dweb: num(WD, 'C158'), Lb: num(WD, 'J163') }, material)

  it('cantilevered: matches the cells that do not involve Mo', () => {
    cells(WD, { C136: x.w, C141: x.weight, C144: x.Prad, D145: x.bearingAllow, D146: x.fbAllow, D147: x.fv1Allow, D149: x.fBAllow })
    const b = x.endBeam
    cells(WD, {
      C160: b.e, C161: b.f, J146: b.x1, C163: b.A, C164: b.I, C165: b.cg1, C166: b.cg2, C167: b.Sx1, C168: b.Sx2,
      J165: b.J, J166: b.Iy, J167: b.B, J168: b.G, J169: b.Mcr, J170: b.Mn, C170: b.fb1, D170: b.fb1Allow, C171: b.fb2, D171: b.fb2Allow,
    })
  })

  it('cantilevered: Mo is in kN·m (the sheet divides it by 1000 again)', () => {
    close(x.Mo, cantIn.Wlat * P * Dw / 2)
    close(x.Mo / 1000, num(WD, 'C137')) // workbook value
    const arm = cantIn.bh / 2 + cantIn.b + cantIn.c / 2
    // the workbook's reactions, moment and stresses follow from its Mo
    close((x.w * cantIn.bh * arm + x.Mo / 1000) / cantIn.Lr, num(WD, 'C138'))
    close(x.Mmax - x.Mo + x.Mo / 1000, num(WD, 'C140'))
    close((x.Mmax - x.Mo + x.Mo / 1000) * 32 / Math.PI / cantIn.d1 ** 3 / 1000, num(WD, 'C146'))
    close(x.Plat / 1000, num(WD, 'C143'))
    expect(x.fb).toBeGreaterThan(num(WD, 'C146')) // the corrected axle stress is higher
  })
})

describe('Wheel Design: geometry fed to the structure', () => {
  const inp: WheelDesignInput = {
    contact: cell(SP, 'U6') as WheelDesignInput['contact'], elliptical: ellIn, line: lineIn, track: trackIn,
    double: { Wlat: num(WD, 'C73'), bh: num(WD, 'C74'), d: num(WD, 'C75'), FyS: num(WD, 'C76'), FyB: num(WD, 'C77'),
      c: num(WD, 'C78'), b: num(WD, 'C79'), Fbe: num(WD, 'C80'), y: num(WD, 'C105') },
    cant: { Wlat: num(WD, 'C125'), d1: num(WD, 'C127'), FyS: num(WD, 'C129'), FyB: num(WD, 'C130'), c: num(WD, 'C131'),
      b: num(WD, 'C132'), Fbe: num(WD, 'C134') },
    sealPlate: num('Embedded Parts', 'C21'),
  }
  const ctx = { gateType, clearSpan: num('Summary', 'D5'), Lsup: bsIn.Lsup, t0: num(SP, 'I13'), stiffSpacing: num(VS, 'D13'), stiffThickness: num(VS, 'D16') }
  const g = wheelGeometry(inp, ctx)

  it('the app defaults are the workbook inputs', () => {
    const flat = (o: object): [string, unknown][] => Object.entries(o).flatMap(([k, v]): [string, unknown][] => (typeof v === 'object' ? flat(v).map(([j, w]) => [`${k}.${j}`, w]) : [[k, v]]))
    const want = Object.fromEntries(flat(inp))
    for (const [k, v] of flat(defaultWheelDesign)) {
      if (typeof v === 'number') close(v, want[k] as number, 1e-9, k)
      else expect(v, k).toBe(want[k])
    }
  })

  it('matches the end zone, axle span and taper defaults', () => {
    cells(VS, { Y15: g.edge, Y17: g.LrDefault, O14: g.bh + 2 * inp.cant.b + inp.cant.c + 2 * g.Lr, O15: g.endZone })
    close(wheelGeometry(inp, { ...ctx, gateType: 'Fixed Wheel (double support)' }).endZone, num(VS, 'O13'))
    expect(wheelGeometry(inp, { ...ctx, gateType: 'Bulkhead (no wheels)' }).endZone).toBe(0)
    cells(WD, { C126: g.bh, C133: g.a, C135: g.Lr })
    cells(SP, { S7: g.tapDefault })
  })

  it('matches the cantilevered wheel axis offset (Q161) and the wheel weight', () => {
    const side = { B: num(SE, 'C29'), mt: num(SE, 'C37'), delta: num(SE, 'C31') }
    close(wheelAxisOffset(side, inp.sealPlate, ctx.t0, num(SP, 'S8'), trackIn.d, lineIn.D), num(WD, 'C159'))
    close(Math.ceil(((side.B + side.mt - side.delta) / 1000 + ctx.t0 + num(SP, 'S8') + 0.01 + trackIn.d) * 100 - 1e-9) * 10, num('Embedded Parts', 'C25'))
    const r = wheelDesign(inp, gateType, {
      geometry: g, maxWheelLoad: num(WD, 'C5'), endBeam: { ...endLoad, Lb: num(WD, 'J163') }, psiDeg, sideSeal: side,
      dweb: num(SP, 'S8'), t0: ctx.t0, material,
    })
    cells(WD, { C67: r.wheelWeight })
    close(r.cantInput.y, num(WD, 'C159'))
    expect(r.cant).toBeDefined()
    expect(r.axle).toBeUndefined()
    expect(r.maxRatio).toBeGreaterThan(0)
  })
})
