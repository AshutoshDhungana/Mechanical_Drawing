// Summary sheet: project-level inputs and the levels derived from them.
// Units: m, levels in m amsl.

export interface ProjectInput {
  location: string
  clearSpan: number // Summary!D5
  clearHeight: number // D6
  openings: number // D7
  hfl: number // D8 high flood level
  nwl: number // D9 normal water level
  sill: number // D10
  platform: number // D12 gate operating platform
}

export const defaultProject: ProjectInput = {
  location: 'Intake',
  clearSpan: 3.5,
  clearHeight: 2.8,
  openings: 4,
  hfl: 745.53,
  nwl: 742,
  sill: 738,
  platform: 747,
}

/** Workbook defaults that other sheets take from Summary (the user can override them there). */
export function projectDefaults(p: ProjectInput) {
  const gateHeight = p.clearHeight + 0.1 // 'Beam Spacing'!F7: 0.1 m above the opening to the top seal
  return {
    gateHeight,
    supportSpan: p.clearSpan + 2 * 0.2, // 'Beam Spacing'!F8: 0.2 m into the slot each side
    headHfl: p.hfl - p.sill, // D13 design head at HFL
    headNwl: p.nwl - p.sill, // D14
  }
}

/** Summary!D11: uses the gate height actually adopted on Beam Spacing (named range D). */
export const hoistDeckLevel = (p: ProjectInput, gateHeight: number) => p.platform + gateHeight + 0.3
