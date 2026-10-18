export const f = (x: number | undefined, dp = 3) => (x !== undefined && Number.isFinite(x) ? x.toFixed(dp) : '—')

/** CSS class for a utilisation ratio (≤ 1 passes). */
export const ratioClass = (r: number) => (r > 1 ? 'fail' : r > 0.9 ? 'near' : 'ok')
