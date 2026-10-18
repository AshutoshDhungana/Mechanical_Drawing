import { expect, it } from 'vitest'
import { defaultProject, hoistDeckLevel, projectDefaults } from './project'
import { cell, num } from './golden'

it('Summary inputs and derived levels match the workbook', () => {
  const p = defaultProject
  expect([p.location, p.clearSpan, p.clearHeight, p.openings, p.hfl, p.nwl, p.sill, p.platform]).toEqual(
    ['D3', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D12'].map((a) => cell('Summary', a)),
  )
  const d = projectDefaults(p)
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)
  near(d.headHfl, num('Summary', 'D13'))
  near(d.headNwl, num('Summary', 'D14'))
  near(d.gateHeight, num('Beam Spacing', 'F7'))
  near(d.supportSpan, num('Beam Spacing', 'F8'))
  near(hoistDeckLevel(p, d.gateHeight), num('Summary', 'D11'))
})
