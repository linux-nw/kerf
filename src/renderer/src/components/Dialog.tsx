import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Dialog({ title, children, confirmLabel, cancelLabel = 'Abbrechen', danger, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="kf-dialog__overlay" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="kf-dialog" role="alertdialog" aria-modal="true" aria-labelledby="kf-dialog-title" aria-describedby="kf-dialog-text">
        <h2 id="kf-dialog-title" className="kf-dialog__title">
          {title}
        </h2>
        <div id="kf-dialog-text" className="kf-dialog__text">
          {children}
        </div>
        <div className="kf-dialog__actions">
          <button ref={cancelRef} type="button" className="kf-btn kf-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`kf-btn ${danger ? 'kf-btn--danger-solid' : 'kf-btn--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
