import { useEffect, useRef, useState, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { toDxf } from '../drawing/dxf'
import { sheetSizes, standardScales, type DrawingSettings, type PLayer, type Prim, type Sheet, type SheetSize } from '../drawing/sheet'

const groups: [string, PLayer[]][] = [
  ['Visible outlines', ['OUTLINE', 'THIN']], ['Hidden lines', ['HIDDEN']], ['Centre lines', ['CENTER']], ['Sections and hatching', ['CUT', 'HATCH']],
  ['Dimensions', ['DIM']], ['Notes and text', ['TEXT']], ['Border and title block', ['BORDER']],
]
// paper mm; drawings are always black on white paper, whatever the page theme
const pen: Record<PLayer, { w: number; dash?: string; color?: string }> = {
  OUTLINE: { w: 0.5 }, CUT: { w: 0.5 }, HATCH: { w: 0.13, color: '#444' }, HIDDEN: { w: 0.3, dash: '3 1.5' }, CENTER: { w: 0.18, dash: '12 1.5 2 1.5' },
  THIN: { w: 0.25, color: '#555' }, DIM: { w: 0.18 }, TEXT: { w: 0.25 }, BORDER: { w: 0.5 },
}

export function DrawingInputs({ value, onChange, details }: { value: DrawingSettings; onChange: (v: DrawingSettings) => void; details: number }) {
  const set = <K extends keyof DrawingSettings>(k: K) => (v: DrawingSettings[K]) => onChange({ ...value, [k]: v })
  return (
    <section className="card">
      <h2>Drawing sheet</h2>
      <label className="field">
        <span className="field-label">Sheet</span>
        <span className="field-input">
          <select value={value.sheet} onChange={(e) => set('sheet')(e.target.value as DrawingSettings['sheet'])}>
            <option value="ga">General arrangement</option>
            <option value="details">Details ({details})</option>
          </select>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Sheet size<small>ISO 216, landscape</small></span>
        <span className="field-input">
          <select value={value.size} onChange={(e) => set('size')(e.target.value as SheetSize)}>
            {Object.entries(sheetSizes).map(([k, [w, h]]) => <option key={k} value={k}>{k} ({w} × {h} mm)</option>)}
          </select>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Scale<small>{value.sheet === 'details' ? 'each detail picks its own' : 'auto = largest that fits'}</small></span>
        <span className="field-input">
          <select value={value.scale} disabled={value.sheet === 'details'} onChange={(e) => set('scale')(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
            <option value="auto">Auto</option>
            {standardScales.map((s) => <option key={s} value={s}>1:{s}</option>)}
          </select>
        </span>
      </label>
      <h2 style={{ marginTop: 14 }}>Layers shown</h2>
      {groups.map(([name, ls]) => (
        <label key={name} className="field check">
          <span className="field-label">{name}</span>
          <input type="checkbox" checked={!ls.some((l) => value.hidden.includes(l))}
            onChange={(e) => set('hidden')(e.target.checked ? value.hidden.filter((l) => !ls.includes(l)) : [...value.hidden, ...ls])} />
        </label>
      ))}
      <p className="note">Layers are on screen only: the DXF always has every layer.</p>
    </section>
  )
}

const download = (name: string, type: string, data: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Paper primitives as SVG, y flipped; consecutive same-pen paths are merged into one element. */
function render(sheet: Sheet, hidden: PLayer[]) {
  const H = sheet.h, f = (n: number) => +n.toFixed(3)
  const out: ReactElement[] = []
  let run: { key: string; d: string[]; p: Prim } | undefined
  const flush = () => {
    if (!run) return
    const pn = pen[run.p.layer], fill = 'fill' in run.p && run.p.fill
    out.push(<path key={out.length} d={run.d.join('')} fill={fill === 'black' ? '#000' : fill === 'white' ? '#fff' : 'none'}
      stroke={pn.color ?? '#000'} strokeWidth={pn.w} strokeDasharray={pn.dash} strokeLinejoin="round" />)
    run = undefined
  }
  for (const p of sheet.prims) {
    if (hidden.includes(p.layer)) continue
    if (p.k === 'text') {
      flush()
      const x = f(p.p[0]), y = f(H - p.p[1])
      out.push(<text key={out.length} x={x} y={y} fontSize={f(p.h / 0.72)} textAnchor={p.anchor} transform={p.rot ? `rotate(${-p.rot} ${x} ${y})` : undefined}>
        {p.s.replace(/%%c/g, 'Ø')}</text>)
      continue
    }
    const d = p.k === 'circle'
      ? `M${f(p.c[0] - p.r)} ${f(H - p.c[1])}a${f(p.r)} ${f(p.r)} 0 1 0 ${f(2 * p.r)} 0a${f(p.r)} ${f(p.r)} 0 1 0 ${f(-2 * p.r)} 0`
      : p.pts.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(H - q[1])}`).join('') + (p.closed ? 'Z' : '')
    const key = `${p.layer}|${p.fill ?? ''}`
    // white-filled shapes hide what is under them, so each keeps its own element to stay in drawing order
    if (run && run.key === key && !p.fill) run.d.push(d)
    else { flush(); run = { key, d: [d], p } }
  }
  flush()
  return out
}

export function DrawingView({ sheet, hidden, name }: { sheet: Sheet; hidden: PLayer[]; name: string }) {
  const full: [number, number, number, number] = [0, 0, sheet.w, sheet.h]
  const [vb, setVb] = useState(full)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<[number, number] | undefined>(undefined)

  const toUser = (cx: number, cy: number): [number, number] => {
    const m = svg.current!.getScreenCTM()!.inverse()
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f]
  }
  const zoom = (k: number, at?: [number, number]) => setVb((v) => {
    const w = Math.min(Math.max(v[2] * k, sheet.w / 60), sheet.w * 2), r = w / v[2]
    const [px, py] = at ?? [v[0] + v[2] / 2, v[1] + v[3] / 2]
    return [px - (px - v[0]) * r, py - (py - v[1]) * r, w, v[3] * r]
  })
  useEffect(() => { // non-passive wheel listener, so the page does not scroll while zooming
    const el = svg.current!
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, toUser(e.clientX, e.clientY)) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const exportSvg = () => {
    const el = svg.current!.cloneNode(true) as SVGSVGElement
    el.setAttribute('viewBox', `0 0 ${sheet.w} ${sheet.h}`)
    el.setAttribute('width', `${sheet.w}mm`)
    el.setAttribute('height', `${sheet.h}mm`)
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    download(`${name}.svg`, 'image/svg+xml', new XMLSerializer().serializeToString(el))
  }
  const print = () => { flushSync(() => setVb(full)); window.print() }

  return (
    <section className="card drawing">
      <style>{`@page { size: ${sheet.w}mm ${sheet.h}mm; margin: 0 }`}</style>
      <div className="toolbar no-print">
        <button onClick={() => zoom(1 / 1.5)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1.5)} aria-label="Zoom out">−</button>
        <button onClick={() => setVb(full)}>Fit sheet</button>
        <span className="hint">Scroll to zoom, drag to pan · {sheet.scaleLabel === 'AS SHOWN' ? 'scales as shown' : `scale ${sheet.scaleLabel}`}</span>
        <span className="spacer" />
        <button onClick={() => download(`${name}.dxf`, 'application/dxf', toDxf(sheet))}
          title={`AutoCAD R12 DXF; mm, full size at 1:${sheet.scale}`}>Download DXF</button>
        <button onClick={exportSvg}>Download SVG</button>
        <button onClick={print} title="Opens the print dialog at the sheet size; choose Save as PDF">Print / PDF</button>
      </div>
      {sheet.warnings.map((w) => <p key={w} className="alert no-print">{w}</p>)}
      <div className="viewport">
        <svg ref={svg} className="sheet-svg" viewBox={vb.join(' ')} fontFamily="Arial, Helvetica, sans-serif"
          style={{ ['--sheet-w' as string]: `${sheet.w}mm`, ['--sheet-h' as string]: `${sheet.h}mm` }}
          onPointerDown={(e) => { drag.current = toUser(e.clientX, e.clientY); e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerMove={(e) => {
            if (!drag.current) return
            const [px, py] = drag.current, [qx, qy] = toUser(e.clientX, e.clientY)
            setVb((v) => [v[0] + px - qx, v[1] + py - qy, v[2], v[3]])
          }}
          onPointerUp={() => { drag.current = undefined }}>
          <rect width={sheet.w} height={sheet.h} fill="#fff" />
          {render(sheet, hidden)}
        </svg>
      </div>
    </section>
  )
}
