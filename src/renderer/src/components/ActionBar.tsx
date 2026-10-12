import type { ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'

interface Props {
  options?: ReactNode
  extra?: ReactNode
  label: string
  disabled: boolean
  running: boolean
  onStart: () => void
  onCancel: () => void
}

export function ActionBar({ options, extra, label, disabled, running, onStart, onCancel }: Props) {
  return (
    <div className="kf-bar">
      {extra ? <div className="kf-bar__extra">{extra}</div> : null}
      <div className="kf-bar__row">
        <div className="kf-bar__options">{options}</div>
        {running ? (
          <button type="button" className="kf-btn kf-btn--secondary" onClick={onCancel}>
            <X className="kf-icon kf-icon--sm" aria-hidden="true" />
            Abbrechen
          </button>
        ) : null}
        <button type="button" className="kf-btn kf-btn--primary" disabled={disabled || running} onClick={onStart}>
          {running ? <Loader2 className="kf-icon kf-icon--sm kf-spin" aria-hidden="true" /> : null}
          {label}
        </button>
      </div>
    </div>
  )
}
