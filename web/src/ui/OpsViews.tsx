import { bottomAngles, lipRatios, type DownpullInput, type DownpullPoint, type DownpullResult, type GateLocation } from '../calc/downpull'
import type { OperationInput, OperationPoint, OperationResult } from '../calc/operation'
import type { WeightResult } from '../calc/weight'
import { NumberField, SelectField } from './NumberField'
import { f } from './format'

// ---------------------------------------------------------------- Downpull

export function DownpullInputs({ value: d, onChange }: { value: DownpullInput; onChange: (d: DownpullInput) => void }) {
  const set = <K extends keyof DownpullInput>(k: K) => (v: DownpullInput[K]) => onChange({ ...d, [k]: v })
  return (
    <section className="card">
      <h2>Downpull</h2>
      <SelectField label="Gate location" value={d.location} options={['Tunnel', 'Face'] as GateLocation[]} onChange={set('location')} />
      <SelectField label="Gate bottom angle θ" value={String(d.theta)} options={bottomAngles.map(String)} onChange={(v) => set('theta')(Number(v))} hint="degrees" />
      {d.theta === 0 && (
        <SelectField label="Bottom lip ratio e/d" value={String(d.lip)} options={lipRatios.map(String)} onChange={(v) => set('lip')(Number(v))} />
      )}
      {d.location === 'Tunnel' && <NumberField label="Clearance upstream of gate a1" unit="m" min={1e-6} value={d.a1} onChange={set('a1')} />}
      <NumberField label='Recess depth a″2' unit="m" min={0} value={d.a2pp} onChange={set('a2pp')} />
      <NumberField label="Maximum total flow Q" unit="m³/s" min={0} value={d.Q} onChange={set('Q')} />
      <NumberField label="Gate opening ratio to show" min={0.001} max={1} value={d.x} onChange={set('x')} />
    </section>
  )
}

const dpRows: [string, string, (p: DownpullPoint) => number, number][] = [
  ['Gate opening y', 'm', (p) => p.y, 3], ['Contraction coefficient Cc', '', (p) => p.Cc, 4], ['Downpull coefficient κB', '', (p) => p.kB, 4],
  ['Downstream head h', 'm', (p) => p.h, 4], ['Jet velocity Vj', 'm/s', (p) => p.Vj, 3], ["Discharge under the gate Q′", 'm³/s', (p) => p.Qp, 3],
  ['Discharge over the gate Q″', 'm³/s', (p) => p.Qpp, 3], ['Total flow Q', 'm³/s', (p) => p.Qtot, 3], ['Coefficient κT', '', (p) => p.kT, 4],
  ['Head in gate well hT', 'm', (p) => p.hT, 3],
  ['F1 top vs bottom surface', 'kN', (p) => p.F1, 2], ['F2 extended skin plate', 'kN', (p) => p.F2, 2], ['F3 lintel seal protrusion', 'kN', (p) => p.F3, 2],
  ['Total downpull F', 'kN', (p) => p.F, 2],
]

export function DownpullView({ r }: { r: DownpullResult }) {
  const cols: [string, DownpullPoint][] = [[`x = ${f(r.at.x, 2)}`, r.at], [`Min, x = ${f(r.min.x, 2)}`, r.min], [`Max, x = ${f(r.max.x, 2)}`, r.max]]
  const peak = Math.max(...r.sweep.map((p) => p.F), 1e-9)
  return (
    <>
      <div className="stats">
        <div><span>Max downpull</span><strong>{f(r.max.F, 1)}</strong><small>kN at x = {f(r.max.x, 2)}</small></div>
        <div><span>Tunnel height yo</span><strong>{f(r.yo, 3)}</strong><small>m</small></div>
        <div><span>Flow coefficient C2</span><strong>{f(r.C2, 3)}</strong></div>
      </div>
      <div className="card table-wrap">
        <table className="props">
          <thead><tr><th></th><th>Unit</th>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {dpRows.map(([label, unit, v, dp]) => (
              <tr key={label}><th scope="row">{label}</th><td className="unit-cell">{unit}</td>{cols.map(([h, p]) => <td key={h}>{f(v(p), dp)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Downpull against opening ratio</h2>
        <svg viewBox="0 0 560 180" className="diagram" role="img" aria-label="Downpull force against gate opening ratio">
          <line className="dim" x1="40" y1="150" x2="550" y2="150" />
          <line className="dim" x1="40" y1="10" x2="40" y2="150" />
          <polyline fill="none" stroke="var(--accent)" strokeWidth="2"
            points={r.sweep.map((p) => `${40 + p.x * 510},${150 - Math.max(p.F, 0) / peak * 135}`).join(' ')} />
          <text className="lbl" x="40" y="168">0</text><text className="lbl" x="530" y="168">x = 1</text>
          <text className="lbl" x="44" y="20">{f(peak, 1)} kN</text>
        </svg>
        <p className="note">
          Per Naudascher, for a downstream lintel seal and skin plate with fully ventilated flow. Critical depth {f(r.yc, 3)} m;
          largest downstream head that passes Q {f(r.hmax, 3)} m.
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Weight & cg

export function WeightView({ r }: { r: WeightResult }) {
  const dim = (x?: number) => (x === undefined ? '' : f(x, 4))
  return (
    <>
      <div className="stats">
        <div><span>Gate weight in air</span><strong>{f(r.mass, 0)}</strong><small>kg</small></div>
        <div><span>Centre of gravity</span><strong>{f(r.cg * 1000, 1)}</strong><small>mm from skin plate face</small></div>
        <div><span>Erbisti estimate</span><strong>{f(r.erbisti, 0)}</strong><small>kg ({r.diffPct >= 0 ? '+' : ''}{f(r.diffPct, 1)}%)</small></div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th><th>Number</th><th>Width<small>m</small></th><th>Height<small>m</small></th><th>Depth<small>m</small></th>
              <th>Diam.<small>m</small></th><th>Volume<small>m³</small></th><th>Weight<small>kg</small></th><th>CG zbar<small>m</small></th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((i, k) => {
              const head = (k === 0 || r.items[k - 1].group !== i.group) && i.group !== i.name
              return [
                head && <tr key={`g${k}`} className="group-row"><th colSpan={9}>{i.group}</th></tr>,
                <tr key={k}>
                  <th scope="row">{i.name}</th><td>{i.count}</td><td>{dim(i.width)}</td><td>{dim(i.height)}</td><td>{dim(i.depth)}</td>
                  <td>{dim(i.diameter)}</td><td>{f(i.volume, 5)}</td><td>{f(i.weight, 1)}</td><td>{f(i.z, 4)}</td>
                </tr>,
              ]
            })}
            <tr className="total"><th scope="row">Total</th><td colSpan={5} /><td>{f(r.volume, 4)}</td><td>{f(r.mass, 1)}</td><td>{f(r.cg, 4)}</td></tr>
          </tbody>
        </table>
        <p className="note">
          Estimated from the gate's components; ballast is not included. zbar is measured from the skin plate face (seals are on the
          other side, so negative). The Erbisti estimate is the empirical weight for the clear span, clear height and design head.
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Operation

export function OperationInputs({ value: o, onChange }: { value: OperationInput; onChange: (o: OperationInput) => void }) {
  const set = (k: keyof OperationInput) => (v: number) => onChange({ ...o, [k]: v })
  return (
    <section className="card">
      <h2>Operation</h2>
      <NumberField label="Ballast weight in air" unit="kg" min={0} value={o.ballast} onChange={set('ballast')} />
      <NumberField label="Ballast density" unit="kg/m³" min={1} value={o.ballastDensity} onChange={set('ballastDensity')} />
      <NumberField label="Wheel bearing friction coefficient" hint="0.02 anti-friction bearings (static)" min={0} value={o.bearingMu} onChange={set('bearingMu')} />
    </section>
  )
}

const opRows: [string, (p: OperationPoint) => number][] = [
  ['Weight of gate', (p) => p.weight], ['Wheel bearing friction', (p) => p.bearing], ['Resistance to rolling', (p) => p.rolling],
  ['Lintel seal friction, deflection', (p) => p.lintelDeflection], ['Lintel seal friction, water', (p) => p.lintelWater],
  ['Side seal friction, deflection', (p) => p.sideDeflection], ['Side seal friction, water', (p) => p.sideWater],
  ['Sill seal friction, deflection', (p) => p.sillDeflection], ['Sill seal friction, water', (p) => p.sillWater],
  ['Downpull', (p) => p.downpull], ['Hoist load, lifting', (p) => p.lift], ['Hoist load, lowering', (p) => p.lower],
]

export function OperationView({ r, submerged }: { r: OperationResult; submerged: boolean }) {
  const cols: [string, OperationPoint][] = [
    [`Min lift (${f(r.min.x * 100, 0)}%)`, r.min], [`Max lift (${f(r.max.x * 100, 0)}%)`, r.max],
    ...r.columns.map((p): [string, OperationPoint] => [p.x === 0 ? 'Closed' : p.x === 1 ? 'Open' : `${f(p.x * 100, 0)}%`, p]),
  ]
  const prep = (p: OperationPoint) => (p.preponderance === Infinity ? '200+' : f(p.preponderance, 0))
  return (
    <>
      <div className="stats">
        <div><span>Max hoist load, lifting</span><strong>{f(r.max.lift / 1000, 1)}</strong><small>kN at {f(r.max.x * 100, 0)}% open</small></div>
        <div><span>Min hoist load, lowering</span><strong>{f(r.lowerMin / 1000, 1)}</strong><small>kN{r.lowerMin < 0 ? ', gate will not close under its own weight' : ''}</small></div>
        <div><span>Rolling resistance factor</span><strong>{f(r.rolling * 1000, 2)}</strong><small>mm (DIN 19704)</small></div>
      </div>
      <div className="card table-wrap">
        <table className="props">
          <thead><tr><th>N</th>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {opRows.map(([label, v]) => (
              <tr key={label}><th scope="row">{label === 'Weight of gate' && submerged ? 'Weight of gate, submerged' : label}</th>{cols.map(([h, p]) => <td key={h}>{f(v(p), 0)}</td>)}</tr>
            ))}
            <tr><th scope="row">Preponderance, %</th>{cols.map(([h, p]) => <td key={h} className={`ratio ${p.preponderance < 120 ? 'fail' : 'ok'}`}>{prep(p)}</td>)}</tr>
          </tbody>
        </table>
        <p className="note">
          Preponderance (weight / lowering resistance) is usually required to be at least 120% so the gate closes under its own weight.
          Lintel and sill seals rub only within 10% of closed; downpull applies to a downstream skin plate only. Submerged weight is used for a
          downstream skin plate.
        </p>
      </div>
    </>
  )
}
