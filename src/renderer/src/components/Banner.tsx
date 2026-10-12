import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

export type BannerTone = 'info' | 'success' | 'warning' | 'danger'

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }

export function Banner({ tone, title, children, action }: { tone: BannerTone; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = icons[tone]
  return (
    <div className={`kf-banner kf-banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="kf-icon" aria-hidden="true" />
      <div>
        <p className="kf-banner__title">{title}</p>
        {children ? <p className="kf-banner__text">{children}</p> : null}
      </div>
      {action}
    </div>
  )
}
