// Explanatory sketches: SVG redraws of the workbook's static AutoCAD OLE sketches (Seals, Wheel Design,
// Downpull, Plates, Hoist), with the live values written next to the letters. Not to scale; the scaled
// drawings are a separate layer.
import type { ReactNode } from 'react'
import type { SealDims, SealType } from '../calc/seals'

/** `letter = value unit`, or just the letter when the value is unknown. */
const lbl = (letter: string, v: number | undefined, unit = 'mm', dp = 0) =>
  v === undefined || !Number.isFinite(v) ? letter : `${letter} = ${v.toFixed(dp)}${unit ? ` ${unit}` : ''}`
const mm = (m?: number) => (m === undefined ? undefined : m * 1000)

function Defs() {
  return (
    <defs>
      <marker id="sk-a" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,1.5 L10,5 L0,8.5 z" style={{ fill: 'var(--muted)' }} />
      </marker>
      <marker id="sk-f" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0,1 L10,5 L0,9 z" style={{ fill: 'var(--load)' }} />
      </marker>
      <pattern id="sk-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--muted)' }} strokeWidth="1" />
      </pattern>
      <pattern id="sk-load" width="6" height="6" patternUnits="userSpaceOnUse">
        <line x1="3" y1="0" x2="3" y2="6" style={{ stroke: 'var(--load)' }} strokeWidth="0.8" />
      </pattern>
    </defs>
  )
}

function Sketch({ title, w, h, note, children }: { title: string; w: number; h: number; note?: string; children: ReactNode }) {
  return (
    <figure className="card sketch">
      <h2>{title}</h2>
      <svg viewBox={`0 0 ${w} ${h}`} className="diagram" role="img" aria-label={title}>
        <Defs />
        {children}
      </svg>
      {note && <p className="note">{note}</p>}
    </figure>
  )
}

/**
 * Dimension line with arrows at both ends. Horizontal: label above (side −1) or below (+1).
 * Vertical: label left (−1) or right (+1), horizontal text, or along the line when `rot`.
 * `tx` puts the label of a short horizontal dimension outside it, at that x.
 */
function Dim({ x1, y1, x2, y2, label, side = -1, rot, tx }: { x1: number; y1: number; x2: number; y2: number; label: string; side?: -1 | 1; rot?: boolean; tx?: number }) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  let text: ReactNode
  if (tx !== undefined) text = <text x={tx} y={my + 4} textAnchor={tx > mx ? 'start' : 'end'}>{label}</text>
  else if (y1 === y2) text = <text x={mx} y={my + (side < 0 ? -5 : 14)} textAnchor="middle">{label}</text>
  else if (rot) {
    const x = x1 + (side < 0 ? -5 : 17)
    text = <text x={x} y={my} transform={`rotate(-90 ${x} ${my})`} textAnchor="middle">{label}</text>
  } else text = <text x={x1 + side * 6} y={my + 4} textAnchor={side < 0 ? 'end' : 'start'}>{label}</text>
  return (
    <g className="dim">
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart="url(#sk-a)" markerEnd="url(#sk-a)" />
      {text}
    </g>
  )
}

/** Extension / leader lines. */
const Ext = ({ d }: { d: string }) => <path d={d} className="ext" />
/** Load arrow, tip at (x2, y2). */
const Load = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} className="load" markerEnd="url(#sk-f)" />
const T = ({ x, y, a = 'start', c, children }: { x: number; y: number; a?: 'start' | 'middle' | 'end'; c?: string; children: ReactNode }) =>
  <text x={x} y={y} textAnchor={a} className={c}>{children}</text>

// ---------------------------------------------------------------- Seals (Seals sheet objects)

export function SealSketch({ title, type, d, F, k }: { title: string; type: SealType; d: SealDims; F?: number; k?: number }) {
  if (type === 'No Lintel Seal') return null
  if (type === 'Wedge Seal') {
    return (
      <Sketch title={`${title}: wedge seal`} w={420} h={400}>
        <rect x={130} y={40} width={30} height={290} className="part" />
        <rect x={160} y={100} width={110} height={30} className="part" />
        <rect x={205} y={130} width={35} height={200} className="part" />
        <polygon points="160,136 205,136 205,335 180,350 160,325" className="rubber" />
        <Ext d="M205,130 V64 M240,130 V64 M270,100 H316 M240,330 H316 M160,136 H74 M180,350 H74 M160,325 V386 M205,335 V386" />
        <Dim x1={205} y1={70} x2={240} y2={70} label={lbl('ct', d.ct)} />
        <Dim x1={310} y1={100} x2={310} y2={130} label={lbl('bt', d.tbt)} side={1} />
        <Dim x1={310} y1={130} x2={310} y2={330} label={lbl('cw', d.cw)} side={1} />
        <Dim x1={80} y1={136} x2={80} y2={350} label={lbl('h', d.sh)} />
        <Dim x1={160} y1={380} x2={205} y2={380} label={lbl('t', d.t)} side={1} />
      </Sketch>
    )
  }
  if (type === 'J Seal') {
    return (
      <Sketch title={`${title}: J seal`} w={680} h={300}>
        <rect x={110} y={140} width={140} height={25} className="part" />
        <rect x={110} y={195} width={140} height={45} className="part" />
        <path d="M110,165 H351 A55,55 0 1 1 400,195 H110 Z" className="rubber" />
        <line x1={400} y1={20} x2={400} y2={260} className="center" />
        <line x1={370} y1={98} x2={470} y2={98} className="ext dashed" />
        <Ext d="M110,140 H80 M110,165 H80 M110,195 H80 M400,195 H486 M250,240 H486 M400,85 H596 M486,195 H596 M110,240 V276 M250,240 V276" />
        <Dim x1={85} y1={140} x2={85} y2={165} label={lbl('ct', d.ct)} />
        <Dim x1={85} y1={165} x2={85} y2={195} label={lbl('t', d.t)} />
        <Dim x1={480} y1={195} x2={480} y2={240} label={lbl('mt', d.mt)} side={1} />
        <Dim x1={590} y1={85} x2={590} y2={195} label={lbl('B', d.B)} side={1} />
        <Dim x1={480} y1={85} x2={480} y2={98} label={lbl('δ', d.delta)} side={1} />
        <Dim x1={250} y1={255} x2={400} y2={255} label={lbl('x', d.x)} />
        <Dim x1={110} y1={275} x2={250} y2={275} label={lbl('cw', d.cw)} side={1} />
        <Load x1={400} y1={22} x2={400} y2={83} />
        <T x={408} y={40} c="load-lbl">{lbl('F', F, 'N/mm', 3)}</T>
        <Load x1={400} y1={190} x2={400} y2={102} />
        <T x={462} y={150} c="load-lbl">{lbl('k', k, 'N/mm²', 3)}</T>
        <Load x1={300} y1={85} x2={396} y2={85} />
        <T x={295} y={89} a="end" c="load-lbl">μ(F + k), {lbl('μ', d.mu, '', 2)}</T>
      </Sketch>
    )
  }
  return (
    <Sketch title={`${title}: center bulb seal`} w={620} h={300}>
      <rect x={110} y={145} width={130} height={25} className="part" />
      <rect x={360} y={145} width={130} height={25} className="part" />
      <rect x={110} y={200} width={130} height={40} className="part" />
      <rect x={360} y={200} width={130} height={40} className="part" />
      <path d="M110,170 H265 C265,75 335,75 335,170 H490 V200 H110 Z" className="rubber" />
      <line x1={300} y1={20} x2={300} y2={285} className="center" />
      <line x1={270} y1={112} x2={440} y2={112} className="ext dashed" />
      <Ext d="M110,145 V120 M240,145 V120 M110,145 H80 M110,170 H80 M490,170 H520 M490,200 H520 M490,240 H520 M300,99 H550 M490,200 H550 M240,240 V276" />
      <Dim x1={110} y1={125} x2={240} y2={125} label={lbl('cw', d.cw)} />
      <Dim x1={85} y1={145} x2={85} y2={170} label={lbl('ct', d.ct)} />
      <Dim x1={515} y1={170} x2={515} y2={200} label={lbl('t', d.t)} side={1} />
      <Dim x1={515} y1={200} x2={515} y2={240} label={lbl('mt', d.mt)} side={1} />
      <Dim x1={545} y1={99} x2={545} y2={200} label={lbl('B', d.B)} side={1} />
      <Dim x1={430} y1={99} x2={430} y2={112} label={lbl('δ', d.delta)} side={1} />
      <Dim x1={240} y1={270} x2={300} y2={270} label={lbl('x', d.x)} side={1} />
      <Load x1={300} y1={22} x2={300} y2={97} />
      <T x={308} y={40} c="load-lbl">{lbl('F', F, 'N/mm', 3)}</T>
      <Load x1={300} y1={196} x2={300} y2={116} />
      <T x={308} y={160} c="load-lbl">{lbl('k', k, 'N/mm²', 3)}</T>
      <T x={20} y={290}>{lbl('μ', d.mu, '', 2)}</T>
    </Sketch>
  )
}

// ---------------------------------------------------------------- Wheel Design sheet objects (m in, mm shown)

export function WheelSketch(p: { D?: number; bt?: number; t?: number; dh?: number; dt?: number; d?: number; bh?: number; Rt?: number }) {
  return (
    <Sketch title="Wheel" w={420} h={450}>
      <path d="M110,70 H190 V100 H165 V170 H200 V205 H100 V170 H135 V100 H110 Z M110,430 H190 V400 H165 V330 H200 V295 H100 V330 H135 V400 H110 Z" className="section" />
      <line x1={80} y1={250} x2={230} y2={250} className="center" />
      <Ext d="M100,170 V12 M200,170 V12 M110,70 V32 M190,70 V32 M135,100 V52 M165,100 V52 M200,205 H254 M200,295 H254 M200,170 H294 M200,330 H294 M190,100 H334 M190,400 H334 M190,70 H374 M190,430 H374 M125,72 L60,150" />
      <Dim x1={100} y1={18} x2={200} y2={18} label={lbl('bh', mm(p.bh))} />
      <Dim x1={110} y1={38} x2={190} y2={38} label={lbl('bt', mm(p.bt))} />
      <Dim x1={135} y1={58} x2={165} y2={58} label={lbl('t', mm(p.t))} />
      <Dim x1={250} y1={205} x2={250} y2={295} label={lbl('d', mm(p.d))} rot />
      <Dim x1={290} y1={170} x2={290} y2={330} label={lbl('dh', mm(p.dh))} rot />
      <Dim x1={330} y1={100} x2={330} y2={400} label={lbl('dt', mm(p.dt))} rot />
      <Dim x1={370} y1={70} x2={370} y2={430} label={lbl('D', mm(p.D))} rot />
      <T x={58} y={164} a="end">{lbl('Rt', mm(p.Rt))}</T>
    </Sketch>
  )
}

export function DoubleAxleSketch(p: { Lr: number; b: number; bh: number; c: number; w: number; Mo: number; R1: number; R2: number; z: number }) {
  return (
    <Sketch title="Axle, double support" w={620} h={320}>
      <polygon points="60,180 120,180 120,260" className="react" />
      <polygon points="500,180 560,180 500,260" className="react" />
      <rect x={140} y={130} width={340} height={50} className="udl" />
      <line x1={40} y1={180} x2={580} y2={180} className="axle" />
      <Ext d="M100,25 V180 M520,25 V180 M140,55 V130 M480,55 V130 M120,85 V180 M500,85 V180 M60,180 V305 M120,260 V305 M500,260 V305 M560,180 V305 M300,180 V225" />
      <Dim x1={100} y1={30} x2={520} y2={30} label={lbl('Lr', mm(p.Lr))} />
      <Dim x1={100} y1={60} x2={140} y2={60} label="b + c/3" />
      <Dim x1={480} y1={60} x2={520} y2={60} label="b + c/3" />
      <Dim x1={120} y1={90} x2={140} y2={90} label={lbl('b', mm(p.b))} tx={114} />
      <Dim x1={480} y1={90} x2={500} y2={90} label={lbl('b', mm(p.b))} tx={506} />
      <Dim x1={140} y1={90} x2={480} y2={90} label={lbl('bh', mm(p.bh))} />
      <T x={310} y={124} a="middle" c="load-lbl">{lbl('w', p.w, 'kN/m', 0)}</T>
      <Dim x1={60} y1={300} x2={120} y2={300} label={lbl('c', mm(p.c))} />
      <Dim x1={500} y1={300} x2={560} y2={300} label={lbl('c', mm(p.c))} />
      <Dim x1={60} y1={220} x2={300} y2={220} label={lbl('z', mm(p.z))} side={1} />
      <Load x1={100} y1={258} x2={100} y2={183} />
      <Load x1={520} y1={258} x2={520} y2={183} />
      <T x={92} y={275} a="end" c="load-lbl">{lbl('R1', p.R1, 'kN', 1)}</T>
      <T x={528} y={275} c="load-lbl">{lbl('R2', p.R2, 'kN', 1)}</T>
      <path d="M296,196 A18,18 0 1 1 322,194" className="load" markerEnd="url(#sk-f)" fill="none" />
      <T x={330} y={210} c="load-lbl">{lbl('Mo', p.Mo, 'kN·m', 2)}</T>
    </Sketch>
  )
}

export function CantAxleSketch(p: { Lr: number; a: number; c: number; b: number; bh: number; w: number; Mo: number; R1: number; R2: number }) {
  return (
    <Sketch title="Axle, cantilevered" w={720} h={310}>
      <rect x={50} y={110} width={40} height={140} className="section" />
      <rect x={400} y={110} width={50} height={140} className="section" />
      <rect x={475} y={120} width={215} height={50} className="udl" />
      <line x1={40} y1={170} x2={700} y2={170} className="axle" />
      <Ext d="M70,25 V110 M425,25 V110 M450,55 V110 M475,55 V120 M690,55 V120 M50,250 V300 M90,250 V300 M400,250 V300 M450,250 V300" />
      <Dim x1={70} y1={30} x2={425} y2={30} label={lbl('Lr', mm(p.Lr))} />
      <Dim x1={450} y1={60} x2={475} y2={60} label={lbl('b', mm(p.b))} tx={444} />
      <Dim x1={475} y1={60} x2={690} y2={60} label={lbl('bh', mm(p.bh))} />
      <T x={582} y={112} a="middle" c="load-lbl">{lbl('w', p.w, 'kN/m', 0)}</T>
      <Dim x1={50} y1={295} x2={90} y2={295} label={lbl('a', mm(p.a))} />
      <Dim x1={400} y1={295} x2={450} y2={295} label={lbl('c', mm(p.c))} />
      <Load x1={70} y1={75} x2={70} y2={167} />
      <T x={78} y={90} c="load-lbl">{lbl('R1', p.R1, 'kN', 1)}</T>
      <Load x1={425} y1={265} x2={425} y2={173} />
      <T x={433} y={268} c="load-lbl">{lbl('R2', p.R2, 'kN', 1)}</T>
      <path d="M568,186 A18,18 0 1 1 594,184" className="load" markerEnd="url(#sk-f)" fill="none" />
      <T x={600} y={204} c="load-lbl">{lbl('Mo', p.Mo, 'kN·m', 2)}</T>
    </Sketch>
  )
}

/** End beam section at the wheel: skin plate + one (cantilevered) or two (double support) stiffeners split by the axle hole. */
export function EndBeamSketch(p: { double: boolean; ts: number; Sr?: number; e: number; d: number; f: number; c: number; y: number; dweb: number }) {
  const R = p.double ? 540 : 330
  const stiff = p.double ? [270, 480] : [270]
  return (
    <Sketch title={`End beam section, ${p.double ? 'double support' : 'cantilevered'}`} w={R + 180} h={395}>
      <rect x={20} y={60} width={R - 20} height={20} className="section" />
      {stiff.map((x) => (
        <g key={x}>
          <rect x={x} y={80} width={30} height={90} className="section" />
          <rect x={x} y={230} width={30} height={120} className="section" />
        </g>
      ))}
      <line x1={230} y1={200} x2={R + 10} y2={200} className="center" />
      <T x={(240 + R) / 2} y={194} a="middle">wheel axis</T>
      <Ext d={`M20,60 V24 M285,80 V24 ${p.double ? 'M495,80 V24' : ''} M${R},60 H${R + 25} M${R},80 H${R + 160} M270,170 H215 M270,230 H215 M270,80 H215 M${R - 30},200 H${R + 125} M${stiff[stiff.length - 1] + 30},350 H${R + 165} ${stiff.map((x) => `M${x},350 V378 M${x + 30},350 V378`).join(' ')}`} />
      <Dim x1={20} y1={30} x2={285} y2={30} label={`20 ts = ${(20 * p.ts * 1000).toFixed(0)} mm`} />
      {p.double && <Dim x1={285} y1={30} x2={495} y2={30} label={lbl('Sr', mm(p.Sr))} />}
      <Dim x1={R + 20} y1={60} x2={R + 20} y2={80} label={lbl('ts', mm(p.ts), 'mm', 1)} side={1} />
      <Dim x1={R + 120} y1={60} x2={R + 120} y2={200} label={lbl('y', mm(p.y))} rot />
      <Dim x1={R + 160} y1={80} x2={R + 160} y2={350} label={lbl('dweb', mm(p.dweb))} rot />
      <Dim x1={220} y1={80} x2={220} y2={170} label={lbl('e', mm(p.e))} />
      <Dim x1={220} y1={170} x2={220} y2={230} label={lbl('d', mm(p.d))} />
      <Dim x1={220} y1={230} x2={220} y2={350} label={lbl('f', mm(p.f))} />
      {stiff.map((x) => <Dim key={x} x1={x} y1={372} x2={x + 30} y2={372} label={lbl('c', mm(p.c))} side={1} />)}
    </Sketch>
  )
}

// ---------------------------------------------------------------- Downpull sheet objects

/** Half-plan of the gate in its slot. a1, a2, a″2 in m. */
export function DownpullPlanSketch(p: { a1?: number; a2: number; a2pp: number; d: number }) {
  return (
    <Sketch title="Downpull: half-plan of gate" w={620} h={400}
      note="B, b, b′, as and w′ are explanatory only: the sheet does not use them.">
      <line x1={40} y1={50} x2={600} y2={50} className="center" />
      <T x={330} y={40} a="middle">tunnel ℄</T>
      <rect x={90} y={280} width={210} height={12} className="hatch" />
      <rect x={455} y={280} width={140} height={12} className="hatch" />
      <path d="M90,280 H300 V345 H455 V280 H595" className="wall" fill="none" />
      <line x1={455} y1={50} x2={455} y2={280} className="wall thin" />
      <path d="M325,50 V335 H410 V50" className="gate" fill="none" />
      <rect x={410} y={285} width={15} height={15} className="seal" />
      <Ext d="M300,50 V110 M325,50 V110 M410,50 V140 M435,345 V140 M455,140 V170 M70,345 H300 M150,280 H90 M435,345 V385 M300,345 V385" />
      <Dim x1={300} y1={100} x2={325} y2={100} label={lbl('a1', mm(p.a1))} tx={294} />
      <Dim x1={410} y1={130} x2={435} y2={130} label={lbl('a2', mm(p.a2), 'mm', 1)} tx={462} />
      <Dim x1={435} y1={160} x2={455} y2={160} label={lbl('a″2', mm(p.a2pp), 'mm', 1)} tx={462} />
      <Dim x1={325} y1={240} x2={410} y2={240} label={lbl('d', mm(p.d))} />
      <Dim x1={70} y1={50} x2={70} y2={345} label="B/2" />
      <Dim x1={155} y1={50} x2={155} y2={280} label="b/2" side={1} />
      <Dim x1={155} y1={280} x2={155} y2={345} label="b′/2" side={1} />
      <Dim x1={300} y1={378} x2={435} y2={378} label="w′" side={1} />
      <T x={470} y={110}>recess</T>
      <T x={462} y={318}>seal</T>
      <T x={360} y={330} a="middle">gate</T>
    </Sketch>
  )
}

/** Flow at the chosen opening (the sheet's submerged-flow sketch). Lengths in m. */
export function DownpullFlowSketch(p: {
  H: number; hT: number; dh1: number; dh2: number; Hce: number; y: number; h: number; e: number; d: number
  Vj: number; Qp: number; Qpp: number; F: number; x: number
}) {
  return (
    <Sketch title={`Downpull: flow at opening x = ${p.x.toFixed(2)}`} w={640} h={420}
      note="Not to scale. Q′ passes under the gate, Q″ over the top seal and down the downstream face.">
      <line x1={20} y1={40} x2={620} y2={40} className="wl" />
      <T x={24} y={34}>reservoir level</T>
      <rect x={20} y={250} width={260} height={140} className="water" />
      <rect x={200} y={90} width={100} height={160} className="water" />
      <path d="M280,330 C330,335 380,350 440,350 H600 V390 H280 Z" className="water" />
      <rect x={20} y={236} width={180} height={14} className="hatch" />
      <rect x={300} y={236} width={300} height={14} className="hatch" />
      <rect x={20} y={390} width={600} height={14} className="hatch" />
      <path d="M200,60 V250 M300,60 V250" className="wall" fill="none" />
      <line x1={200} y1={90} x2={300} y2={90} className="wl" />
      <T x={250} y={84} a="middle">▽</T>
      <line x1={280} y1={120} x2={280} y2={330} className="gate" />
      {[160, 210, 260, 310].map((yy) => <line key={yy} x1={230} y1={yy} x2={280} y2={yy} className="gate" />)}
      <rect x={280} y={120} width={12} height={12} className="seal" />
      <line x1={286} y1={140} x2={410} y2={140} className="ext dashed" />
      <Ext d="M200,52 H380 M300,90 H380 M600,350 H556 M180,330 H280 M230,310 V345 M280,330 V345 M20,390 V390" />
      <Dim x1={360} y1={40} x2={360} y2={52} label={lbl('Hce', p.Hce, 'm', 3)} side={1} />
      <Dim x1={360} y1={52} x2={360} y2={90} label={lbl('Δh1', p.dh1, 'm', 3)} side={1} />
      <Dim x1={360} y1={90} x2={360} y2={140} label={lbl('Δh2', p.dh2, 'm', 3)} side={1} />
      <Dim x1={160} y1={90} x2={160} y2={390} label={lbl('hT', p.hT, 'm', 3)} rot />
      <Dim x1={610} y1={40} x2={610} y2={390} label={lbl('H', p.H, 'm', 3)} rot />
      <Dim x1={190} y1={330} x2={190} y2={390} label={lbl('y', p.y, 'm', 3)} />
      <Dim x1={560} y1={350} x2={560} y2={390} label={lbl('Cc·y', p.h, 'm', 3)} />
      <Dim x1={230} y1={342} x2={280} y2={342} label={lbl('d', p.d, 'm', 3)} side={1} />
      <T x={226} y={318} a="end">{lbl('e', p.e, 'm', 3)}</T>
      <Load x1={292} y1={150} x2={292} y2={300} />
      <T x={300} y={230} c="load-lbl">{lbl('Q″', p.Qpp, 'm³/s', 2)}</T>
      <Load x1={330} y1={378} x2={400} y2={378} />
      <T x={325} y={382} a="end" c="load-lbl">{lbl('Q′', p.Qp, 'm³/s', 2)}</T>
      <T x={450} y={338} c="load-lbl">{lbl('Vj', p.Vj, 'm/s', 2)}</T>
      <Load x1={255} y1={150} x2={255} y2={200} />
      <T x={250} y={145} a="end" c="load-lbl">{lbl('F', p.F, 'kN', 1)}</T>
    </Sketch>
  )
}

// ---------------------------------------------------------------- Plates sheet objects

/** Skin plate panel between stiffeners. Interior: all edges fixed (CCCC); top: three edges fixed, top free (CCCF). */
export function PlateSketch({ top, a, b, q, q0 }: { top: boolean; a: number; b: number; q: number; q0: number }) {
  return (
    <Sketch title={top ? 'Skin plate, top panel (top edge free)' : 'Skin plate, interior panel (edges fixed)'} w={720} h={360}
      note="Load = uniform q (case B) plus the triangular increase q₀ to the panel's lower edge (case A).">
      <rect x={95} y={70} width={15} height={210} className="hatch" />
      <rect x={450} y={70} width={15} height={210} className="hatch" />
      <rect x={95} y={280} width={370} height={15} className="hatch" />
      {!top && <rect x={95} y={55} width={370} height={15} className="hatch" />}
      <rect x={110} y={70} width={340} height={210} className="panel" />
      <line x1={280} y1={45} x2={280} y2={300} className="center" />
      <T x={286} y={56}>y</T><T x={268} y={276} a="end">O</T><T x={474} y={292}>x</T>
      {top
        ? <><Load x1={400} y1={70} x2={448} y2={70} /><T x={396} y={65} a="end" c="load-lbl">My</T>
          <Load x1={280} y1={240} x2={280} y2={278} /><T x={286} y={256} c="load-lbl">Mx</T></>
        : <><Load x1={280} y1={110} x2={280} y2={72} /><T x={286} y={100} c="load-lbl">Mx</T>
          <Load x1={400} y1={175} x2={448} y2={175} /><T x={396} y={170} a="end" c="load-lbl">My</T></>}
      <Ext d="M110,70 V20 M450,70 V20 M450,70 H505 M450,280 H505" />
      <Dim x1={110} y1={25} x2={280} y2={25} label={lbl('b/2', b / 2, 'm', 3)} />
      <Dim x1={280} y1={25} x2={450} y2={25} label={lbl('b/2', b / 2, 'm', 3)} />
      <Dim x1={500} y1={70} x2={500} y2={280} label={lbl('a', a, 'm', 3)} rot side={1} />
      <T x={20} y={175}>horizontal</T><T x={20} y={190}>stiffener{top ? '' : 's'}</T>
      <T x={280} y={322} a="middle">vertical stiffeners</T>
      <T x={620} y={45} a="middle">load cases</T>
      <polygon points="560,70 560,280 600,280" className="udl" />
      <rect x={640} y={70} width={40} height={210} className="udl" />
      <T x={580} y={64} a="middle">A</T><T x={660} y={64} a="middle">B</T>
      <T x={580} y={300} a="middle" c="load-lbl">{lbl('q₀', q0, 'kN/m²', 1)}</T>
      <T x={660} y={320} a="middle" c="load-lbl">{lbl('q', q, 'kN/m²', 1)}</T>
    </Sketch>
  )
}

// ---------------------------------------------------------------- Hoist(Rope Drum) sheet picture

/** Drum shaft: bearings C, D; drum ends A, B; rope falls at X, Y. Lengths in m, RT in kN, reactions in N. */
export function HoistShaftSketch(p: { AC: number; AB: number; BD: number; CD: number; AX: number; XY: number; RT: number; Rc: number; Rd: number }) {
  return (
    <Sketch title="Drum shaft" w={640} h={330}>
      <rect x={140} y={140} width={360} height={50} className="part" />
      <rect x={136} y={120} width={8} height={80} className="section" />
      <rect x={496} y={120} width={8} height={80} className="section" />
      <rect x={508} y={60} width={14} height={140} className="section" />
      <line x1={40} y1={200} x2={600} y2={200} className="axle" />
      <rect x={54} y={170} width={12} height={60} className="section" />
      <rect x={574} y={170} width={12} height={60} className="section" />
      <T x={530} y={72}>drum gear</T>
      {([['C', 50], ['A', 130], ['B', 490]] as const).map(([k, x]) => <T key={k} x={x} y={218} a="end">{k}</T>)}
      <T x={590} y={218}>D</T>
      <Load x1={200} y1={66} x2={200} y2={138} />
      <Load x1={440} y1={66} x2={440} y2={138} />
      <T x={206} y={100} c="load-lbl">X: {lbl('RT', p.RT, 'kN', 1)}</T>
      <T x={446} y={100} c="load-lbl">Y</T>
      <Load x1={60} y1={262} x2={60} y2={232} />
      <Load x1={580} y1={262} x2={580} y2={232} />
      <T x={68} y={258} c="load-lbl">{lbl('Rc', p.Rc / 1000, 'kN', 1)}</T>
      <T x={572} y={258} a="end" c="load-lbl">{lbl('Rd', p.Rd / 1000, 'kN', 1)}</T>
      <Ext d="M140,120 V24 M200,66 V24 M440,66 V24 M60,230 V318 M140,200 V290 M500,200 V290 M580,230 V318" />
      <Dim x1={140} y1={30} x2={200} y2={30} label={lbl('AX', mm(p.AX))} />
      <Dim x1={200} y1={30} x2={440} y2={30} label={lbl('XY', mm(p.XY))} />
      <Dim x1={60} y1={285} x2={140} y2={285} label={lbl('AC', mm(p.AC))} />
      <Dim x1={140} y1={285} x2={500} y2={285} label={lbl('AB', mm(p.AB))} />
      <Dim x1={500} y1={285} x2={580} y2={285} label={lbl('BD', mm(p.BD))} />
      <Dim x1={60} y1={312} x2={580} y2={312} label={lbl('CD', mm(p.CD))} side={1} />
    </Sketch>
  )
}
