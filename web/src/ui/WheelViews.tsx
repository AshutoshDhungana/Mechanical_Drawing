import { roundingSteps } from '../calc/beamSpacing'
import { rolledSections } from '../calc/defineBeam'
import { lintelTypes, sideTypes, sillTypes, type SealDims, type SealResult, type SealsInput, type SealsResult, type SealType } from '../calc/seals'
import type { GateType } from '../calc/stiffeners'
import { wheelMethods, type WheelMethod, type WheelSpacingInput, type WheelSpacingResult } from '../calc/wheelSpacing'
import {
  concreteGrades, wheelIs, type ContactType, type WheelDesignInput, type WheelDesignResult, type WheelGeometry, type WheelIsInput,
} from '../calc/wheelDesign'
import { NumberField, NumInput, SelectField } from './NumberField'
import { f, ratioClass } from './format'

export type Spec<T> = [key: keyof T & string, label: string, unit?: string, hint?: string]

/** A NumberField per spec entry, editing one object. */
export function Fields<T extends object>({ value, spec, onChange }: { value: T; spec: Spec<T>[]; onChange: (v: T) => void }) {
  return spec.map(([k, label, unit, hint]) => (
    <NumberField key={k} label={label} unit={unit} hint={hint} value={value[k] as number} onChange={(v) => onChange({ ...value, [k]: v })} />
  ))
}

/** Rows of value against allowable with the ratio. */
/** atLeast: the value must reach the allowable (a factor of safety), so the ratio is allowable / value. */
export type Check = [label: string, unit: string, value: number, allow?: number, dp?: number, atLeast?: boolean]
export function Checks({ title, rows, note }: { title: string; rows: Check[]; note?: string }) {
  return (
    <div className="card table-wrap">
      <h2>{title}</h2>
      <table className="props">
        <thead><tr><th></th><th>Unit</th><th>Value</th><th>Allowable</th><th>Ratio</th></tr></thead>
        <tbody>
          {rows.map(([label, unit, v, allow, dp = 3, atLeast]) => (
            <tr key={label}>
              <th scope="row">{label}</th><td className="unit-cell">{unit}</td><td>{f(v, dp)}</td>
              <td>{allow === undefined ? '' : `${atLeast ? '≥ ' : ''}${f(allow, dp)}`}</td>
              {allow === undefined ? <td /> : <td className={`ratio ${ratioClass(atLeast ? allow / v : v / allow)}`}>{f(atLeast ? allow / v : v / allow, 3)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="note">{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Seals

const sealSpec: Spec<SealDims>[] = [
  ['B', 'Bulb diameter', 'mm'], ['t', 'Seal stem thickness', 'mm'], ['delta', 'Deflection (precompression)', 'mm'],
  ['x', 'Projection from clamp', 'mm'], ['mu', 'Static coefficient of friction'], ['cw', 'Clamp / mount bar width', 'mm'],
  ['ct', 'Clamp bar thickness', 'mm'], ['mt', 'Mount bar thickness', 'mm'],
]
const wedgeSpec: Spec<SealDims>[] = [['t', 'Seal stem thickness', 'mm'], ['cw', 'Clamp / mount bar width', 'mm'],
  ['ct', 'Clamp bar thickness', 'mm'], ['tbt', 'Top bar thickness', 'mm'], ['sh', 'Seal height', 'mm']]

export function SealInputs({ value: s, onChange }: { value: SealsInput; onChange: (s: SealsInput) => void }) {
  const sideDims = s.side.dims ?? s.lintel.dims
  return (
    <>
      <section className="card">
        <h2>Lintel seal</h2>
        <SelectField label="Seal type" value={s.lintel.type} options={lintelTypes} onChange={(type) => onChange({ ...s, lintel: { ...s.lintel, type } })} />
        {s.lintel.type !== 'No Lintel Seal' && <Fields value={s.lintel.dims} spec={sealSpec} onChange={(dims) => onChange({ ...s, lintel: { ...s.lintel, dims } })} />}
      </section>
      <section className="card">
        <h2>Side seals</h2>
        <SelectField label="Seal type" value={s.side.type} options={sideTypes} onChange={(type) => onChange({ ...s, side: { ...s.side, type } })} />
        {sealSpec.map(([k, label, unit]) => (
          <NumberField key={k} label={label} unit={unit} value={sideDims[k] as number} linked={s.side.dims === undefined}
            onChange={(v) => onChange({ ...s, side: { ...s.side, dims: { ...sideDims, [k]: v } } })}
            onRelink={() => onChange({ ...s, side: { type: s.side.type } })} />
        ))}
        <p className="note">Linked to the lintel seal until changed.</p>
      </section>
      <section className="card">
        <h2>Sill seal</h2>
        <SelectField label="Seal type" value={s.sill.type} options={sillTypes} onChange={(type) => onChange({ ...s, sill: { ...s.sill, type } })} />
        <Fields value={s.sill.dims} spec={s.sill.type === 'Wedge Seal' ? wedgeSpec : sealSpec} onChange={(dims) => onChange({ ...s, sill: { ...s.sill, dims } })} />
      </section>
    </>
  )
}

export function SealsView({ r, types }: { r: SealsResult; types: SealType[] }) {
  const cols: [string, SealResult][] = [['Lintel', r.lintel], ['Side (both)', r.side], ['Sill', r.sill]]
  const rows: [string, string, (s: SealResult) => number, number][] = [
    ['Spring constant k', 'N/mm per mm', (s) => s.k, 4], ['Water pressure at seal', 'N/mm²', (s) => s.pressure, 4],
    ['Seal length', 'm', (s) => s.length, 3], ['Load on seal from water, F', 'N/mm', (s) => s.F, 3],
    ['Deflection load', 'N', (s) => s.deflectionLoad, 1], ['Friction from deflection', 'N', (s) => s.frictionDeflection, 1],
    ['Friction from water pressure', 'N', (s) => s.frictionWater, 1], ['Total friction', 'N', (s) => s.total, 1],
  ]
  return (
    <>
      <div className="stats">
        {cols.map(([name, s]) => <div key={name}><span>{name} friction</span><strong>{f(s.total / 1000, 2)}</strong><small>kN</small></div>)}
      </div>
      <div className="card table-wrap">
        <table className="props">
          <thead><tr><th></th><th>Unit</th>{cols.map(([name], i) => <th key={name}>{name}<small>{types[i]}</small></th>)}</tr></thead>
          <tbody>
            {rows.map(([label, unit, v, dp]) => (
              <tr key={label}>
                <th scope="row">{label}</th><td className="unit-cell">{unit}</td>
                {cols.map(([name, s]) => <td key={name}>{s.active ? f(v(s), dp) : label === 'Total friction' || label.startsWith('Friction') ? '0' : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          A wedge sill seal (and no lintel seal) adds no friction here. The workbook's sill block uses imperial-unit formulas; the port
          uses the same SI formulas as the lintel and side seals.
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Wheel spacing

const roundingLabels = ['None', '1/16 in (1.6 mm)', '1/8 in (3.2 mm)', '1/4 in (6.4 mm)', '1/2 in (12.7 mm)', '1 in (25.4 mm)']

export function WheelSpacingInputs({ value: w, onChange }: { value: WheelSpacingInput; onChange: (w: WheelSpacingInput) => void }) {
  return (
    <section className="card">
      <h2>Wheel spacing</h2>
      <NumberField label="Wheels per side" min={2} max={99} step={1} value={w.n}
        onChange={(n) => Number.isInteger(n) && onChange({ ...w, n, manual: undefined })} />
      <label className="field">
        <span className="field-label">Method</span>
        <span className="field-input">
          <select value={w.method} onChange={(e) => onChange({ ...w, method: e.target.value as WheelMethod, manual: undefined })}>
            {Object.entries(wheelMethods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Round spacings to</span>
        <span className="field-input">
          <select value={w.acc} disabled={w.method === 'manual'} onChange={(e) => onChange({ ...w, acc: Number(e.target.value) })}>
            {roundingSteps.map((s, i) => <option key={s} value={s}>{roundingLabels[i]}</option>)}
          </select>
        </span>
      </label>
      <SelectField label="Seismic (OBE) pressure" value={w.seismic ? 'Included' : 'Not included'} options={['Included', 'Not included']}
        onChange={(v) => onChange({ ...w, seismic: v === 'Included' })} />
    </section>
  )
}

export function WheelSpacingView({ r, manual, onManual }: { r: WheelSpacingResult; manual?: number[]; onManual: (m: number[]) => void }) {
  const n = r.wheels.length
  const node = (k: number) => (k === 0 ? 'Top seal' : k === n + 1 ? 'Sill' : `Wheel ${k}`)
  return (
    <>
      <div className="stats">
        <div><span>Max wheel load</span><strong>{f(r.maxLoad, 2)}</strong><small>kN</small></div>
        <div><span>Max end beam moment</span><strong>{f(r.maxMoment, 2)}</strong><small>kN·m</small></div>
        <div><span>Total load per side</span><strong>{f(r.totalLoad, 2)}</strong><small>kN</small></div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Node</th><th>Head<small>m</small></th><th>Pressure<small>kN/m²</small></th><th>Load per m width<small>kN/m</small></th>
              <th>Wheel load<small>kN</small></th><th>End beam moment<small>kN·m</small></th><th>Spacing below<small>m</small></th>
            </tr>
          </thead>
          <tbody>
            {r.heads.map((h, k) => {
              const w = k >= 1 && k <= n ? r.wheels[k - 1] : undefined
              return (
                <tr key={k} className={w ? undefined : 'edge'}>
                  <th scope="row">{node(k)}</th><td>{f(h)}</td><td>{f(r.pressures[k])}</td>
                  <td>{w ? f(w.loadPerM) : ''}</td><td>{w ? f(w.load, 2) : ''}</td><td>{w ? f(w.moment, 2) : ''}</td>
                  <td>
                    {k > n ? '' : manual && k > 0 ? (
                      <NumInput key={`${n}-${k}`} value={manual[k - 1]} min={0} className="cell-input" label={`Spacing below ${node(k)}`}
                        onChange={(v) => onManual(manual.map((m, i) => (i === k - 1 ? v : m)))} />
                    ) : f(r.spacings[k])}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="note">
          Each side's end beam carries half the seal span and rests on the wheels (same solver as Beam Spacing).
          {manual && ' Manual: enter spacings for wheel 1 to the sill; the top seal spacing takes the remainder.'}
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Wheel design

type WD = WheelDesignInput
const ellSpec: Spec<WD['elliptical']>[] = [
  ['P', 'Design wheel load', 'kN'], ['D', 'Wheel diameter', 'm'], ['Rt', 'Wheel cross-radius', 'm'], ['RT', 'Track cross-radius', 'm', '0 = flat'],
  ['nu', "Poisson's ratio"], ['E', 'Elastic modulus', 'MPa'], ['hardness', 'Min wheel / track hardness', 'BHN'],
  ['c', 'Allowance each side of contact', 'm'], ['bt', 'Tread width', 'm'], ['t', 'Wheel centre thickness', 'm'],
  ['dh', 'Hub OD', 'm'], ['dt', 'Rim ID', 'm'],
]
const lineSpec: Spec<WD['line']>[] = [
  ['P', 'Design wheel load', 'kN'], ['D', 'Wheel diameter', 'm'], ['l', 'Tread width', 'm'], ['Yp', 'Yield strength', 'MPa'],
  ['UTS', 'Ultimate tensile strength', 'MPa'], ['hardness', 'Min wheel / track hardness', 'BHN'], ['FOS', 'Factor of safety'],
  ['fo', 'Corner rounding each side', 'm'],
]
const trackSpec: Spec<WD['track']>[] = [['Es', 'Track elastic modulus', 'MPa'], ['b', 'Track plate width', 'm'], ['d', 'Track plate thickness', 'm']]
const doubleSpec: Spec<WD['double']>[] = [
  ['Wlat', 'Lateral wheel load factor'], ['bh', 'Wheel hub length', 'm'], ['d', 'Axle diameter', 'm'], ['FyS', 'Axle yield strength', 'MPa'],
  ['FyB', 'Support plate yield strength', 'MPa'], ['c', 'Support member thickness', 'm'], ['b', 'Clearance wheel to member', 'm'],
  ['Fbe', 'Allowable wheel bearing stress', 'MPa'], ['y', 'Skin plate face to wheel axis', 'm'],
]
const cantSpec: Spec<WD['cant']>[] = [
  ['Wlat', 'Lateral wheel load factor'], ['d1', 'Axle diameter at wheel', 'm'], ['FyS', 'Axle yield strength', 'MPa'],
  ['FyB', 'Support plate yield strength', 'MPa'], ['c', 'Main support member thickness', 'm'], ['b', 'Clearance wheel to member', 'm'],
  ['Fbe', 'Allowable wheel bearing stress', 'MPa'],
]

export function WheelDesignInputs({ value: w, onChange, gateType, geometry, derived, isIn, onIs }: {
  value: WD; onChange: (w: WD) => void; gateType: GateType; geometry?: WheelGeometry
  derived?: WheelDesignResult['cantInput']; isIn: WheelIsInput; onIs: (v: WheelIsInput) => void
}) {
  const set = <K extends keyof WD>(k: K) => (v: WD[K]) => onChange({ ...w, [k]: v })
  const linked = (k: 'bh' | 'd2' | 'a' | 'Lr' | 'y', label: string, hint: string) => (
    <NumberField label={label} hint={hint} unit="m" min={0} value={w.cant[k] ?? derived?.[k] ?? 0} linked={w.cant[k] === undefined}
      onChange={(v) => set('cant')({ ...w.cant, [k]: v })} onRelink={() => set('cant')({ ...w.cant, [k]: undefined })} />
  )
  return (
    <>
      <section className="card">
        <h2>Wheel contact</h2>
        <SelectField label="Contact type" value={w.contact} options={['Line Contact', 'Elliptical Contact'] as ContactType[]} onChange={set('contact')} />
        {w.contact === 'Line Contact'
          ? <Fields value={w.line} spec={lineSpec} onChange={set('line')} />
          : <Fields value={w.elliptical} spec={ellSpec} onChange={set('elliptical')} />}
      </section>
      <section className="card">
        <h2>Track</h2>
        <SelectField label="Beam under the track" value={w.track.beam} options={rolledSections} onChange={(beam) => set('track')({ ...w.track, beam })} />
        <SelectField label="Concrete grade" value={w.track.concrete} options={concreteGrades} onChange={(concrete) => set('track')({ ...w.track, concrete })} />
        <Fields value={w.track} spec={trackSpec} onChange={set('track')} />
      </section>
      {gateType === 'Fixed Wheel (double support)' && (
        <section className="card">
          <h2>Axle, double support</h2>
          <Fields value={w.double} spec={doubleSpec} onChange={set('double')} />
        </section>
      )}
      {gateType === 'Fixed Wheel (cantilevered)' && (
        <section className="card">
          <h2>Axle, cantilevered</h2>
          <Fields value={w.cant} spec={cantSpec} onChange={set('cant')} />
          {linked('bh', 'Wheel hub length', 'tread width')}
          {linked('d2', 'Axle diameter at R1', 'half the axle diameter')}
          {linked('a', 'Secondary support member thickness', 'top panel stiffener thickness')}
          {linked('Lr', 'Axle support span', `to the first stiffener${geometry ? `; end zone ${f(geometry.endZone)} m` : ''}`)}
          {linked('y', 'Skin plate face to wheel axis', 'from side seal and embedded slot')}
          <NumberField label="Embedded seal plate thickness" hint="same input as on Embedded parts" unit="mm" min={0} value={w.sealPlate} onChange={set('sealPlate')} />
        </section>
      )}
      <details className="card">
        <summary>IS check (the workbook's hidden Wheel Design IS sheet)</summary>
        <Fields value={isIn.line} spec={lineSpec} onChange={(line) => onIs({ ...isIn, line })} />
        <NumberField label="Elastic modulus" unit="MPa" value={isIn.E} onChange={(E) => onIs({ ...isIn, E })} />
        <SelectField label="Beam under the track" value={isIn.track.beam} options={rolledSections} onChange={(beam) => onIs({ ...isIn, track: { ...isIn.track, beam } })} />
        <SelectField label="Concrete grade" value={isIn.track.concrete} options={concreteGrades} onChange={(concrete) => onIs({ ...isIn, track: { ...isIn.track, concrete } })} />
        <Fields value={isIn.track} spec={trackSpec.slice(1) as Spec<WheelIsInput['track']>[]} onChange={(track) => onIs({ ...isIn, track })} />
      </details>
    </>
  )
}

export function WheelDesignView({ r, input, isIn }: { r: WheelDesignResult; input: WD; isIn: WheelIsInput }) {
  const e = r.elliptical, l = r.line, t = r.track, ax = r.axle, c = r.cant
  const eb = ax?.endBeam ?? c?.endBeam
  const is = wheelIs(isIn)
  return (
    <>
      <div className="stats">
        <div><span>Design wheel load</span><strong>{f(r.P, 1)}</strong><small>kN</small></div>
        <div><span>Wheel weight</span><strong>{f(r.wheelWeight * 1000 / 9.81, 1)}</strong><small>kg</small></div>
        <div><span>Axle weight</span><strong>{f(((ax ?? c)?.weight ?? 0) * 1000 / 9.81, 1)}</strong><small>kg</small></div>
      </div>
      {e && (
        <Checks title="Elliptical contact (Skinner, Thomas & Hoersch)" rows={[
          ['Semi-major axis a', 'mm', e.a * 1000], ['Semi-minor axis b', 'mm', e.b * 1000],
          ['k′ (solved)', '', e.kPrime, undefined, 6], ['φ at max subsurface shear', 'rad', e.phi, undefined, 6],
          ['Max pressure at ellipse centre', 'MPa', e.sigmaC, e.sigmaCAllow, 1],
          ['Max shear at surface τ0', 'MPa', e.tau0, e.tauAllow, 1],
          ['Max shear below surface τ1', 'MPa', e.tau1, e.tauAllow, 1],
          ['Required depth of hardness', 'mm', e.Zreq * 1000, undefined, 2],
          ['Max beam end rotation ψ', '°', e.psiDeg, undefined, 4],
          ['Required tread width 2(a + offset + c)', 'm', e.treadReq, input.elliptical.bt],
        ]} note="k′ and φ are solved here; the workbook's macros for them no longer run (named range WDref is #REF!)." />
      )}
      {l && (
        <Checks title="Line contact" rows={[
          ['Net tread width needed', 'm', l.Inw, input.line.l, 4],
          ['Effective tread width', 'm', l.Iw, undefined, 4],
          ['Contact stress', 'MPa', l.fc, l.fpc, 1],
          ['Max shear stress', 'MPa', l.fsm, l.Ssa, 1],
        ]} />
      )}
      <Checks title={`Track: ${input.track.d * 1000} mm plate on ${input.track.beam}, ${input.track.concrete} concrete`} rows={[
        ['Moment of inertia (plate + beam)', 'cm⁴', t.Ina * 1e8, undefined, 1],
        ['Bearing stress in concrete', 'MPa', t.p, t.pAllow, 2],
        ['Bending of track', 'MPa', t.fb, t.fbAllow, 1],
      ]} />
      {ax && (
        <Checks title="Axle, double support" rows={[
          ['Support span Lr', 'm', ax.Lr], ['Moment from lateral load Mo', 'kN·m', ax.Mo, undefined, 2],
          ['Reaction R1', 'kN', ax.R1, undefined, 1], ['Reaction R2', 'kN', ax.R2, undefined, 1],
          ['Max moment in axle', 'kN·m', ax.Mmax, undefined, 2],
          ['Wheel bearing stress', 'MPa', ax.bearing, ax.bearingAllow, 1],
          ['Axle bending stress', 'MPa', ax.fb, ax.fbAllow, 1],
          ['Bearing stress in support plate', 'MPa', ax.fB, ax.fBAllow, 1],
        ]} />
      )}
      {c && (
        <Checks title="Axle, cantilevered" rows={[
          ['Support span Lr', 'm', r.cantInput.Lr], ['Moment from lateral load Mo', 'kN·m', c.Mo, undefined, 2],
          ['Reaction R1 (inner member)', 'kN', c.R1, undefined, 1], ['Reaction R2 (main member)', 'kN', c.R2, undefined, 1],
          ['Max moment in axle', 'kN·m', c.Mmax, undefined, 2],
          ['Wheel bearing stress', 'MPa', c.bearing, c.bearingAllow, 1],
          ['Axle bending stress', 'MPa', c.fb, c.fbAllow, 1],
          ['Shear at R1', 'MPa', c.fv1, c.fv1Allow, 1],
          ['Bearing at R1 (inner member)', 'MPa', c.fB1, c.fBAllow, 1],
          ['Bearing at R2 (main member)', 'MPa', c.fB2, c.fBAllow, 1],
        ]} note="Mo is in kN·m here; the workbook divides it by 1000 a second time, which makes the lateral load negligible." />
      )}
      {eb && (
        <Checks title="End beam between the wheels" rows={[
          ['Max end beam moment (Wheel Spacing)', 'kN·m', eb.M, undefined, 2],
          ['Associated skin plate width', 'm', eb.x1],
          ['Moment of inertia', 'cm⁴', eb.I * 1e8, undefined, 1],
          ['Lateral-torsional buckling Mcr', 'kN·m', eb.Mcr, undefined, 1],
          ['Nominal strength Mn', 'kN·m', eb.Mn, undefined, 1],
          ['Bending stress at skin plate', 'MPa', eb.fb1, eb.fb1Allow, 1],
          ['Bending stress at back', 'MPa', eb.fb2, eb.fb2Allow, 1],
        ]} />
      )}
      <Checks title="IS check (hidden sheet)" rows={[
        ['Net tread width needed', 'm', is.line.Inw, isIn.line.l, 4],
        ['Contact stress', 'MPa', is.line.fc, is.line.fpc, 1],
        ['Max shear stress', 'MPa', is.line.fsm, is.line.Ssa, 1],
        ['Bearing stress in concrete', 'MPa', is.track.p, is.track.pAllow, 2],
      ]} note="Stand-alone inputs, as in the workbook (not linked to the design above)." />
    </>
  )
}
