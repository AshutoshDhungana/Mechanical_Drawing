import type { BeamSpacingResult } from '../calc/beamSpacing'
import { BeamDiagram } from './BeamDiagram'
import { f } from './format'

export function BeamSpacingView({ r, manual, onManual }: {
  r: BeamSpacingResult
  manual?: number[]
  onManual: (m: number[]) => void
}) {
  const n = r.beams.length
  const node = (k: number) => (k === 0 ? 'Top seal' : k === n + 1 ? 'Sill' : `Beam ${k}`)
  return (
    <>
      <div className="stats">
        <div><span>Total load</span><strong>{f(r.totalLoad, 2)}</strong><small>kN/m</small></div>
        <div><span>Max beam load</span><strong>{f(r.maxLoad, 2)}</strong><small>kN/m</small></div>
        <div><span>Max spacing</span><strong>{f(r.maxSpacing)}</strong><small>m</small></div>
      </div>
      <div className="card">
        <BeamDiagram r={r} />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Node</th><th>Head<small>m</small></th><th>Pressure<small>kN/m²</small></th>
              <th>Beam load<small>kN/m</small></th><th>Skin plate moment<small>kN·m/m</small></th>
              <th>Effective width<small>m</small></th><th>Spacing below<small>m</small></th><th>Width factor</th>
            </tr>
          </thead>
          <tbody>
            {r.heads.map((h, k) => {
              const b = k >= 1 && k <= n ? r.beams[k - 1] : undefined
              const hasSpan = k <= n
              return (
                <tr key={k} className={b ? undefined : 'edge'}>
                  <th scope="row">{node(k)}</th>
                  <td>{f(h)}</td>
                  <td>{f(r.pressures[k])}</td>
                  <td>{b ? f(b.load) : ''}</td>
                  <td>{b ? f(b.moment) : ''}</td>
                  <td>{b ? f(b.effectiveWidth) : ''}</td>
                  <td>
                    {!hasSpan ? '' : manual && k > 0 ? (
                      <input key={`${n}-${k}`} type="number" step="any" min={0} className="cell-input" aria-label={`Spacing below ${node(k)}`}
                        defaultValue={+manual[k - 1].toFixed(6)}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (e.target.value !== '' && v >= 0) onManual(manual.map((m, i) => (i === k - 1 ? v : m)))
                        }} />
                    ) : f(r.spacings[k])}
                  </td>
                  <td>{hasSpan ? f(r.widthFactors[k]) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {manual && <p className="note">Manual: enter spacings for beam 1 to the sill; the top seal spacing takes the remainder of the gate height.</p>}
      </div>
    </>
  )
}
