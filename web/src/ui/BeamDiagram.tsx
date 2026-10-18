import type { BeamSpacingResult } from '../calc/beamSpacing'

const f = (x: number, dp = 3) => x.toFixed(dp)

/**
 * Section through the gate: skin plate with the horizontal beams at true vertical scale, and the
 * water pressure diagram on the upstream side (horizontal scale is the pressure, not length).
 */
export function BeamDiagram({ r }: { r: BeamSpacingResult }) {
  const D = r.spacings.reduce((a, b) => a + b)
  const n = r.beams.length
  const H = 520, top = 30, plateX = 300
  const s = (H - 2 * top) / D // px per metre (vertical)
  const pMax = Math.max(...r.pressures)
  const pw = 200 / pMax // px per kN/m2
  const y: number[] = [top]
  r.spacings.forEach((l, k) => y.push(y[k] + l * s)) // node k: 0 = seal ... n+1 = sill
  const pressurePts = [`${plateX},${y[0]}`, ...y.map((yy, k) => `${plateX - r.pressures[k] * pw},${yy}`), `${plateX},${y[n + 1]}`].join(' ')

  return (
    <svg viewBox={`0 0 560 ${H}`} className="diagram" role="img" aria-label="Beam layout and water pressure on the gate">
      <defs>
        <marker id="tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M1,9 L9,1" stroke="currentColor" strokeWidth="1.5" />
        </marker>
      </defs>
      {/* pressure diagram */}
      <polygon points={pressurePts} className="pressure" />
      {r.pressures.map((p, k) => (
        <text key={k} x={plateX - p * pw - 6} y={y[k] + 4} className="lbl" textAnchor="end">
          {f(p, 1)}
        </text>
      ))}
      <text x={plateX - 10} y={y[0] - 14} className="lbl" textAnchor="end">water pressure (upstream), kN/m²</text>

      {/* skin plate, top seal, sill */}
      <line x1={plateX} y1={y[0]} x2={plateX} y2={y[n + 1]} className="plate" />
      <text x={plateX + 8} y={y[0] - 4} className="lbl">top seal</text>
      <line x1={plateX - 20} y1={y[n + 1]} x2={plateX + 120} y2={y[n + 1]} className="sill" />
      <text x={plateX + 8} y={y[n + 1] + 14} className="lbl">sill</text>

      {/* beams: web + flange, drawn downstream of the plate */}
      {r.beams.map((b, j) => (
        <g key={j}>
          <line x1={plateX} y1={y[j + 1]} x2={plateX + 60} y2={y[j + 1]} className="beam" />
          <line x1={plateX + 60} y1={y[j + 1] - 9} x2={plateX + 60} y2={y[j + 1] + 9} className="beam" />
          <text x={plateX + 68} y={y[j + 1] + 4} className="lbl">
            B{j + 1} · {f(b.load, 1)} kN/m
          </text>
        </g>
      ))}

      {/* spacing dimensions */}
      {r.spacings.map((l, k) => {
        const x = plateX + 200
        return (
          <g key={k}>
            <line x1={x} y1={y[k]} x2={x} y2={y[k + 1]} className="dim" markerStart="url(#tick)" markerEnd="url(#tick)" />
            <text x={x + 6} y={(y[k] + y[k + 1]) / 2 + 4} className="lbl">{f(l)}</text>
          </g>
        )
      })}
      <text x={plateX + 200} y={H - 6} className="lbl" textAnchor="middle">spacing, m</text>
    </svg>
  )
}
