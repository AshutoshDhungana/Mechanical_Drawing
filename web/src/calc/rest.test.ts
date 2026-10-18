import { describe, expect, it } from 'vitest'
import plates from '../../../data/tables/plate_coefficients.json'
import { breakingForce, defaultHoist, defaultLegacyHoist, hoist, legacyHoist, qFactor, type HoistInput } from './hoist'
import { defaultEmbedded, defaultLegacyEmbedded, embeddedParts, legacyEmbedded } from './embedded'
import { slotLength } from './wheelDesign'
import { cell, num } from './golden'
import type { GateType } from './stiffeners'

const HR = 'Hoist(Rope Drum)', LH = 'Rope Drum Hoist', EP = 'Embedded Parts', LE = 'Embedded', WD = 'Wheel Design', SP = 'SecProp', SE = 'Seals'
const close = (actual: number, expected: number, rel = 1e-9, what = '') =>
  expect(Math.abs(actual - expected), what).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(expected)))
const cells = (sheet: string, map: Record<string, number>, rel = 1e-9) => {
  for (const [addr, v] of Object.entries(map)) close(v, num(sheet, addr), rel, `${sheet}!${addr}`)
}
const str = (sheet: string, addr: string) => cell(sheet, addr) as string
const mat = (r: number) => ({ name: str(HR, `C${r}`), grade: str(HR, `C${r + 1}`), uts: num(HR, `C${r + 2}`), yield: num(HR, `C${r + 3}`) })

describe('Hoist(Rope Drum)', () => {
  const inp: HoistInput = {
    liftingLoad: num(HR, 'C5'), liftHeight: null, drums: num(HR, 'C7'), fallsPerDrum: num(HR, 'C8'), pulleyEff: num(HR, 'C9'),
    ropeType: str(HR, 'C11'), grade: num(HR, 'C12') as HoistInput['grade'], core: str(HR, 'C13') as HoistInput['core'],
    ropeD: num(HR, 'C14'), drumPcd: num(HR, 'C15'), speed: num(HR, 'C18'), wormEff: [num(HR, 'C25'), num(HR, 'D25')],
    motor: { name: str(HR, 'C35'), power: num(HR, 'C36'), rpm: num(HR, 'C37') },
    worm: { ratio: num(HR, 'C40'), ratioD: num(HR, 'D40'), size: str(HR, 'C41'), inputHP: num(HR, 'C42'), inputRpm: num(HR, 'C43'), outputTorque: num(HR, 'C44') },
    gearType: str(HR, 'C48') as HoistInput['gearType'],
    teeth: { drumGear: num(HR, 'C50'), drumPinion: num(HR, 'D50'), gear2: num(HR, 'C51'), pinion2: num(HR, 'D51') },
    drum: { ...mat(67), shell: num(HR, 'C77'), length: num(HR, 'C89') },
    gearMat: mat(116), pinionMat: mat(124), modules: { drum: num(HR, 'E131'), second: num(HR, 'E135') },
    shaft: { AC: num(HR, 'C144'), BD: num(HR, 'C146'), material: { name: str(HR, 'C199'), grade: str(HR, 'C200'), uts: num(HR, 'C201'), yield: num(HR, 'C202') },
      d: num(HR, 'C203'), plate: num(HR, 'C208') },
    shaft2: { d: num(HR, 'C215'), PQ: num(HR, 'C216'), XY: num(HR, 'C217') },
    manual: { handleR: num(HR, 'C343'), handleRpm: num(HR, 'C344'), motorSpeed: num(HR, 'C342'), sprocket: num(HR, 'C346'), sprocketEff: num(HR, 'C348'), personForce: num(HR, 'C350') },
  }
  const r = hoist(inp, { maxLift: num(HR, 'C3'), liftHeightDefault: num(HR, 'C6') })

  it('the defaults are the workbook inputs', () => {
    expect(JSON.parse(JSON.stringify(defaultHoist))).toEqual(JSON.parse(JSON.stringify({ ...inp, manual: { ...inp.manual, personForce: 10 * 9.81 } })))
  })

  it('matches rope, motor, gear train, brake and drum', () => {
    cells(HR, {
      C3: r.maxLift, C4: r.jammed, C6: r.liftHeight, C10: r.ropeTension, C16: r.mbf, C17: r.fos, C19: r.ropeTensionBDT, C20: r.fosBDT,
      U8: r.ropeMass, C26: r.effStart, D26: r.effRun, C31: r.effRatio, C34: r.hp, C45: r.torqueAtRated, D45: r.torqueAtNeed,
      C54: r.reduction, C55: r.drumRpm, C56: r.liftSpeed, C59: r.ratedTorque, C60: r.brakeTorque, C63: r.bdt, C64: r.drumTorqueBDT,
      C76: r.drum.pitch, C78: r.drum.grooveR, C79: r.drum.grooveDepth, C81: r.drum.crushN, D81: r.drum.crushAllowN, C82: r.drum.crushB,
      D82: r.drum.crushAllowB, C84: r.drum.ropeLen, C86: r.drum.grooves, C87: r.drum.totalGrooves, C88: r.drum.groovedLength,
      C91: r.drum.kg, C92: r.drum.bmRope, C93: r.drum.bmSelf, C95: r.drum.Z, C96: r.drum.bending, C97: r.drum.combined, D97: r.drum.combinedAllow,
    })
    expect(r.fosRequired).toBe(num(HR, 'D17'))
    expect(r.fosBDTRequired).toBe(num(HR, 'D20'))
  })

  it('matches the torques and every gear and pinion check', () => {
    const t = r.torques
    cells(HR, {
      C104: t.drumN[0], D104: t.drumN[1], C105: t.drumB[0], D105: t.drumB[1], C107: t.shaft2N[0], D107: t.shaft2N[1],
      C108: t.shaft2B[0], D108: t.shaft2B[1], C110: t.shaft3N[0], D110: t.shaft3N[1], C111: t.shaft3B[0], D111: t.shaft3B[1],
      C120: r.gears[0].allow[0], C121: r.gears[0].allow[1], C128: r.gears[1].allow[0], C129: r.gears[1].allow[1],
    })
    r.gears.forEach((g, i) => {
      const row = 131 + 2 * i
      cells(HR, {
        [`D${row}`]: g.teeth, [`E${row}`]: g.module, [`F${row}`]: g.pcd, [`G${row}`]: g.face, [`H${row}`]: g.q,
        [`I${row}`]: g.torque[0], [`J${row}`]: g.toothLoad[0], [`K${row}`]: g.stress[0],
        [`I${row + 1}`]: g.torque[1], [`J${row + 1}`]: g.toothLoad[1], [`K${row + 1}`]: g.stress[1],
      })
    })
  })

  it('matches the drum shaft and the second shaft', () => {
    const s = r.shaft
    const cols = ['C', 'D', 'E', 'F'] // N/BDT for rope at X, then rope at Y (rows 161:171)
    const pick = (x: { X: number[]; Y: number[] }) => [x.X[0], x.X[1], x.Y[0], x.Y[1]]
    pick(s.atA).forEach((v, i) => close(v, num(HR, `${cols[i]}163`), 1e-9, `${cols[i]}163`))
    pick(s.atB).forEach((v, i) => close(v, num(HR, `${cols[i]}171`), 1e-9, `${cols[i]}171`))
    cells(HR, {
      C142: s.XY, C143: s.AX, C148: s.CD, C153: s.allowBending, C154: s.allowTorsion, C155: s.allowCombined, C176: s.horiz[0], C177: s.horiz[1],
      C182: s.vertical.X.Rc[0], D182: s.vertical.X.Rc[1], E182: s.vertical.X.Rd[0], F182: s.vertical.X.Rd[1],
      C183: s.vertical.Y.Rc[0], D183: s.vertical.Y.Rc[1], E183: s.vertical.Y.Rd[0], F183: s.vertical.Y.Rd[1],
      C188: s.hRc[0], D188: s.hRc[1], E188: s.hRd[0], F188: s.hRd[1],
      C193: s.resultant.X.Rc[0], D193: s.resultant.X.Rc[1], E193: s.resultant.X.Rd[0], F193: s.resultant.X.Rd[1],
      C194: s.resultant.Y.Rc[0], D194: s.resultant.Y.Rc[1], E194: s.resultant.Y.Rd[0], F194: s.resultant.Y.Rd[1],
      C196: s.bmB[0], C197: s.bmB[1], C204: s.Z, C205: s.fbN, D205: s.fbNAllow, C206: s.fbB, D206: s.fbBAllow,
      C211: s.bearing, D211: s.bearingAllow, C212: s.shear, D212: s.shearAllow,
    })
    const s2 = r.shaft2
    cells(HR, {
      C218: s2.XP, C224: s2.selfP, C225: s2.P[0], D225: s2.P[1], C229: s2.selfQ, C230: s2.Q[0], D230: s2.Q[1],
      C234: s2.hP[0], D234: s2.hP[1], C235: s2.hQ[0], D235: s2.hQ[1], C239: s2.RXv[0], D239: s2.RXv[1], C240: s2.RYv[0], D240: s2.RYv[1],
      C244: s2.RXh[0], D244: s2.RXh[1], C245: s2.RYh[0], D245: s2.RYh[1], C249: s2.RX[0], D249: s2.RX[1], C250: s2.RY[0], D250: s2.RY[1],
    })
  })

  it('matches manual operation', () => {
    cells(HR, { C347: r.manual.speed, C349: r.manual.effort, C351: r.manual.people })
  })

  it('warns that the typed lifting load is below the jammed load', () => {
    expect(r.warnings.join()).toMatch(/jammed/)
  })

  it('rope table typos are corrected; the strength factor interpolates', () => {
    expect(breakingForce(52, 1770, 'Wire Rope Core(CWR)').mbf).toBe(1524)
    expect(qFactor(20, '20 Deg Full Depth Involute')).toBeCloseTo(3.5 + (3.3 - 3.5) * 2 / 3, 12)
    expect(qFactor(150, '20 Deg Stub Tooth')).toBe(1.976)
  })
})

describe('Rope Drum Hoist (legacy, hidden)', () => {
  it('matches the sheet', () => {
    const r = legacyHoist(defaultLegacyHoist, { maxLift: num(LH, 'D4'), headNwl: num('Summary', 'D14'), D: num('Beam Spacing', 'F7') })
    cells(LH, {
      D5: r.jammed, D6: r.calculated, D7: r.design, D11: r.mbf, D13: r.perDrum, D16: r.force, D17: r.sf, D18: r.drumMin, D19: r.sheaveMin,
      D28: r.efficiency, D34: r.drumRpm, D35: r.reduction, D36: r.motorCapacity, E37: r.poles, D40: r.handleR, D45: r.manualTorque,
      D46: r.operatingForce, D47: r.liftVelocity, D48: r.stroke, D49: r.pitch, D51: r.winding, D52: r.drumLengthCalc,
      D53: r.shaftC, D54: r.shaftB, D55: r.shaftA, D59: r.gear2, D61: r.openTime,
    })
  })
})

// ---------------------------------------------------------------- embedded parts

const gateType = cell(SP, 'U4') as GateType
const side = { B: num(SE, 'C29'), mt: num(SE, 'C37'), delta: num(SE, 'C31') }

describe('Embedded Parts', () => {
  const r = embeddedParts(defaultEmbedded, {
    Lsup: num('Beam Spacing', 'F8'), clearSpan: num('Summary', 'D5'), gateMass: num('Weight & cg', 'D6'), Fyb: num(SP, 'S4'),
    slotLength: slotLength(side, num(SP, 'I13'), num(SP, 'S8'), num(WD, 'C60')), sealPlateT: num(EP, 'C21'), precompression: num(SE, 'C9'),
    wheelBase: str(WD, 'C58'), track: { b: num(WD, 'C59'), d: num(WD, 'C60') }, sill: num('Summary', 'D10'), platform: num('Summary', 'D12'),
    erbistiX: num('Weight & cg', 'AA4'),
  })

  it('matches the sill beam, side plate, contours and sections', () => {
    const b = r.sillBeam
    cells(EP, {
      C5: b.span, C6: b.weight, C7: b.design, C8: b.udl, C9: b.designUdl, C11: b.M, C12: b.allow, C14: b.Z, C15: b.stress, C17: b.anchors,
      C22: r.precompression, C25: r.slotLength, F38: r.sidePlate.force, C39: r.sidePlate.width, F39: r.sidePlate.M, F40: r.sidePlate.Z,
      F41: r.sidePlate.stress, C42: r.slotDepth, C49: r.niche.length, C50: r.niche.depth, J88: r.erbisti.min, J89: r.erbisti.max,
    })
    const cols: [string, keyof typeof r.sections][] = [['C', 'downstream'], ['D', 'upstream'], ['E', 'wheelBase'], ['F', 'sill'], ['G', 'lintel']]
    for (const [c, k] of cols) {
      const s = r.sections[k]
      cells(EP, { [`${c}30`]: s.w, [`${c}31`]: s.area, [`${c}32`]: s.h, [`${c}33`]: s.b, [`${c}34`]: s.tf, [`${c}35`]: s.tw, [`${c}36`]: s.Ixx, [`${c}37`]: s.Zxx })
    }
  })

  it('matches every weight row', () => {
    const rows = [[59, 60, 61, 62, 64, 65, 66, 67, 69, 70, 71, 73], [76, 77, 78, 79], [82, 83, 84]]
    r.groups.forEach(([, items], g) => items.forEach((it, i) => {
      const row = rows[g][i]
      if (row === 82) return // see the next test
      cells(EP, { [`C${row}`]: it.count, [`J${row}`]: it.total })
    }))
  })

  it('sill I beam weight is computed (the sheet types 106.68 kg)', () => {
    const beam = r.groups[2][1][0]
    close(beam.unit, num(EP, 'F30') * num(EP, 'E82') / 1000)
    expect(num(EP, 'I82')).toBe(106.68)
    const delta = 106.68 - beam.total
    cells(EP, { J85: r.subtotals[2] + delta, J74: r.subtotals[0], J80: r.subtotals[1], J86: r.gross + delta, J87: 1.1 * (r.gross + delta) })
  })
})

describe('Embedded (legacy, hidden)', () => {
  const r = legacyEmbedded(defaultLegacyEmbedded, {
    gateType, side: { B: side.B, mt: side.mt }, t0: num(SP, 'I13'), y: num(WD, 'C159'),
    wheel: { P: num(WD, 'C30'), D: num(WD, 'C31'), l: num(WD, 'C32') }, Sr: num(WD, 'C108'),
    c: gateType === 'Fixed Wheel (cantilevered)' ? num(WD, 'C131') : num(WD, 'C78'),
    Lsup: num('Beam Spacing', 'F8'), clearSpan: num('Summary', 'D5'), sill: num('Summary', 'D10'), platform: num('Summary', 'D12'),
  })

  it('matches the sheet', () => {
    cells(LE, {
      C15: r.hertz, C16: r.halfWidth, C17: r.shearDepth, C18: r.railT, C21: r.slotLength, C22: r.offsets[0], D22: r.offsets[1], E22: r.offsets[2],
      C24: r.supports, C25: r.member, C26: r.span, C27: r.gateLength, C28: r.extension, C29: r.edgeToWheel, C40: r.clearance, C41: r.slotDepth,
      C43: r.holdingPlateW, C44: r.nicheLength, C45: r.nicheDepth, C46: r.concreteBearing, C47: r.concreteShear, C50: r.operatingLength,
      C53: r.lintelLength, C58: r.sillLength, J81: r.subtotals[0], J87: r.subtotals[1], J92: r.subtotals[2], J93: r.gross, J94: r.total,
      E34: r.shapes.E.depth, E35: r.shapes.E.width, E36: r.shapes.E.tf, E37: r.shapes.E.tw, E38: r.shapes.E.I,
    })
    const rows = [[66, 67, 68, 69, 71, 72, 73, 74, 76, 77, 78, 80], [83, 84, 85, 86], [89, 90, 91]]
    r.groups.forEach(([, items], g) => items.forEach((it, i) => cells(LE, { [`J${rows[g][i]}`]: it.total })))
  })
})

describe('Plates (hidden)', () => {
  it('the extracted coefficient tables are the sheet', () => {
    const check = (t: typeof plates.CCCF, first: number, rawCol: number, usedCol: number) => t.columns.forEach((c, j) => c.raw.forEach((v, i) => {
      const L = (k: number) => String.fromCharCode(64 + k)
      expect(v).toBe(num('Plates', `${L(rawCol + j)}${first + i}`))
      close(c.as_used[i], num('Plates', `${L(usedCol + j)}${first + i}`), 1e-12)
    }))
    check(plates.CCCF, 33, 11, 3) // K:P raw, C:H as used
    check(plates.CCCC, 89, 16, 3) // P:X raw, C:K as used
  })
})

describe('Summary', async () => {
  const { summary } = await import('./summary')
  const { defaultSeals } = await import('./seals')
  const { defaultWheelDesign } = await import('./wheelDesign')
  const { defaultProject } = await import('./project')
  const S = 'Summary'
  const h = hoist(defaultHoist, { maxLift: num(HR, 'C3'), liftHeightDefault: num(HR, 'C6') })
  const e = embeddedParts(defaultEmbedded, {
    Lsup: num('Beam Spacing', 'F8'), clearSpan: 3.5, gateMass: num('Weight & cg', 'D6'), Fyb: 250,
    slotLength: slotLength(side, num(SP, 'I13'), num(SP, 'S8'), num(WD, 'C60')), sealPlateT: 8, precompression: 3,
    wheelBase: 'ISMB 200', track: { b: 0.1, d: 0.01 }, sill: 738, platform: 747, erbistiX: num('Weight & cg', 'AA4'),
  })
  const rows = summary({
    project: defaultProject, gateType,
    heads: { hfl: num(S, 'D13'), nwl: num(S, 'D14'), deck: num(S, 'D11') },
    beams: { n: 5, D: num(S, 'D17'), Lsup: num(S, 'D18'), HB: num(S, 'D19'), totalLoad: num(S, 'D20'), first: { type: 'I Shape', designation: 'ISMB 350' } },
    stiff: { spacing: 0.3, offset: 0, depth: num(S, 'D26') / 1000, thickness: 0.01, count: 12 }, loc: 'Upstream', seals: defaultSeals,
    wheelsPerSide: 2, wheel: { input: defaultWheelDesign, axleD: num(WD, 'C127'), axleSpan: num(WD, 'C135'), ts: num(WD, 'C157'), dweb: num(WD, 'C158') },
    massKg: num('Weight & cg', 'D6'), hydrostatic: num(S, 'D60'), maxLift: num(S, 'D61'), hoist: { input: defaultHoist, r: h, source: str(LH, 'D29') }, embedded: e,
  }).flatMap((s) => s.rows)
  const value = (label: string) => rows.find((r) => r[0] === label)?.[1]

  it('reports the workbook Summary values', () => {
    const want: [string, string][] = [
      ['Number of beams', 'D16'], ['Total beam load per metre width', 'D20'], ['Spacing', 'D25'], ['Depth', 'D26'], ['Thickness', 'D27'], ['Number', 'D28'],
      ['Bulb diameter', 'D32'], ['Seal stem thickness', 'D33'], ['Number of wheels', 'D45'], ['Design wheel load', 'D48'], ['Wheel diameter', 'D49'],
      ['Wheel tread width', 'D50'], ['Wheel axle diameter', 'D52'], ['Wheel axle support span', 'D53'], ['Skin plate thickness', 'D55'],
      ['Web depth at support', 'D56'], ['Total hydrostatic load on gate', 'D60'], ['Hoist load, lifting (max)', 'D61'], ['Lifting load', 'D64'],
      ['Lifting load (jammed condition)', 'D65'], ['Rope diameter', 'D67'], ['Breaking force', 'D69'], ['Number of drums', 'D70'],
      ['Design diameter of drum', 'D72'], ['Number of grooves on drum', 'D73'], ['Length of drum', 'D74'], ['Motor rpm', 'D76'], ['Lifting speed', 'D77'],
      ['Design capacity of motor', 'D78'], ['Poles', 'D79'], ['Handle diameter', 'D80'], ['Handle radius', 'D81'],
      ['Average force of person for operation', 'D82'], ['Operating force', 'D83'], ['Manual gate lifting speed', 'D84'],
      ['Total number of people required', 'D85'], ['Niche contour length (M)', 'D87'], ['Niche contour depth (N)', 'D88'],
      ['Slot contour length (L)', 'D89'], ['Slot contour depth (B)', 'D90'],
    ]
    for (const [label, addr] of want) close(value(label) as number, num(S, addr), 1e-9, `${label} (${addr})`)
    for (const [label, addr] of [['Wire rope', 'D66'], ['Rope grade', 'D68'], ['Safety factor for rope', 'D71'], ['Electric source', 'D75']])
      expect(value(label), addr).toBe(cell(S, addr))
  })

  it('reports the Seals inputs, tonnes and the computed sill I beam where the sheet has typed or converted values', () => {
    expect([num(S, 'D34'), num(S, 'D39'), num(S, 'D43')]).toEqual([4, 4, 75]) // workbook: typed
    expect(value('Deflection')).toBe(3) // Seals!C9
    expect(value('Seal height')).toBe(50) // Seals!C61
    close(num(S, 'D58'), num('Weight & cg', 'D6') / 907.18474) // workbook: US short tons
    close(value('Total weight') as number, num('Weight & cg', 'D6') / 1000)
    close(value('Total weight of embedded parts') as number + 1.1 * (106.68 - e.groups[2][1][0].total), num(S, 'D91'))
  })
})
