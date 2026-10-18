// DXF (R12 / AC1009, ASCII) export of a sheet. Coordinates are paper mm × the sheet scale, so views drawn at the
// sheet scale come out full size in mm (details on a mixed-scale sheet keep their own scale; the dimension text
// is always the true size). R12 is the most widely readable DXF: lines, polylines, circles, solids and text.
import type { PLayer, Sheet } from './sheet'
import type { Pt } from './model'

const layers: Record<PLayer, { color: number; ltype: string }> = {
  OUTLINE: { color: 7, ltype: 'CONTINUOUS' }, CUT: { color: 7, ltype: 'CONTINUOUS' }, HATCH: { color: 8, ltype: 'CONTINUOUS' },
  HIDDEN: { color: 4, ltype: 'DASHED' }, CENTER: { color: 1, ltype: 'CENTER' }, THIN: { color: 8, ltype: 'CONTINUOUS' },
  DIM: { color: 3, ltype: 'CONTINUOUS' }, TEXT: { color: 7, ltype: 'CONTINUOUS' }, BORDER: { color: 7, ltype: 'CONTINUOUS' },
}

/** DXF text: %%c is the diameter sign; anything else outside ASCII as \U+XXXX. */
const enc = (s: string) => s.replace(/Ø/g, '%%c').replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)

export function toDxf(sheet: Sheet): string {
  const F = sheet.scale
  const o: (string | number)[] = []
  const g = (...pairs: (string | number)[]) => o.push(...pairs)
  const num = (v: number) => Number(v.toFixed(4))
  const xy = (p: Pt, c = 10) => g(c, num(p[0] * F), c + 10, num(p[1] * F), c + 20, 0)

  g(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$LTSCALE', 40, 1, 0, 'ENDSEC')
  g(0, 'SECTION', 2, 'TABLES')
  const ltypes: [string, string, number[]][] = [['CONTINUOUS', 'Solid line', []], ['DASHED', '__ __ __', [3, -1.5]], ['CENTER', '____ _ ____', [12, -1.5, 2, -1.5]]]
  g(0, 'TABLE', 2, 'LTYPE', 70, ltypes.length)
  for (const [name, desc, pat] of ltypes) {
    g(0, 'LTYPE', 2, name, 70, 0, 3, desc, 72, 65, 73, pat.length, 40, num(pat.reduce((a, b) => a + Math.abs(b), 0) * F))
    for (const d of pat) g(49, num(d * F))
  }
  g(0, 'ENDTAB', 0, 'TABLE', 2, 'LAYER', 70, Object.keys(layers).length)
  for (const [name, l] of Object.entries(layers)) g(0, 'LAYER', 2, name, 70, 0, 62, l.color, 6, l.ltype)
  g(0, 'ENDTAB', 0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '', 0, 'ENDTAB')
  g(0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES')

  for (const p of sheet.prims) {
    if (p.k === 'circle') { g(0, 'CIRCLE', 8, p.layer); xy(p.c); g(40, num(p.r * F)) }
    else if (p.k === 'text') {
      const align = p.anchor === 'middle' ? 1 : p.anchor === 'end' ? 2 : 0
      g(0, 'TEXT', 8, p.layer); xy(p.p); g(40, num(p.h * F), 1, enc(p.s))
      if (p.rot) g(50, p.rot)
      if (align) { g(72, align); xy(p.p, 11) }
    } else if (p.fill === 'black') {
      // filled: a fan of SOLIDs (vertex order 1, 2, 4, 3; a triangle repeats its last point)
      for (let i = 1; i + 1 < p.pts.length; i++) {
        g(0, 'SOLID', 8, p.layer); xy(p.pts[0], 10); xy(p.pts[i], 11); xy(p.pts[i + 1], 12); xy(p.pts[i + 1], 13)
      }
      g(0, 'POLYLINE', 8, p.layer, 66, 1, 70, 1, 10, 0, 20, 0, 30, 0)
      for (const q of p.pts) { g(0, 'VERTEX', 8, p.layer); xy(q) }
      g(0, 'SEQEND', 8, p.layer)
    } else if (p.pts.length === 2 && !p.closed) {
      g(0, 'LINE', 8, p.layer); xy(p.pts[0]); xy(p.pts[1], 11)
    } else {
      g(0, 'POLYLINE', 8, p.layer, 66, 1, 70, p.closed ? 1 : 0, 10, 0, 20, 0, 30, 0)
      for (const q of p.pts) { g(0, 'VERTEX', 8, p.layer); xy(q) }
      g(0, 'SEQEND', 8, p.layer)
    }
  }
  g(0, 'ENDSEC', 0, 'EOF')
  const lines: string[] = []
  for (let i = 0; i < o.length; i += 2) lines.push(String(o[i]).padStart(3), String(o[i + 1]))
  return lines.join('\r\n') + '\r\n'
}
