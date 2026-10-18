import type { ReactNode } from 'react'
import type { BeamSpacingResult } from '../calc/beamSpacing'
import { rolledSections, type BeamDef, type BeamSection } from '../calc/defineBeam'
import type { StiffenerInput } from '../calc/stiffeners'
import type { StructureResult } from '../calc/structure'
import { NumInput } from './NumberField'
import { f, ratioClass } from './format'

const panelName = (k: number, n: number) => (k === 0 ? 'Top seal – beam 1' : k === n ? `Beam ${n} – sill` : `Beam ${k} – beam ${k + 1}`)
const Ratio = ({ r }: { r: number }) => <td className={`ratio ${ratioClass(r)}`}>{f(r, 3)}</td>

// ---------------------------------------------------------------- Beams & stiffeners

const DIMS: [keyof BeamSection, string][] = [['bfb', 'Back flange width'], ['tfb', 'Back flange t'], ['tw', 'Web t'], ['dw', 'Web depth'], ['bff', 'Front flange width'], ['tff', 'Front flange t']]

export function BeamsView({ bs, r, beams, onBeam, skin, onSkin, stiffeners, onStiffener }: {
  bs: BeamSpacingResult
  r: StructureResult
  beams: BeamDef[] // already filled to n
  onBeam: (i: number, d: BeamDef) => void
  skin: number[]
  onSkin: (k: number, t: number) => void
  stiffeners: StiffenerInput[]
  onStiffener: (k: number, s: StiffenerInput) => void
}) {
  const n = bs.beams.length
  const st = r.stiff
  const own = (k: number, key: keyof StiffenerInput) => stiffeners[k]?.[key] !== undefined
  const stiffCell = (k: number, key: keyof StiffenerInput, scale = 1, step?: number) => (
    <td className={k > 0 && own(k, key) ? 'own' : undefined}>
      <NumInput key={`${k}-${key}-${n}`} value={st[k][key]} scale={scale} min={key === 'offset' || key === 'count' ? 0 : 1e-6} step={step}
        className="cell-input" label={`${key} ${panelName(k, n)}`}
        onChange={(v) => onStiffener(k, { ...stiffeners[k], [key]: key === 'count' ? Math.round(v) : v })} />
    </td>
  )
  const sug = r.suggested[0]
  return (
    <>
      <div className="card table-wrap">
        <h2>Horizontal beams</h2>
        <table>
          <thead>
            <tr><th>Beam</th><th>Type</th><th>Section</th>{DIMS.map(([k, l]) => <th key={k}>{l}<small>mm</small></th>)}</tr>
          </thead>
          <tbody>
            {beams.map((d, j) => (
              <tr key={j}>
                <th scope="row">{j + 1}</th>
                <td>
                  <select className="cell-select" value={d.type} aria-label={`Beam ${j + 1} type`}
                    onChange={(e) => onBeam(j, e.target.value === 'Fabricated Shape'
                      ? { type: 'Fabricated Shape', ...r.sections[j] } : { type: 'I Shape', designation: 'ISMB 350' })}>
                    <option>I Shape</option><option>Fabricated Shape</option>
                  </select>
                </td>
                <td>
                  {d.type === 'I Shape' ? (
                    <select className="cell-select" value={d.designation} aria-label={`Beam ${j + 1} section`}
                      onChange={(e) => onBeam(j, { type: 'I Shape', designation: e.target.value })}>
                      {rolledSections.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  ) : 'Fabricated'}
                </td>
                {DIMS.map(([k]) => (
                  <td key={k}>
                    {d.type === 'Fabricated Shape'
                      ? <NumInput key={`${j}-${k}`} value={d[k]} scale={1000} min={1e-6} className="cell-input" label={`Beam ${j + 1} ${k}`}
                          onChange={(v) => onBeam(j, { ...d, [k]: v })} />
                      : f(r.sections[j][k] * 1000, 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">Rows after the first follow the beam above until changed, as in the workbook.</p>
      </div>

      <div className="card table-wrap">
        <h2>Skin plate and vertical stiffeners, per panel</h2>
        <table>
          <thead>
            <tr>
              <th>Panel</th><th>Height<small>m</small></th><th>Skin plate t<small>mm</small></th>
              <th>Stiffener spacing<small>m</small></th><th>Offset from centre<small>m</small></th><th>Depth<small>mm</small></th>
              <th>Thickness<small>mm</small></th><th>Count</th>
              <th>Bending<small>MPa</small></th><th>Shear<small>MPa</small></th><th>Compression<small>MPa</small></th><th>Combined<small>MPa</small></th>
            </tr>
          </thead>
          <tbody>
            {st.map((_, k) => {
              const s = r.stiffStress[k]
              return (
                <tr key={k}>
                  <th scope="row">{panelName(k, n)}</th>
                  <td>{f(bs.spacings[k])}</td>
                  <td className={k > 0 && skin[k] !== undefined ? 'own' : undefined}>
                    <NumInput key={`t${k}-${n}`} value={r.t[k]} scale={1000} min={1e-6} className="cell-input" label={`Skin plate thickness ${panelName(k, n)}`}
                      onChange={(v) => onSkin(k, v)} />
                  </td>
                  {stiffCell(k, 'spacing')}
                  {stiffCell(k, 'offset')}
                  {stiffCell(k, 'depth', 1000)}
                  {stiffCell(k, 'thickness', 1000)}
                  {stiffCell(k, 'count', 1, 1)}
                  <td>{f(s.bending, 2)}</td><td>{f(s.shear, 2)}</td><td>{f(s.compression, 2)}</td><td>{f(s.combined, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="note">
          Each panel follows the one above until changed (highlighted cells are set on that panel).
          Suggested for the top panel: spacing {f(sug.spacing)} m for {st[0].count} stiffeners, {f(sug.count, 0)} stiffeners
          at {f(st[0].spacing)} m, thickness {f(sug.thickness * 1000, 1)} mm, depth {f(sug.depth * 1000, 1)} mm.
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Section & strength

type Row = [label: string, unit: string, value: (j: number) => number | string | undefined, dp?: number, check?: (j: number) => number]

export function SectionView({ r }: { r: StructureResult }) {
  const c = r.composites, s = r.strengths, a = r.analyses
  const governing = (j: number) => {
    const fs = s[j]
    return (['Mn1', 'Mn2', 'Mn3', 'Mn4'] as const).reduce((g, k) => (fs[k] < fs[g] ? k : g), 'Mn1' as 'Mn1' | 'Mn2' | 'Mn3' | 'Mn4')
  }
  const states = { Mn1: 'CFY', Mn2: 'LTB', Mn3: 'FLB', Mn4: 'TFY' }
  const groups: [string, Row[]][] = [
    ['Composite section (beam + effective skin plate)', [
      ['Effective skin plate width', 'mm', (j) => c[j].sk * 1000, 1],
      ['Average skin plate thickness', 'mm', (j) => c[j].ts * 1000, 1],
      ['Area', 'cm²', (j) => c[j].A * 1e4, 2],
      ['Ix', 'cm⁴', (j) => c[j].Ix * 1e8, 0],
      ['Section modulus, skin face', 'cm³', (j) => c[j].sSkin * 1e6, 1],
      ['Section modulus, back flange', 'cm³', (j) => c[j].sBack * 1e6, 1],
      ['Plastic modulus Zx', 'cm³', (j) => c[j].Zx * 1e6, 1],
    ]],
    ['Nominal flexural strength (AISC 360 F4/F5)', [
      ['Unbraced length Lb', 'm', (j) => Math.min(r.stiff[j].spacing, r.stiff[j + 1].spacing)],
      ['Compression flange yielding (CFY)', 'kN·m', (j) => s[j].Mn1, 1],
      ['Lateral-torsional buckling (LTB)', 'kN·m', (j) => s[j].Mn2, 1],
      ['Flange local buckling (FLB)', 'kN·m', (j) => s[j].Mn3, 1],
      ['Tension flange yielding (TFY)', 'kN·m', (j) => s[j].Mn4, 1],
      ['Mn', 'kN·m', (j) => s[j].Mn, 1],
      ['Governs', '', (j) => states[governing(j)]],
    ]],
    ['Beam analysis', [
      ['Beam load q', 'kN/m', (j) => a[j].q, 2],
      ['Moment at mid-span', 'kN·m', (j) => a[j].MB, 2],
      ['Stress at skin plate / allowable', 'MPa', (j) => `${f(a[j].fb1, 1)} / ${f(a[j].fb1Allow, 1)}`, 0, (j) => a[j].fb1 / a[j].fb1Allow],
      ['Stress at back flange / allowable', 'MPa', (j) => `${f(a[j].fb2, 1)} / ${f(a[j].fb2Allow, 1)}`, 0, (j) => a[j].fb2 / a[j].fb2Allow],
      ['Shear at support / allowable', 'MPa', (j) => `${f(a[j].fv, 1)} / ${f(a[j].fvAllow, 1)}`, 0, (j) => a[j].fv / a[j].fvAllow],
      ['Deflection', 'mm', (j) => a[j].deflection * 1000, 2],
      ['Span / deflection (min 800)', '', (j) => a[j].spanRatio, 0, (j) => a[j].spanRatioMin / a[j].spanRatio],
      ['End rotation', '°', (j) => a[j].rotationDeg, 3],
      ['Taper: peak stress at', 'm from support', (j) => a[j].taperX],
      ['Taper: stress at skin / back flange', 'MPa', (j) => `${f(a[j].taper.fbt1, 1)} / ${f(a[j].taper.fbt2, 1)}`],
      ['Weld, skin plate to flange', 'mm', (j) => a[j].weldSkin * 1000, 1],
      ['Weld, flange to web (fabricated)', 'mm', (j) => (a[j].weldFlangeWeb === undefined ? '—' : a[j].weldFlangeWeb! * 1000), 1],
      ['Weld, web to back flange (fabricated)', 'mm', (j) => (a[j].weldWebBack === undefined ? '—' : a[j].weldWebBack! * 1000), 1],
    ]],
  ]
  return (
    <div className="card table-wrap">
      <table className="props">
        <thead><tr><th></th><th>Unit</th>{a.map((_, j) => <th key={j}>Beam {j + 1}</th>)}</tr></thead>
        {groups.map(([title, rows]) => (
          <tbody key={title}>
            <tr className="group"><th colSpan={2 + a.length}>{title}</th></tr>
            {rows.map(([label, unit, v, dp = 3, check]) => (
              <tr key={label}>
                <th scope="row">{label}</th><td className="unit-cell">{unit}</td>
                {a.map((_, j) => {
                  const x = v(j)
                  const cls = check ? `ratio ${ratioClass(check(j))}` : undefined
                  return <td key={j} className={cls}>{typeof x === 'number' ? f(x, dp) : x}</td>
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Stress checks

export function StressView({ bs, r }: { bs: BeamSpacingResult; r: StructureResult }) {
  const n = bs.beams.length
  return (
    <>
      {r.checks.map((pts, k) => {
        const p = r.panels[k]
        return (
          <div className="card table-wrap" key={k}>
            <h2>
              {panelName(k, n)} · height {f(bs.spacings[k])} m · b/a {f(p.ratio, 3)} ·{' '}
              {p.plateTheory ? 'flat plate theory' : 'beam theory (b/a above critical)'}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Point</th><th>Beam moment<small>kN·m</small></th><th>Beam stress<small>MPa</small></th><th>Allowable<small>MPa</small></th>
                  <th>Plate moment<small>kN·m/m</small></th><th>Plate stress<small>MPa</small></th><th>Allowable<small>MPa</small></th>
                  <th>Combined<small>MPa</small></th><th>Allowable<small>MPa</small></th><th>Ratio</th>
                </tr>
              </thead>
              <tbody>
                {pts.map((c) => (
                  <tr key={c.point}>
                    <th scope="row">{c.point}</th>
                    <td>{f(c.beamMoment, 2)}</td><td>{f(c.beamStress, 2)}</td><td>{f(c.beamAllow, 2)}</td>
                    <td>{f(c.plateMoment, 4)}</td><td>{f(c.plateStress, 2)}</td><td>{f(c.plateAllow, 2)}</td>
                    <td>{c.combined === undefined ? 'sum of ratios' : f(c.combined, 2)}</td><td>{f(c.combinedAllow, 2)}</td>
                    <Ratio r={c.ratio} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
      <PointKey />
    </>
  )
}

function PointKey(): ReactNode {
  return (
    <p className="note">
      Points: ① centre of the panel between stiffeners (beam and plate ratios added); ② mid-height of the panel;
      ③/⑤ skin plate at the edge of the beam flange; ④ at the lower beam; ⑥ at the upper beam.
      Combined stress uses the workbook's von Mises form with Poisson's ratio 0.3.
    </p>
  )
}
