import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultSeals } from '../calc/seals'
import {
  CantAxleSketch, DoubleAxleSketch, DownpullFlowSketch, DownpullPlanSketch, EndBeamSketch, HoistShaftSketch, PlateSketch, SealSketch, WheelSketch,
} from './Sketches'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('explanatory sketches', () => {
  it('write live values next to the letters, letters alone when unknown', () => {
    const svgs = [
      html(<SealSketch title="Lintel" type="J Seal" d={defaultSeals.lintel.dims} F={1.234} k={0.5} />),
      html(<SealSketch title="Side" type="Center Bulb Seal" d={defaultSeals.lintel.dims} />),
      html(<SealSketch title="Sill" type="Wedge Seal" d={defaultSeals.sill.dims} />),
      html(<WheelSketch D={0.6} bt={0.12} d={0.1} />),
      html(<DoubleAxleSketch Lr={0.2} b={0.01} bh={0.12} c={0.03} w={1330} Mo={2.5} R1={90} R2={70} z={0.1} />),
      html(<CantAxleSketch Lr={0.3} a={0.02} c={0.03} b={0.01} bh={0.12} w={1330} Mo={2.5} R1={90} R2={250} />),
      html(<EndBeamSketch double ts={0.012} Sr={0.18} e={0.1} d={0.1} f={0.2} c={0.025} y={0.2} dweb={0.45} />),
      html(<EndBeamSketch double={false} ts={0.012} e={0.1} d={0.1} f={0.2} c={0.025} y={0.2} dweb={0.45} />),
      html(<DownpullPlanSketch a2={0.056} a2pp={0.1} d={0.4} />),
      html(<DownpullFlowSketch H={10} hT={9} dh1={0.5} dh2={0.4} Hce={0.1} y={0.1} h={0.07} e={0} d={0.4} Vj={13} Qp={5} Qpp={0.3} F={50} x={0.01} />),
      html(<PlateSketch top a={0.5} b={0.3} q={20} q0={5} />),
      html(<HoistShaftSketch AC={0.1} AB={0.5} BD={0.1} CD={0.7} AX={0.05} XY={0.4} RT={30} Rc={20000} Rd={25000} />),
    ]
    for (const s of svgs) {
      expect(s).toMatch(/^<figure/)
      expect(s).not.toMatch(/NaN|undefined|Infinity/)
    }
    expect(svgs[0]).toContain('B = 44 mm')
    expect(svgs[0]).toContain('F = 1.234 N/mm')
    expect(svgs[1]).toContain('>F<') // no result: letter only
    expect(svgs[2]).toContain('h = 50 mm')
    expect(svgs[3]).toContain('D = 600 mm')
    expect(svgs[3]).toContain('>dh<')
    expect(svgs[8]).toContain('>a1<') // face gate: no upstream clearance
    expect(svgs[11]).toContain('Rd = 25.0 kN')
    expect(html(<SealSketch title="Lintel" type="No Lintel Seal" d={defaultSeals.lintel.dims} />)).toBe('')
  })
})
