import { ShieldCheck } from 'lucide-react'

export function LocalBadge() {
  return (
    <span className="kf-local">
      <ShieldCheck className="kf-icon kf-icon--sm" aria-hidden="true" />
      100 % lokal
    </span>
  )
}
