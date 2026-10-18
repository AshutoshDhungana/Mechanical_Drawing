import { describe, expect, it } from 'vitest'
import { defaultProject } from './calc/project'
import { defaultSeals } from './calc/seals'
import { defaultWheelDesign } from './calc/wheelDesign'
import { loadDesign, mismatch, saveDesign } from './designFile'

const defaults = {
  project: defaultProject,
  form: { n: 5, D: null as number | null, method: 'equal-moments' },
  sform: { beams: [{ type: 'I Shape', designation: 'ISMB 350' }], skinThickness: [0.012], material: { E: 206000 } },
  seals: defaultSeals, wheel: defaultWheelDesign, source: 'AC 400V',
}

describe('design files', () => {
  it('round-trip every input', () => {
    const d = {
      ...defaults, project: { ...defaultProject, location: 'Spillway 2', clearSpan: 6 },
      form: { n: 7, D: 4.2, method: 'manual', manual: [0.5, 0.5] },
      sform: { ...defaults.sform, beams: [{ type: 'Fabricated Shape', bfb: 0.2, tfb: 0.02, tw: 0.01, dw: 0.5, bff: 0.2, tff: 0.02 }], skinThickness: [0.012, null, 0.016] },
    }
    expect(loadDesign(saveDesign(d), defaults)).toEqual(d)
  })

  it('fill fields missing from an older file with the defaults', () => {
    const text = JSON.stringify({ app: 'VertGate', version: 1, inputs: { project: { location: 'X' } } })
    const d = loadDesign(text, defaults)
    expect(d.project).toEqual({ ...defaultProject, location: 'X' })
    expect(d.wheel).toBe(defaultWheelDesign)
  })

  it('reject anything that is not a sound design file', () => {
    expect(() => loadDesign('{', defaults)).toThrow(/not valid JSON/)
    expect(() => loadDesign('{"app":"Other"}', defaults)).toThrow(/not a VertGate design/)
    expect(() => loadDesign('{"app":"VertGate","version":9,"inputs":{}}', defaults)).toThrow(/version 9/)
    const bad = (inputs: object) => () => loadDesign(JSON.stringify({ app: 'VertGate', version: 1, inputs }), defaults)
    expect(bad({ project: { clearSpan: '6' } })).toThrow('inputs.project.clearSpan must be a number')
    expect(bad({ sform: { beams: {} } })).toThrow('inputs.sform.beams must be a list')
    expect(bad({ wheel: { line: { D: null } } })).toThrow('inputs.wheel.line.D must be a number')
    expect(bad({ form: { D: 'x' } })).toThrow('number or null')
    expect(mismatch(1, Infinity)).toMatch(/number/) // JSON cannot hold it, but a hand-built object can
  })
})
