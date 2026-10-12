import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { FilePlus2, FileUp, type LucideIcon } from 'lucide-react'

interface Props {
  compact: boolean
  disabled?: boolean
  label: string
  hint?: ReactNode
  icon?: LucideIcon
  art?: ReactNode
  layout?: 'center' | 'row'
  hero?: boolean
  dim?: boolean
  fixed?: boolean
  className?: string
  children?: ReactNode
  onPick: () => void
  onDropFiles: (files: File[]) => void
}

export function PasteHint() {
  return (
    <>
      Ziehen, klicken oder <kbd className="kf-kbd">Strg</kbd> + <kbd className="kf-kbd">V</kbd>
    </>
  )
}

export function Dropzone({ compact, disabled, label, hint, icon, art, layout = 'center', hero = false, dim = false, fixed = false, className = '', children, onPick, onDropFiles }: Props) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    depth.current = 0
    setOver(false)
    if (!disabled) onDropFiles(Array.from(event.dataTransfer.files))
  }

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!disabled) onPick()
    }
  }

  const Icon = compact ? FilePlus2 : (icon ?? FileUp)
  const classes = ['kf-drop']
  if (compact) classes.push('kf-drop--compact')
  else {
    if (hero) classes.push('kf-drop--hero')
    if (layout === 'row') classes.push('kf-drop--row')
    if (fixed) classes.push('kf-drop--fixed')
    if (dim) classes.push('kf-drop--dim')
  }
  if (over) classes.push('is-over')
  if (className) classes.push(className)

  return (
    <div
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      aria-label={label}
      onClick={() => !disabled && onPick()}
      onKeyDown={handleKey}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={() => {
        depth.current += 1
        setOver(true)
      }}
      onDragLeave={() => {
        depth.current -= 1
        if (depth.current <= 0) setOver(false)
      }}
      onDrop={handleDrop}
    >
      {art && !compact ? (
        art
      ) : (
        <span className="kf-drop__mark">
          <Icon className="kf-icon kf-icon--lg" aria-hidden="true" />
        </span>
      )}
      <div className="kf-drop__body">
        <div>
          <p className="kf-drop__title">{over ? 'Loslassen zum Hinzufügen' : compact ? 'Weitere Dateien' : label}</p>
          <p className="kf-drop__hint">{hint ?? <PasteHint />}</p>
        </div>
        {compact ? null : children}
      </div>
    </div>
  )
}
