import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp } from 'lucide-react'

interface Props {
  label: string
  summary: string
  children: ReactNode
  width?: number
}

export function Popover({ label, summary, children, width = 360 }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="kf-pop" ref={root}>
      <button type="button" className="kf-pill" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="kf-pill__label">{label}</span>
        <span className="kf-pill__value">{summary}</span>
        <ChevronUp className="kf-icon kf-icon--sm" aria-hidden="true" />
      </button>
      {open ? (
        <div className="kf-pop__panel" role="dialog" aria-label={label} style={{ width }}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
