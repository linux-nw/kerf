const NBSP = ' '
const MINUS = '−'

const numberFormat = (fractionDigits: number) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits })

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return `0${NBSP}B`
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${numberFormat(digits).format(value)}${NBSP}${units[unit]}`
}

export function savedPercent(before: number, after: number): number {
  if (before <= 0) return 0
  return Math.round(((after - before) / before) * 100)
}

export function formatPercent(before: number, after: number): string {
  const percent = savedPercent(before, after)
  if (percent === 0) return `±0${NBSP}%`
  if (percent < 0) return `${MINUS}${Math.abs(percent)}${NBSP}%`
  return `+${percent}${NBSP}%`
}
