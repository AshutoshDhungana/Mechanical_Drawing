import { useRef, useState } from 'react'
import { loadDesign, saveDesign } from './designFile'
import { defaultProject, hoistDeckLevel, projectDefaults, type ProjectInput } from './calc/project'
import {
  beamSpacing, defaultManualSpacings, roundingSteps, spacingMethods, type BeamSpacingInput, type BeamSpacingResult, type SpacingMethod,
} from './calc/beamSpacing'
import { structure, type StructureInput, type StructureResult } from './calc/structure'
import type { GateType } from './calc/stiffeners'
import type { SkinLocation } from './calc/secProp'
import { NumberField, SelectField } from './ui/NumberField'
import { BeamSpacingView } from './ui/BeamSpacingView'
import { BeamsView, SectionView, StressView } from './ui/StructureViews'
import { defaultSeals, seals, type SealsInput } from './calc/seals'
import { wheelSpacing, type WheelSpacingInput } from './calc/wheelSpacing'
import { defaultWheelDesign, defaultWheelIs, wheelDesign, wheelGeometry, type WheelDesignInput, type WheelIsInput } from './calc/wheelDesign'
import { SealInputs, SealsView, WheelDesignInputs, WheelDesignView, WheelSpacingInputs, WheelSpacingView } from './ui/WheelViews'
import { defaultDownpull, downpull, type DownpullInput } from './calc/downpull'
import { weight, weightEnds } from './calc/weight'
import { defaultOperation, operation, type OperationInput } from './calc/operation'
import { DownpullInputs, DownpullView, OperationInputs, OperationView, WeightView } from './ui/OpsViews'
import { defaultHoist, defaultLegacyHoist, hoist, legacyHoist, type HoistInput } from './calc/hoist'
import { defaultEmbedded, defaultLegacyEmbedded, embeddedParts, legacyEmbedded, type EmbeddedInput } from './calc/embedded'
import { slotLength } from './calc/wheelDesign'
import { summary } from './calc/summary'
import { EmbeddedInputs, EmbeddedView, HoistInputs, HoistView, LegacyView, SummaryView } from './ui/ReportViews'
import { CantAxleSketch, DoubleAxleSketch, DownpullFlowSketch, DownpullPlanSketch, EndBeamSketch, HoistShaftSketch, PlateSketch, SealSketch, WheelSketch } from './ui/Sketches'
import type { SealResult } from './calc/seals'
import { f, ratioClass } from './ui/format'
import { gateModel, type GateDrawingInput } from './drawing/model'
import { defaultDrawingSettings, detailSheet, gaSheet, type DrawingSettings } from './drawing/sheet'
import { DrawingInputs, DrawingView } from './ui/DrawingView'

/** Beam Spacing inputs; null = linked to the value derived from the project inputs (as the workbook's formulas do). */
type BeamForm = Omit<BeamSpacingInput, 'D' | 'Lsup' | 'HB' | 'Hp'> & {
  D: number | null; Lsup: number | null; HB: number | null; Hp: number | null
}
type StructureForm = Omit<StructureInput, 'Lse' | 'taperX' | 'tap' | 'endZone'> & { Lse: number | null; tap: number | null }

const roundingLabels = ['None', '1/16 in (1.6 mm)', '1/8 in (3.2 mm)', '1/4 in (6.4 mm)', '1/2 in (12.7 mm)', '1 in (25.4 mm)']
const gateTypes: GateType[] = ['Fixed Wheel (cantilevered)', 'Fixed Wheel (double support)', 'Bulkhead (no wheels)']
const tabs = ['Beam spacing', 'Beams & stiffeners', 'Section & strength', 'Stress checks', 'Seals', 'Wheel spacing', 'Wheel design',
  'Downpull', 'Weight & cg', 'Operation', 'Hoist', 'Embedded parts', 'Summary', 'Report', 'Drawings', 'Legacy sheets'] as const
type Tab = (typeof tabs)[number]
const wheelTabs: readonly Tab[] = ['Wheel spacing', 'Wheel design']

const today = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD

/** Every input of a design, with its starting values (also the shape a loaded design file is checked against). */
const defaults = {
  project: defaultProject,
  form: { n: 5, method: 'equal-moments', acc: 0, D: null, Lsup: null, HB: null, Hp: null, alp: 0.024, rw: 9.81 } as BeamForm,
  sform: {
    gateType: 'Fixed Wheel (cantilevered)', loc: 'Upstream',
    material: { E: 206000, Fyb: 250, Fys: 250, Fyw: 400, beta: 0.75, omegaB: 1.67 },
    Lse: null, tap: null, dweb: 0.25,
    beams: [{ type: 'I Shape', designation: 'ISMB 350' }],
    skinThickness: [0.012],
    stiffeners: [{ spacing: 0.3, thickness: 0.01, count: 12 }],
  } as StructureForm,
  seals: defaultSeals,
  wsForm: { n: 2, method: 'equal-load', acc: 0, seismic: true } as WheelSpacingInput,
  wheel: defaultWheelDesign, wheelIs: defaultWheelIs, downpull: defaultDownpull, operation: defaultOperation, hoist: defaultHoist,
  source: 'AC 400V, 3 PH, 50 Hz', embedded: defaultEmbedded,
}
type Design = typeof defaults

function attempt<T>(fn: () => T): { ok: T } | { error: string } {
  try {
    return { ok: fn() }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export default function App() {
  const [picked, setTab] = useState<Tab>(() => tabs.find((t) => `#${encodeURIComponent(t)}` === location.hash) ?? 'Beam spacing')
  const [project, setProject] = useState<ProjectInput>(defaultProject)
  const [form, setForm] = useState<BeamForm>(defaults.form)
  const [sform, setSform] = useState<StructureForm>(defaults.sform)
  const [sealsIn, setSeals] = useState<SealsInput>(defaultSeals)
  const [wsForm, setWs] = useState<WheelSpacingInput>(defaults.wsForm)
  const [wd, setWd] = useState<WheelDesignInput>(defaultWheelDesign)
  const [isIn, setIs] = useState<WheelIsInput>(defaultWheelIs)
  const [dpIn, setDp] = useState<DownpullInput>(defaultDownpull)
  const [opIn, setOp] = useState<OperationInput>(defaultOperation)
  const [hoistIn, setHoist] = useState<HoistInput>(defaultHoist)
  const [source, setSource] = useState(defaults.source)
  const [embIn, setEmb] = useState<EmbeddedInput>(defaultEmbedded)
  const [drawSet, setDrawSet] = useState<DrawingSettings>(defaultDrawingSettings)
  const [loadError, setLoadError] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)
  const design: Design = {
    project, form, sform, seals: sealsIn, wsForm, wheel: wd, wheelIs: isIn, downpull: dpIn, operation: opIn, hoist: hoistIn, source, embedded: embIn,
  }
  const apply = (d: Design) => {
    setProject(d.project); setForm(d.form); setSform(d.sform); setSeals(d.seals); setWs(d.wsForm); setWd(d.wheel); setIs(d.wheelIs)
    setDp(d.downpull); setOp(d.operation); setHoist(d.hoist); setSource(d.source); setEmb(d.embedded)
  }
  const open = async (file: File) => {
    try { apply(loadDesign(await file.text(), defaults)); setLoadError(undefined) } catch (e) { setLoadError(`${file.name}: ${(e as Error).message}`) }
  }
  const save = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([saveDesign(design)], { type: 'application/json' }))
    a.download = `${project.location.trim().replace(/[^\w-]+/g, '-') || 'gate'}.vertgate.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const setP = (k: keyof ProjectInput) => (v: number) => setProject({ ...project, [k]: v })
  const setF = <K extends keyof BeamForm>(k: K) => (v: BeamForm[K]) => setForm({ ...form, [k]: v })
  const setS = <K extends keyof StructureForm>(k: K) => (v: StructureForm[K]) => setSform({ ...sform, [k]: v })
  const setM = (k: keyof StructureForm['material']) => (v: number) => setSform({ ...sform, material: { ...sform.material, [k]: v } })
  const setAt = <T,>(a: T[], i: number, v: T) => { const b = [...a]; b[i] = v; return b }

  const derived = projectDefaults(project)
  const input: BeamSpacingInput = {
    ...form,
    D: form.D ?? derived.gateHeight,
    Lsup: form.Lsup ?? derived.supportSpan,
    HB: form.HB ?? derived.headHfl,
    Hp: form.Hp ?? derived.headHfl,
  }
  const manual = form.method === 'manual'
    ? form.manual?.length === form.n ? form.manual : defaultManualSpacings(form.n, input.D)
    : undefined
  const Lse = sform.Lse ?? project.clearSpan + 0.1 // SecProp!I6

  const wheels = sform.gateType !== 'Bulkhead (no wheels)'
  const wsManual = wsForm.method === 'manual'
    ? wsForm.manual?.length === wsForm.n ? wsForm.manual : defaultManualSpacings(wsForm.n, input.D)
    : undefined

  // flow: Beam Spacing → wheel geometry (end zone, taper) → structure → Seals, Wheel Spacing → Wheel Design
  const errors: string[] = []
  const ok = <T,>(r: { ok: T } | { error: string }): T | undefined => {
    if ('error' in r) errors.push(r.error)
    return 'ok' in r ? r.ok : undefined
  }
  const bs: BeamSpacingResult | undefined = ok(attempt(() => beamSpacing({ ...input, manual })))
  const geom = ok(attempt(() => wheelGeometry(wd, {
    gateType: sform.gateType, clearSpan: project.clearSpan, Lsup: input.Lsup, t0: sform.skinThickness[0] ?? 0,
    stiffSpacing: sform.stiffeners[0]?.spacing ?? 0, stiffThickness: sform.stiffeners[0]?.thickness ?? 0,
  })))
  const tap = sform.tap ?? geom?.tapDefault ?? 0
  const st: StructureResult | undefined = bs && geom && ok(attempt(() =>
    structure(bs, input.Lsup, { ...sform, Lse, tap, endZone: geom.endZone })))
  const sl = bs && ok(attempt(() => seals(sealsIn, bs.heads[0], input.HB, input.D, Lse, input.rw)))
  const ws = wheels ? ok(attempt(() => wheelSpacing({ ...wsForm, manual: wsManual }, input, Lse))) : undefined
  const wdr = bs && ws && st && geom && ok(attempt(() => wheelDesign(wd, sform.gateType, {
    geometry: geom, maxWheelLoad: ws.maxLoad, psiDeg: Math.max(...st.analyses.map((a) => a.rotationDeg)),
    endBeam: { M: ws.maxMoment, ts: st.composites[0].ts, dweb: sform.dweb, Lb: bs.maxSpacing },
    sideSeal: sealsIn.side.dims ?? sealsIn.lintel.dims, dweb: sform.dweb, t0: st.t[0], material: sform.material,
  })))
  const cantilever = sform.gateType === 'Fixed Wheel (cantilevered)'
  const downstream = sform.loc === 'Downstream'
  const n = bs?.beams.length ?? 0
  const lintel = sealsIn.lintel.dims
  const gateD = st ? st.sections[n - 1].tfb + st.sections[n - 1].dw + st.sections[n - 1].tff : 0 // depth of the bottom beam
  const dp = st && ok(attempt(() => downpull(dpIn, {
    HB: input.HB, D: input.D, Lse, rw: input.rw, a2: (lintel.B + lintel.mt) / 1000, d: gateD, tsBottom: st.t[n],
  })))
  const wt = bs && st && geom && (wdr || !wheels) && ok(attempt(() => weight({
    gateType: sform.gateType, D: input.D, Lsup: input.Lsup, Lse, seals: sealsIn, spacings: bs.spacings, sections: st.sections,
    t: st.t, stiff: st.stiff, tap, dweb: sform.dweb,
    wheels: wdr ? {
      count: 2 * wsForm.n, wheelKN: wdr.wheelWeight, axleKN: (wdr.cant ?? wdr.axle)?.weight ?? 0, z: cantilever ? wdr.cantInput.y : wd.double.y,
    } : { count: 0, wheelKN: 0, axleKN: 0, z: 0 },
    ends: weightEnds(sform.gateType, input.Lsup, st.composites[0].ts, {
      cantBh: geom.bh, cantB: wd.cant.b, cantC: wd.cant.c, cantA: geom.a,
      dsLr: wd.double.bh + 2 * wd.double.b + 2 / 3 * wd.double.c, dsC: wd.double.c,
    }),
    erbisti: { clearSpan: project.clearSpan, clearHeight: project.clearHeight, head: derived.headHfl },
  })))
  const op = wt && sl && ok(attempt(() => operation(opIn, {
    gateType: sform.gateType, loc: sform.loc, rw: input.rw, HB: input.HB, D: input.D, mass: wt.mass, volume: wt.volume,
    hydrostatic: 2 * (ws?.totalLoad ?? 0), hardness: wd.contact === 'Line Contact' ? wd.line.hardness : wd.elliptical.hardness,
    wheelD: wdr?.Dw ?? 1, axleD: cantilever ? wd.cant.d1 : wd.double.d, seals: sl,
    downpull: dp && ((x) => dp.sweep[Math.round(x * 100) - 1]?.F ?? 0),
  })))
  const deck = hoistDeckLevel(project, input.D)
  const maxLift = op ? Math.max(...op.columns.map((c) => c.lift)) / 1000 : undefined // Operation C29:O29
  const hr = maxLift !== undefined ? ok(attempt(() => hoist(hoistIn, { maxLift, liftHeightDefault: deck - input.D - project.sill }))) : undefined
  const sideSeal = sealsIn.side.dims ?? sealsIn.lintel.dims
  const emb = st && wt && ok(attempt(() => embeddedParts(embIn, {
    Lsup: input.Lsup, clearSpan: project.clearSpan, gateMass: wt.mass, Fyb: sform.material.Fyb,
    slotLength: slotLength(sideSeal, st.t[0], sform.dweb, wd.track.d), sealPlateT: wd.sealPlate, precompression: lintel.delta,
    wheelBase: wd.track.beam, track: { b: wd.track.b, d: wd.track.d }, sill: project.sill, platform: project.platform,
    erbistiX: project.clearSpan ** 2 * project.clearHeight * derived.headHfl,
  })))
  const legacy = maxLift !== undefined && st && wdr ? {
    hoist: ok(attempt(() => legacyHoist(defaultLegacyHoist, { maxLift, headNwl: derived.headNwl, D: input.D }))),
    embedded: ok(attempt(() => legacyEmbedded(defaultLegacyEmbedded, {
      gateType: sform.gateType, side: sideSeal, t0: st.t[0], y: cantilever ? wdr.cantInput.y : wd.double.y,
      wheel: { P: wd.line.P, D: wd.line.D, l: wd.line.l }, Sr: wd.double.bh + 2 * wd.double.b + wd.double.c, c: cantilever ? wd.cant.c : wd.double.c,
      Lsup: input.Lsup, clearSpan: project.clearSpan, sill: project.sill, platform: project.platform,
    }))),
  } : undefined
  const report = bs && st && wt && op && maxLift !== undefined && summary({
    project, gateType: sform.gateType, heads: { hfl: derived.headHfl, nwl: derived.headNwl, deck },
    beams: { n, D: input.D, Lsup: input.Lsup, HB: input.HB, totalLoad: bs.totalLoad, first: st.defs[0] }, stiff: st.stiff[0], loc: sform.loc,
    seals: sealsIn, wheelsPerSide: wheels ? wsForm.n : undefined,
    wheel: wdr && geom ? {
      input: wd, axleD: cantilever ? wd.cant.d1 : wd.double.d, axleSpan: cantilever ? geom.Lr : wd.double.bh + 2 * wd.double.b + 2 / 3 * wd.double.c,
      ts: st.composites[0].ts, dweb: sform.dweb,
    } : undefined,
    massKg: wt.mass, hydrostatic: 2 * (ws?.totalLoad ?? 0), maxLift, hoist: hr && { input: hoistIn, r: hr, source }, embedded: emb || undefined,
  })
  const error = errors[0]

  const shown = tabs.filter((t) => (wheels || !wheelTabs.includes(t)) && (t !== 'Downpull' || (wheels && downstream)))
  const tab = shown.includes(picked) ? picked : 'Beam spacing'

  // explanatory sketches under the active tab
  const fk = (r: SealResult) => (r.active ? { F: r.F, k: r.k } : {})
  const axleD = cantilever ? wd.cant.d1 : wd.double.d
  const eb = wdr && (wdr.axle ?? wdr.cant)?.endBeam
  const sketchesFor = (tb: Tab) =>
    tb === 'Seals' && sl ? <>
      <SealSketch title="Lintel seal" type={sealsIn.lintel.type} d={lintel} {...fk(sl.lintel)} />
      <SealSketch title="Side seals" type={sealsIn.side.type} d={sealsIn.side.dims ?? lintel} {...fk(sl.side)} />
      <SealSketch title="Sill seal" type={sealsIn.sill.type} d={sealsIn.sill.dims} {...fk(sl.sill)} />
    </>
    : tb === 'Wheel design' && wdr && geom && st ? <>
      <WheelSketch d={axleD} bh={cantilever ? geom.bh : wd.double.bh} {...(wd.contact === 'Line Contact'
        ? { D: wd.line.D, bt: wd.line.l }
        : { D: wd.elliptical.D, bt: wd.elliptical.bt, t: wd.elliptical.t, dh: wd.elliptical.dh, dt: wd.elliptical.dt, Rt: wd.elliptical.Rt })} />
      {wdr.axle && <DoubleAxleSketch {...wdr.axle} b={wd.double.b} bh={wd.double.bh} c={wd.double.c} />}
      {wdr.cant && <CantAxleSketch {...wdr.cant} Lr={wdr.cantInput.Lr} a={wdr.cantInput.a} c={wdr.cantInput.c} b={wdr.cantInput.b} bh={wdr.cantInput.bh} />}
      {eb && <EndBeamSketch double={!!wdr.axle} ts={st.composites[0].ts} Sr={wdr.axle?.Sr} e={eb.e} d={axleD} f={eb.f}
        c={cantilever ? wdr.cantInput.c : wd.double.c} y={cantilever ? wdr.cantInput.y : wd.double.y} dweb={sform.dweb} />}
    </>
    : tb === 'Downpull' && dp ? <>
      <DownpullPlanSketch a1={dpIn.location === 'Tunnel' ? dpIn.a1 : undefined} a2={(lintel.B + lintel.mt) / 1000} a2pp={dpIn.a2pp} d={gateD} />
      <DownpullFlowSketch {...dp.at} H={input.HB} e={dp.e} d={gateD} />
    </>
    : tb === 'Stress checks' && bs && st ? <>
      <PlateSketch top a={bs.spacings[0]} b={st.stiff[0].spacing} q={bs.pressures[0]} q0={bs.pressures[1] - bs.pressures[0]} />
      {n > 1 && <PlateSketch top={false} a={bs.spacings[1]} b={st.stiff[1].spacing} q={bs.pressures[1]} q0={bs.pressures[2] - bs.pressures[1]} />}
    </>
    : tb === 'Hoist' && hr ? (
      <HoistShaftSketch {...hr.shaft} RT={hr.ropeTension}
        Rc={Math.max(hr.shaft.resultant.X.Rc[0], hr.shaft.resultant.Y.Rc[0])} Rd={Math.max(hr.shaft.resultant.X.Rd[0], hr.shaft.resultant.Y.Rd[0])} />
    ) : null
  const sketchesOf = (tb: Tab) => { const k = sketchesFor(tb); return k && <div className="sketches">{k}</div> }

  // scaled drawings (built only while the Drawings tab is open)
  const ci = wdr?.cantInput
  const drawingIn: GateDrawingInput | undefined = tab === 'Drawings' && bs && st && geom ? {
    gateType: sform.gateType, loc: sform.loc, D: input.D, Lsup: input.Lsup, Lse, tap, dweb: sform.dweb, ts: st.composites[0].ts,
    spacings: bs.spacings, sections: st.sections, t: st.t, stiff: st.stiff, seals: sealsIn,
    names: st.defs.map((d, j) => (d.type === 'I Shape' ? d.designation : `BUILT-UP ${Math.round((st.sections[j].tff + st.sections[j].dw + st.sections[j].tfb) * 1000)} DEEP`)),
    wheels: wdr && ws && ci ? {
      double: !cantilever, spacings: ws.spacings, Dw: wdr.Dw, tread: geom.tread, track: { b: wd.track.b, d: wd.track.d },
      hubD: wd.contact === 'Line Contact' ? undefined : wd.elliptical.dh,
      ...(cantilever ? { bh: ci.bh, d: ci.d1, y: ci.y, b: ci.b, c: ci.c, Lr: ci.Lr, a: ci.a }
        : { bh: wd.double.bh, d: wd.double.d, y: wd.double.y, b: wd.double.b, c: wd.double.c, Lr: 0, a: 0 }),
    } : undefined,
  } : undefined
  const model = drawingIn && ok(attempt(() => gateModel(drawingIn)))
  const drawMeta = model && {
    project: project.location, title: '', date: today, dwgNo: 'VG',
    gate: `${sform.gateType.toUpperCase()}, SKIN PLATE ${sform.loc.toUpperCase()}`,
    opening: `${f(project.clearSpan)} x ${f(project.clearHeight)} M, SILL EL ${f(project.sill)} M`,
    notes: [
      'DIMENSIONS IN MM. LEVELS IN M.',
      `SILL EL ${f(project.sill)} M, TOP SEAL EL ${f(project.sill + input.D)} M, DESIGN HEAD ${f(derived.headHfl)} M AT HFL.`,
      `STEEL YIELD STRENGTH: BEAMS ${sform.material.Fyb} MPA, PLATES ${sform.material.Fys} MPA.`,
      ...(wt ? [`ESTIMATED GATE MASS ${Math.round(wt.mass)} KG (WEIGHT & CG, NO BALLAST).`] : []),
      ...(tap > 0 ? [`BEAM WEBS TAPER FROM FULL DEPTH TO ${Math.round(sform.dweb * 1000)} OVER ${Math.round(tap * 1000)} FROM THE SUPPORTS.`] : []),
      ...(drawingIn?.wheels && !drawingIn.wheels.hubD ? ['WHEEL HUB DIAMETER IS NOT PART OF THE CALCULATION: DRAWN AS 2 x AXLE DIAMETER.'] : []),
      ...model.warnings.map((w) => w.toUpperCase()),
    ],
  }
  const sheet = model && drawMeta && ok(attempt(() => (drawSet.sheet === 'ga' ? gaSheet(model, drawSet.size, drawSet.scale, drawMeta) : detailSheet(model, drawSet.size, drawMeta))))

  const linkedField = (k: 'D' | 'Lsup' | 'HB' | 'Hp', label: string, hint: string) => (
    <NumberField label={label} hint={hint} unit="m" min={0} value={input[k]} linked={form[k] === null}
      onChange={setF(k)} onRelink={() => setF(k)(null)} />
  )
  const worst = st && Math.max(st.maxRatio, wdr?.maxRatio ?? 0,
    ...st.analyses.flatMap((a) => [a.fb1 / a.fb1Allow, a.fb2 / a.fb2Allow, a.fv / a.fvAllow, a.spanRatioMin / a.spanRatio]))


  const inputsFor = (tb: Tab) => (
    tb === 'Beam spacing' ? (
            <>
              <section className="card">
                <h2>Project</h2>
                <label className="field">
                  <span className="field-label">Location</span>
                  <span className="field-input">
                    <input value={project.location} onChange={(e) => setProject({ ...project, location: e.target.value })} />
                  </span>
                </label>
                <NumberField label="Clear span" unit="m" min={0} value={project.clearSpan} onChange={setP('clearSpan')} />
                <NumberField label="Clear height" unit="m" min={0} value={project.clearHeight} onChange={setP('clearHeight')} />
                <NumberField label="Number of openings" min={1} step={1} value={project.openings} onChange={setP('openings')} />
                <NumberField label="High flood level (HFL)" unit="m amsl" value={project.hfl} onChange={setP('hfl')} />
                <NumberField label="Normal water level (NWL)" unit="m amsl" value={project.nwl} onChange={setP('nwl')} />
                <NumberField label="Sill level" unit="m amsl" value={project.sill} onChange={setP('sill')} />
                <NumberField label="Gate operating platform" unit="m amsl" value={project.platform} onChange={setP('platform')} />
                <dl className="derived">
                  <dt>Design head at HFL</dt><dd>{f(derived.headHfl)} m</dd>
                  <dt>Design head at NWL</dt><dd>{f(derived.headNwl)} m</dd>
                  <dt>Hoist deck level</dt><dd>{f(hoistDeckLevel(project, input.D))} m amsl</dd>
                </dl>
              </section>

              <section className="card">
                <h2>Beam spacing</h2>
                <NumberField label="Number of beams" min={2} max={99} step={1} value={form.n}
                  onChange={(v) => Number.isInteger(v) && setF('n')(v)} />
                <label className="field">
                  <span className="field-label">Method</span>
                  <span className="field-input">
                    <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as SpacingMethod, manual: undefined })}>
                      {Object.entries(spacingMethods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Round spacings to<small>{manual ? 'not applied to manual spacings' : ''}</small></span>
                  <span className="field-input">
                    <select value={form.acc} disabled={!!manual} onChange={(e) => setF('acc')(Number(e.target.value))}>
                      {roundingSteps.map((s, i) => <option key={s} value={s}>{roundingLabels[i]}</option>)}
                    </select>
                  </span>
                </label>
                {linkedField('D', 'Gate height to top seal', 'clear height + 0.1')}
                {linkedField('Lsup', 'Span between supports', 'clear span + 2 × 0.2')}
                {linkedField('HB', 'Depth of water to sill', 'HFL − sill')}
                {linkedField('Hp', 'Upstream pool depth', 'HFL − sill')}
                <NumberField label="Seismic coefficient (OBE)" min={0} max={1} value={form.alp} onChange={setF('alp')} />
                <NumberField label="Unit weight of water" unit="kN/m³" min={0} value={form.rw} onChange={setF('rw')} />
              </section>
            </>
          ) : tb === 'Seals' ? (
            <SealInputs value={sealsIn} onChange={setSeals} />
          ) : tb === 'Wheel spacing' ? (
            <WheelSpacingInputs value={wsForm} onChange={setWs} />
          ) : tb === 'Downpull' ? (
            <DownpullInputs value={dpIn} onChange={setDp} />
          ) : tb === 'Weight & cg' ? (
            <section className="card"><h2>Weight & cg</h2><p className="note">No inputs of its own: built from the beams, stiffeners, seals and wheels.</p></section>
          ) : tb === 'Hoist' ? (
            <HoistInputs value={hoistIn} onChange={setHoist} liftHeightDefault={deck - input.D - project.sill} source={source} onSource={setSource} />
          ) : tb === 'Embedded parts' ? (
            <EmbeddedInputs value={embIn} onChange={setEmb} sealPlate={wd.sealPlate} onSealPlate={(sealPlate) => setWd({ ...wd, sealPlate })} />
          ) : tb === 'Drawings' ? (
            <DrawingInputs value={drawSet} onChange={setDrawSet} details={model?.details.length ?? 0} />
          ) : tb === 'Summary' || tb === 'Legacy sheets' || tb === 'Report' ? (
            <section className="card"><h2>{tab}</h2><p className="note">No inputs of its own: it reports values from the other tabs.</p></section>
          ) : tb === 'Operation' ? (
            <OperationInputs value={opIn} onChange={setOp} />
          ) : tb === 'Wheel design' ? (
            <WheelDesignInputs value={wd} onChange={setWd} gateType={sform.gateType} geometry={geom} derived={wdr?.cantInput}
              isIn={isIn} onIs={setIs} />
          ) : (
            <>
              <section className="card">
                <h2>Gate</h2>
                <SelectField label="Type of gate" value={sform.gateType} options={gateTypes} onChange={setS('gateType')} />
                <SelectField label="Skin plate location" value={sform.loc} options={['Upstream', 'Downstream'] as SkinLocation[]} onChange={setS('loc')} />
                <NumberField label="Span between seal centrelines" hint="clear span + 0.1" unit="m" min={0} value={Lse}
                  linked={sform.Lse === null} onChange={setS('Lse')} onRelink={() => setS('Lse')(null)} />
                <NumberField label="Web taper length from support" hint="0 = no taper; default from wheel geometry" unit="m" min={0} value={tap}
                  linked={sform.tap === null} onChange={setS('tap')} onRelink={() => setS('tap')(null)} />
                <NumberField label="Web depth at support" unit="m" min={0} value={sform.dweb} onChange={setS('dweb')} />
                <dl className="derived">
                  <dt>End zone at each support (wheel geometry)</dt><dd>{geom ? f(geom.endZone) : '—'} m</dd>
                </dl>
              </section>
              <section className="card">
                <h2>Material and safety factors</h2>
                <NumberField label="Elastic modulus E" unit="MPa" min={1} value={sform.material.E} onChange={setM('E')} />
                <NumberField label="Yield strength, beams" unit="MPa" min={1} value={sform.material.Fyb} onChange={setM('Fyb')} />
                <NumberField label="Yield strength, plates" unit="MPa" min={1} value={sform.material.Fys} onChange={setM('Fys')} />
                <NumberField label="Weld strength" unit="MPa" min={1} value={sform.material.Fyw} onChange={setM('Fyw')} />
                <NumberField label="Gate design factor β" min={0.01} value={sform.material.beta} onChange={setM('beta')} />
                <NumberField label="Bending safety factor Ωb" min={0.01} value={sform.material.omegaB} onChange={setM('omegaB')} />
              </section>
            </>
          )
  )
  const warningsFor = (tb: Tab): string[] => [...(bs?.warnings ?? []), ...(tb !== 'Beam spacing' ? st?.warnings ?? [] : []),
            ...(tb === 'Wheel spacing' ? ws?.warnings ?? [] : []), ...(tb === 'Wheel design' ? wdr?.warnings ?? [] : []),
            ...(tb === 'Hoist' ? hr?.warnings ?? [] : []), ...(tb === 'Drawings' ? model?.warnings ?? [] : []),
          ]
  const resultsFor = (tb: Tab) => (
    <>
          {tb === 'Beam spacing' && bs && <BeamSpacingView r={bs} manual={manual} onManual={(m) => setForm({ ...form, manual: m })} />}
          {tb === 'Beams & stiffeners' && bs && st && (
            <BeamsView bs={bs} r={st} beams={st.defs}
              onBeam={(i, d) => setS('beams')(setAt(sform.beams, i, d))}
              skin={sform.skinThickness as number[]} onSkin={(k, t) => setS('skinThickness')(setAt(sform.skinThickness, k, t))}
              stiffeners={sform.stiffeners} onStiffener={(k, s) => setS('stiffeners')(setAt(sform.stiffeners, k, s))} />
          )}
          {tb === 'Section & strength' && st && <SectionView r={st} />}
          {tb === 'Stress checks' && bs && st && <StressView bs={bs} r={st} />}
          {tb === 'Seals' && sl && <SealsView r={sl} types={[sealsIn.lintel.type, sealsIn.side.type, sealsIn.sill.type]} />}
          {tb === 'Wheel spacing' && ws && <WheelSpacingView r={ws} manual={wsManual} onManual={(m) => setWs({ ...wsForm, manual: m })} />}
          {tb === 'Wheel design' && wdr && <WheelDesignView r={wdr} input={wd} isIn={isIn} />}
          {tb === 'Downpull' && dp && <DownpullView r={dp} />}
          {tb === 'Weight & cg' && wt && <WeightView r={wt} />}
          {tb === 'Operation' && op && <OperationView r={op} submerged={downstream} />}
          {tb === 'Hoist' && hr && <HoistView r={hr} h={hoistIn} />}
          {tb === 'Embedded parts' && emb && <EmbeddedView r={emb} />}
          {tb === 'Summary' && report && <SummaryView sections={report} />}
          {tb === 'Drawings' && sheet && <DrawingView key={`${drawSet.sheet}${drawSet.size}`} sheet={sheet} hidden={drawSet.hidden} name={`vertgate-${drawSet.sheet === 'ga' ? 'general-arrangement' : 'details'}`} />}
          {tb === 'Legacy sheets' && <LegacyView hoist={legacy?.hoist} embedded={legacy?.embedded} />}
    </>
  )


  // calculation report: Summary, then every sheet with its inputs, results and sketches, for print / PDF
  const reportTabs = shown.filter((t) => !(['Summary', 'Report', 'Drawings', 'Legacy sheets'] as Tab[]).includes(t))
  const ownInputs = (t: Tab) => !(['Section & strength', 'Stress checks', 'Weight & cg'] as Tab[]).includes(t) // the gate card shows once
  const reportView = () => (
    <div className="report">
      <style>{'@page { size: A4; margin: 12mm }'}</style>
      <section className="card report-cover">
        <h1>Vertical lift gate: calculation report</h1>
        <dl className="derived">
          <dt>Project</dt><dd>{project.location}</dd>
          <dt>Gate</dt><dd>{sform.gateType}, skin plate {sform.loc.toLowerCase()}, {f(project.clearSpan)} × {f(project.clearHeight)} m opening</dd>
          <dt>Date</dt><dd>{today}</dd>
          <dt>Highest utilisation ratio</dt><dd className={worst !== undefined ? `ratio ${ratioClass(worst)}` : undefined}>{worst !== undefined ? f(worst, 2) : '—'}</dd>
        </dl>
        <p className="note">Generated by VertGate from the design calculation (port of Vertical-Lift-Gate.xlsm). Items flagged for engineering review are listed in the findings document.</p>
        <button className="no-print" onClick={() => { document.querySelectorAll('.report details').forEach((d) => { (d as HTMLDetailsElement).open = true }); window.print() }}>Print / PDF</button>
      </section>
      {[...new Set(reportTabs.flatMap(warningsFor))].map((w) => <p key={w} className="alert">{w}</p>)}
      <section className="report-section">
        <h2 className="report-h">Summary</h2>
        {resultsFor('Summary')}
      </section>
      {reportTabs.map((t, i) => (
        <section key={t} className="report-section">
          <h2 className="report-h">{i + 1}. {t}</h2>
          {ownInputs(t) && <fieldset disabled className="report-inputs"><legend>Inputs</legend>{inputsFor(t)}</fieldset>}
          {resultsFor(t)}
          {sketchesOf(t)}
        </section>
      ))}
    </div>
  )

  return (
    <div className="app">
      <header>
        <h1>VertGate</h1>
        <nav role="tablist" aria-label="Workbook sheets">
          {shown.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : undefined}
              onClick={() => { setTab(t); history.replaceState(null, '', `#${encodeURIComponent(t)}`) }}>{t}</button>
          ))}
        </nav>
        <span className="file-actions">
          <button onClick={save} title="Download every input as a JSON design file">Save design</button>
          <button onClick={() => fileInput.current?.click()} title="Load a saved JSON design file">Open design</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = '' }} />
        </span>
        {worst !== undefined && (
          <span className={`badge ${ratioClass(worst)}`} title="Highest utilisation ratio across the beam and panel checks">
            max ratio {f(worst, 2)}
          </span>
        )}
      </header>

      <main>
        <aside>
          {inputsFor(tab)}
        </aside>

        <section className="results">
          {error && <p className="alert error">{error}</p>}
          {loadError && <p className="alert error">{loadError}</p>}
          {tab === 'Report' ? reportView() : <>
            {warningsFor(tab).map((w) => <p key={w} className="alert">{w}</p>)}
            {resultsFor(tab)}
            {sketchesOf(tab)}
          </>}
        </section>
      </main>
    </div>
  )
}
