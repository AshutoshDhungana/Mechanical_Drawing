// Hoist(Rope Drum) sheet: rope drum hoist sizing (rope, motor, gear train, brake, drum, shafts, manual drive),
// plus the hidden legacy 'Rope Drum Hoist' sheet. Units as the sheet: loads kN, lengths mm unless named _m,
// lifting speed m/min, torques kN·m (gear train) or N·m (shafts), stresses MPa.
import rope from '../../../data/tables/rope_6x37.json'
import ropeOld from '../../../data/tables/rope_6x37_old.json'

export type RopeGrade = 1570 | 1770 | 1960
export type RopeCore = 'Fibre Core(CF)' | 'Wire Rope Core(CWR)'
export type GearType = '20 Deg Full Depth Involute' | '20 Deg Stub Tooth'
export const ropeDiameters = rope.rows.map((r) => r.d)

type RopeRow = (typeof rope.rows)[number]
/** Minimum breaking force, kN, with the table's two typos corrected (rope_6x37.json → errata). */
export function breakingForce(d: number, grade: RopeGrade, core: RopeCore) {
  const r = rope.rows.find((x) => x.d === d)
  if (!r) throw new RangeError(`No ${d} mm rope in the 6×37 table`)
  const field = `mbf_${grade}_${core.startsWith('F') ? 'CF' : 'CWR'}` as keyof RopeRow
  const fix = rope.errata.find((e) => e.d === d && e.field === field)
  return { mbf: (fix ? fix.corrected : r[field]) as number, mass: core.startsWith('F') ? r.mass_CF : r.mass_CWR }
}

// Lewis strength factor q against number of teeth (AC3:AF18); FORECAST between bracketing rows, last value from 100 teeth
const Q_TEETH = [12, 13, 14, 15, 16, 17, 18, 21, 24, 28, 34, 40, 50, 65, 80, 100]
const Q_FULL = [4.6, 4.35, 4.1, 3.9, 3.75, 3.6, 3.5, 3.3, 3.2, 3.1, 3, 2.9, 2.8, 2.7, 2.6, 2.5]
const Q_STUB = [3.215, 3.086, 2.941, 2.865, 2.77, 2.717, 2.652, 2.506, 2.424, 2.325, 2.242, 2.179, 2.11, 2.04, 2.008, 1.976]
export function qFactor(z: number, type: GearType) {
  const q = type === '20 Deg Full Depth Involute' ? Q_FULL : Q_STUB
  if (z >= 100) return q[15]
  if (z < 12) throw new RangeError('Gears need at least 12 teeth (strength factor table)')
  let i = 0
  while (Q_TEETH[i + 1] <= z) i++
  return q[i] + (q[i + 1] - q[i]) * (z - Q_TEETH[i]) / (Q_TEETH[i + 1] - Q_TEETH[i])
}

export interface Material { name: string; grade: string; uts: number; yield: number }

export interface HoistInput {
  liftingLoad: number // C5, kN (the workbook holds a typed 118; compare with the jammed load C4)
  liftHeight: number | null // C6, m; null = hoist deck − gate height − sill
  drums: number // C7
  fallsPerDrum: number // C8 (not used by the sheet's formulas)
  pulleyEff: number // C9
  ropeType: string // C11
  grade: RopeGrade // C12
  core: RopeCore // C13
  ropeD: number // C14, mm
  drumPcd: number // C15, mm
  speed: number // C18, m/min
  wormEff: [starting: number, running: number] // C25, D25
  motor: { name: string; power: number; rpm: number } // C35:C37; power as used by 71620·P/n (HP)
  worm: { ratio: number; ratioD: number; size: string; inputHP: number; inputRpm: number; outputTorque: number } // C40:C44
  gearType: GearType // C48
  teeth: { drumGear: number; drumPinion: number; gear2: number; pinion2: number } // C50, D50, C51, D51
  drum: Material & { shell: number; length: number } // C67:C70, C77 (mm), C89 (m)
  gearMat: Material // C116:C119
  pinionMat: Material // C124:C127
  modules: { drum: number; second: number } // E131, E135, mm
  shaft: { AC: number; BD: number; material: Material; d: number; plate: number } // C144, C146 mm; C199:C203 (d in m); C208 mm
  shaft2: { d: number; PQ: number; XY: number } // C215:C217, m
  manual: { handleR: number; handleRpm: number; motorSpeed: number; sprocket: number; sprocketEff: number; personForce: number } // C343:C348, C350 (N)
}

export interface HoistContext {
  maxLift: number // max lifting load from Operation, kN (C3)
  liftHeightDefault: number // Summary D11 − D − D10
}

const tan20 = Math.tan(20 * Math.PI / 180)

export function hoist(inp: HoistInput, ctx: HoistContext) {
  const warnings: string[] = []
  const C3 = ctx.maxLift, C4 = 2.5 * C3, C5 = inp.liftingLoad
  if (C5 < C4) warnings.push(`Hoist lifting load (${C5.toFixed(1)} kN) is below the jammed-condition load 2.5 × max lift (${C4.toFixed(1)} kN).`)
  const LFH = inp.liftHeight ?? ctx.liftHeightDefault
  // ponytail: rope tension assumes 2 drums × 2 falls (the sheet's hard-coded 2), whatever C7/C8 say; flagged
  const RT = C5 / (2 * (1 + inp.pulleyEff))
  const { mbf, mass } = breakingForce(inp.ropeD, inp.grade, inp.core)

  // efficiencies (C23:D31)
  const pulley = [0.93 ** 2, 0.95 ** 2], spur = [0.93 ** 2, 0.95 ** 2]
  const effStart = inp.wormEff[0] * spur[0] * pulley[0], effRun = inp.wormEff[1] * spur[1] * pulley[1]

  // motor, worm, gear train
  const hp = (C5 * 1000 / 9.81) * inp.speed / (4500 * effRun) // C34
  const w = inp.worm, m = inp.motor, z = inp.teeth
  const torqueAtRated = w.outputTorque * w.inputRpm * m.power / (w.inputHP * m.rpm) // C45
  const torqueAtNeed = w.outputTorque * w.inputRpm * hp / (w.inputHP * m.rpm) // D45
  const reduction = w.ratio * z.drumGear * z.gear2 / (w.ratioD * z.drumPinion * z.pinion2) // C54
  // ponytail: drum rpm uses a hard-coded 960 rpm, not the motor's rated speed C52; flagged
  const drumRpm = 960 / reduction
  const liftSpeed = drumRpm * Math.PI * inp.drumPcd / 1000 / 2 // C56, m/min

  // brake and breakdown torque
  const ratedTorque = 71620 * m.power / m.rpm * 9.81 / 100 // C59, N·m
  const bdt = 2.9 * ratedTorque
  const drumTorqueBDT = bdt * reduction * effStart / 2 // C64
  const RTB = drumTorqueBDT / (inp.drumPcd / 2) // C19, kN

  // rope drum
  const d = inp.drum, pitch = inp.ropeD + 3
  const crushN = RT / (pitch * d.shell / 1e6) / 1000, crushB = RTB / (pitch * d.shell / 1e6) / 1000
  const crushAllowN = d.name !== 'Mild Steel' ? 0.2 * d.uts : 0.17 * d.uts
  const crushAllowB = d.name === 'Cast Iron' ? 0.4 * d.uts : 0.8 * d.yield
  const ropeLen = 2 * LFH
  const grooves = Math.ceil(ropeLen / (Math.PI * inp.drumPcd / 1000) - 1e-12)
  const drumKg = Math.PI * inp.drumPcd / 1000 * d.shell / 1000 * d.length * 7850 // DKG
  const bmRope = RT * d.length / 4, bmSelf = drumKg * 9.81 / 1000 * d.length / 8
  const Zdrum = Math.PI * (inp.drumPcd ** 4 - (inp.drumPcd - 2 * d.shell) ** 4) / (32 * inp.drumPcd) * 1e-9
  const bending = (bmRope + bmSelf) / Zdrum / 1000

  // torques along the train (C104:D111); ponytail: the drum torque uses the groove pitch (C76) as the lever, not the drum radius; flagged
  const t104 = RT * pitch / 1000, t105 = RTB * pitch / 1000
  const tq = {
    drumN: [t104, t104 * 0.95], drumB: [t105, t105 * 0.93],
    shaft2N: [t104 * 0.95 * z.drumPinion / z.drumGear, 0], shaft2B: [t105 * 0.93 * z.drumPinion / z.drumGear, 0],
    shaft3N: [0, 0], shaft3B: [0, 0],
  }
  tq.shaft2N[1] = tq.shaft2N[0] * 0.95; tq.shaft2B[1] = tq.shaft2B[0] * 0.93
  tq.shaft3N = [tq.shaft2N[1] * z.pinion2 / z.gear2, 0]; tq.shaft3N[1] = tq.shaft3N[0] * 0.95
  tq.shaft3B = [tq.shaft2B[1] * z.pinion2 / z.gear2, 0]; tq.shaft3B[1] = tq.shaft3B[0] * 0.93

  // gear and pinion strength (rows 131:138); ponytail: tooth load = torque / (z_gear/z_pinion · m) for gears and torque/m for pinions, as the sheet; flagged
  const gearAllow = { N: 0.2 * inp.gearMat.uts, B: 0.8 * inp.gearMat.yield }
  const pinionAllow = { N: 0.2 * inp.pinionMat.uts, B: 0.8 * inp.pinionMat.yield }
  const tooth = (part: string, teeth: number, mod: number, widthFactor: number, torque: [number, number], load: (t: number) => number,
    allow: { N: number; B: number }) => {
    const face = widthFactor * mod, q = qFactor(teeth, inp.gearType)
    const [JN, JB] = torque.map(load)
    const stress = (J: number) => J * q / (face / 1000 * mod / 1000) / 1000
    return { part, teeth, module: mod, pcd: teeth * mod / 1000, face, q, torque, toothLoad: [JN, JB], stress: [stress(JN), stress(JB)], allow: [allow.N, allow.B] }
  }
  const md = inp.modules.drum, m2 = inp.modules.second
  const gears = [
    tooth('Drum gear', z.drumGear, md, 10, [tq.drumN[1], tq.drumB[1]], (t) => t / (z.drumGear / z.drumPinion * md / 1000), gearAllow),
    tooth('Pinion', z.drumPinion, md, 11, [tq.shaft2N[0], tq.shaft2B[0]], (t) => t / md * 1000, pinionAllow),
    tooth('2nd gear', z.gear2, m2, 10, [tq.shaft2N[1], tq.shaft2B[1]], (t) => t / (z.gear2 / z.pinion2 * m2 / 1000), gearAllow),
    tooth('2nd pinion', z.pinion2, m2, 11, [tq.shaft3N[0], tq.shaft3B[0]], (t) => t / m2 * 1000, pinionAllow),
  ]
  const [g1, p1, g2] = gears

  // drum shaft (rows 139:212); index 0 = N, 1 = BDT; rope at X / Y
  const s = inp.shaft, AB = d.length, XY = grooves * pitch / 1000, AX = (AB - XY) / 2, AC = s.AC / 1000, BD = s.BD / 1000, CD = AB + AC + BD
  const selfA = drumKg * 9.81 / 2
  const selfB = selfA + Math.PI / 4 * (g1.pcd ** 2 - s.d ** 2) * g1.face / 1000 * 7850 * 9.81
  const rope2 = [RT, RTB]
  const atA = { X: rope2.map((r) => r * (XY + AX) / AB * 1000 + selfA), Y: rope2.map((r) => r * AX / AB * 1000 + selfA) }
  const atB = {
    X: rope2.map((r, i) => r * AX / AB * 1000 + selfB - g1.toothLoad[i] * 1000),
    Y: rope2.map((r, i) => r * (XY + AX) / AB * 1000 + selfB - g1.toothLoad[i] * 1000),
  }
  const horiz = [g1.toothLoad[0] * 1000 * tan20, g1.toothLoad[1] * tan20 * 1000] // C176, C177
  const vRc = (a: number, b: number) => a * (AB + BD) / CD + b * BD / CD
  const vertical = {
    X: { Rc: [vRc(atA.X[0], atB.X[0]), vRc(atA.X[1], atB.X[1])], Rd: [vRc(atB.X[0], atA.X[0]), vRc(atB.X[1], atA.X[1])] },
    Y: { Rc: [vRc(atA.Y[0], atB.Y[0]), vRc(atA.Y[1], atB.Y[1])], Rd: [vRc(atB.Y[0], atA.Y[0]), vRc(atB.Y[1], atA.Y[1])] },
  }
  const hRc = horiz.map((h) => h * BD / CD), hRd = horiz.map((h) => h * (AC + BD) / CD)
  const res = (v: number[], h: number[]) => v.map((x, i) => Math.hypot(h[i], x))
  const resultant = {
    X: { Rc: res(vertical.X.Rc, hRc), Rd: res(vertical.X.Rd, hRd) },
    Y: { Rc: res(vertical.Y.Rc, hRc), Rd: res(vertical.Y.Rd, hRd) },
  }
  const bmB = [0, 1].map((i) => Math.max(resultant.X.Rd[i], resultant.Y.Rd[i]) * BD) // C196, C197, N·m
  const Zs = Math.PI * s.d ** 3 / 32
  const sm = s.material
  const RcMax = Math.max(resultant.X.Rc[0], resultant.Y.Rc[0])
  const shaft = {
    AB, XY, AX, AC, BD, CD, selfA, selfB, atA, atB, horiz, vertical, hRc, hRd, resultant, bmB, Z: Zs,
    allowBending: Math.min(0.5 * sm.yield, 0.2 * sm.uts) * 0.75, allowTorsion: 0.3 * sm.yield * 0.75, allowCombined: Math.min(0.24 * sm.uts, 0.6 * sm.yield) * 0.75, // C153:C155
    fbN: bmB[0] / Zs / 1e6, fbNAllow: Math.min(0.5 * sm.yield, 0.2 * sm.uts),
    fbB: bmB[1] / Zs / 1e6, fbBAllow: 0.8 * sm.yield,
    bearing: RcMax / (s.d * s.plate / 1000) / 1e6, bearingAllow: Math.min(0.5 * sm.yield, 0.2 * sm.uts),
    shear: 4 * RcMax / (3 * Math.PI / 4 * s.d ** 2) / 1e6, shearAllow: 0.3 * sm.yield,
  }

  // second shaft (rows 214:250)
  const s2 = inp.shaft2, XP = (s2.XY - s2.PQ) / 2
  const selfP = Math.PI / 4 * (p1.pcd ** 2 - s2.d ** 2) * p1.face / 1000 * 9.81 * 7850
  const selfQ = Math.PI / 4 * (g2.pcd ** 2 - s2.d ** 2) * 7850 * 9.81 * g2.face / 1000
  const P = g1.toothLoad.map((t) => t * 1000 + selfP), Q = g2.toothLoad.map((t) => t * 1000 + selfQ)
  const hP = p1.toothLoad.map((t) => t * 1000 * tan20), hQ = g2.toothLoad.map((t) => t * tan20 * 1000)
  const rx = (a: number[], b: number[]) => a.map((x, i) => (x * (XP + s2.PQ) + b[i] * XP) / s2.XY)
  const ry = (a: number[], b: number[]) => a.map((x, i) => (x * XP + b[i] * (XP + s2.PQ)) / s2.XY)
  const RXv = rx(P, Q), RYv = ry(P, Q), RXh = rx(hP, hQ), RYh = ry(hP, hQ)
  const shaft2 = { XP, selfP, selfQ, P, Q, hP, hQ, RXv, RYv, RXh, RYh, RX: res(RXv, RXh), RY: res(RYv, RYh) }

  // manual operation (rows 341:351); ponytail: 0.25 m/min motor lifting speed is hard-coded in the sheet (C345), not C18; flagged
  const mo = inp.manual
  const manualSpeed = 0.25 * mo.handleRpm * mo.sprocket / mo.motorSpeed
  const effort = C5 * 1000 * manualSpeed / (2 * Math.PI * mo.handleRpm * mo.handleR * mo.sprocketEff * effRun)

  return {
    maxLift: C3, jammed: C4, liftingLoad: C5, liftHeight: LFH, ropeTension: RT, ropeMass: mass, mbf,
    fos: mbf / RT, fosRequired: 6, ropeTensionBDT: RTB, fosBDT: mbf / RTB, fosBDTRequired: 3,
    effStart, effRun, effRatio: effRun / effStart, hp, torqueAtRated, torqueAtNeed, reduction, drumRpm, liftSpeed,
    ratedTorque, brakeTorque: 1.5 * ratedTorque, bdt, drumTorqueBDT,
    drum: {
      pitch, grooveR: 0.53 * inp.ropeD, grooveDepth: 0.35 * inp.ropeD, crushN, crushB, crushAllowN, crushAllowB, ropeLen, grooves,
      totalGrooves: grooves + 3, groovedLength: (grooves + 3) * pitch / 1000, kg: drumKg, bmRope, bmSelf, Z: Zdrum, bending,
      combined: Math.sqrt(crushN ** 2 + bending ** 2 + bending * crushN), combinedAllow: crushAllowN,
    },
    torques: tq, gears, shaft, shaft2,
    manual: { speed: manualSpeed, effort, people: Math.ceil(effort / mo.personForce - 1e-12) },
    warnings,
  }
}
export type HoistResult = ReturnType<typeof hoist>

const mat = (name: string, grade: string, uts: number, yld: number): Material => ({ name, grade, uts, yield: yld })
export const defaultHoist: HoistInput = {
  liftingLoad: 118, liftHeight: null, drums: 2, fallsPerDrum: 2, pulleyEff: 0.95,
  ropeType: '6X37M(18/12/6-1)', grade: 1960, core: 'Fibre Core(CF)', ropeD: 28, drumPcd: 700, speed: 0.5, wormEff: [0.42, 0.75],
  motor: { name: 'AM 132-S-6', power: 3, rpm: 925 },
  worm: { ratio: 60, ratioD: 1, size: '7 FU', inputHP: 9, inputRpm: 1000, outputTorque: 2880 },
  gearType: '20 Deg Full Depth Involute', teeth: { drumGear: 115, drumPinion: 20, gear2: 121, pinion2: 20 },
  drum: { ...mat('Cast Steel', '280-520N', 520, 280), shell: 25, length: 0.5 },
  gearMat: mat('Cast Steel', '280-520N', 520, 280), pinionMat: mat('Cast Steel', '340-570N', 570, 340),
  modules: { drum: 12, second: 8 },
  shaft: { AC: 40, BD: 140, material: mat('Wrought Steel', '40C8', 580, 320), d: 0.085, plate: 20 },
  shaft2: { d: 0.1, PQ: 0.16, XY: 0.48 },
  manual: { handleR: 0.4, handleRpm: 50, motorSpeed: 925, sprocket: 3, sprocketEff: 0.95, personForce: 10 * 9.81 },
}

// ---------------------------------------------------------------- legacy 'Rope Drum Hoist' (hidden)

export interface LegacyHoistInput {
  designLoad: number | null // D7, t; null = jammed / 10
  ropeD: number // D9
  grade: '1570CF' | '1570CWR' | '1770CF' | '1770CWR' | '1960CF' | '1960CWR' // D10
  drums: number; sheaves: number; sheaveEff: number // D12, D14, D15
  drumD: number; sheaveD: number // D20, D21
  effs: [number, number, number, number, number, number] // D22:D27
  source: string; motorRpm: number; speed: number; ropes: number // D29, D30, D31, D32
  motorDesign: number; personForce: number; handleD: number // D37, D38, D39
  gearRatio: number; manualEff: number; wormRatio: number // D41, D42, D44
  drumLength: number; gear1: number; sheaveRatio: number // D50, D58, D60
}

export function legacyHoist(inp: LegacyHoistInput, ctx: { maxLift: number; headNwl: number; D: number }) {
  const D4 = ctx.maxLift, D5 = 2.5 * D4, D6 = D5 / 10, D7 = inp.designLoad ?? D6
  const r = ropeOld.rows.find((x) => x.d === inp.ropeD)
  if (!r) throw new RangeError(`No ${inp.ropeD} mm rope in the legacy table`)
  const D11 = r[`mbf_${inp.grade.slice(0, 4)}_${inp.grade.slice(4)}` as keyof typeof r] as number
  const D13 = D7 / inp.drums
  const D16 = D13 / (1 + inp.sheaves) * inp.sheaveEff
  const D28 = inp.effs.reduce((a, b) => a * b, 1)
  const D34 = 2 * inp.sheaves * inp.speed / (Math.PI * inp.drumD / 1000)
  const D45 = D7 * 1000 * 0.5 * (inp.drumD / 20) * inp.gearRatio / inp.manualEff * inp.wormRatio
  const D48 = ctx.headNwl * 2 // ponytail: operating stroke = 2 × NWL design head, as the sheet; flagged
  const D49 = inp.ropeD + 3
  const D51 = 1000 * D48 / (Math.PI * inp.drumD) + 3
  const D53 = inp.motorRpm / 100, D54 = D53 / 6
  return {
    maxLift: D4, jammed: D5, calculated: D6, design: D7, mbf: D11, perDrum: D13, force: D16, sf: D11 / D16 / 10,
    drumMin: 20 * inp.ropeD, sheaveMin: 17 * inp.ropeD, efficiency: D28, drumRpm: D34, reduction: inp.motorRpm / D34,
    motorCapacity: inp.speed * D7 / (6.12 * D28), poles: 120 * 50 / inp.motorRpm, handleR: inp.handleD / 2,
    manualTorque: D45, operatingForce: D45 / (inp.handleD / 2 / 10), liftVelocity: D34 * (inp.drumD / 1000) * Math.PI * (1 / 2 * inp.sheaves),
    stroke: D48, pitch: D49, winding: D51, drumLengthCalc: D51 * D49, shaftC: D53, shaftB: D54, shaftA: D34, gear2: D34 / D54,
    openTime: ctx.D / inp.speed,
  }
}

export const defaultLegacyHoist: LegacyHoistInput = {
  designLoad: null, ropeD: 12, grade: '1570CWR', drums: 2, sheaves: 1, sheaveEff: 0.95, drumD: 300, sheaveD: 200,
  effs: [0.95 ** 2, 0.9, 0.9, 0.95, 0.95, 0.95], source: 'AC 400V, 3 PH, 50 Hz', motorRpm: 1000, speed: 0.3, ropes: 2,
  motorDesign: 0.52, personForce: 10, handleD: 600, gearRatio: 0.001, manualEff: 0.4, wormRatio: 1 / 15,
  drumLength: 500, gear1: 1 / 6, sheaveRatio: 0.5,
}
