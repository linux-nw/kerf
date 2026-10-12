import { ArrowRight } from 'lucide-react'
import { formatBytes, formatPercent, savedPercent } from '@shared/format'

export function SizeDelta({ before, after }: { before: number; after: number }) {
  const percent = savedPercent(before, after)
  const variant = percent === 0 ? ' kf-delta--none' : percent > 0 ? ' kf-delta--bad' : ''
  return (
    <span className={`kf-delta${variant}`}>
      <span className="kf-delta__from">{formatBytes(before)}</span>
      <ArrowRight className="kf-delta__arrow" aria-hidden="true" />
      <span className="kf-delta__to">{formatBytes(after)}</span>
      <span className="kf-delta__pct">{formatPercent(before, after)}</span>
    </span>
  )
}
