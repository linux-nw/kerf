import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { FilePlus2, FileUp } from 'lucide-react'

interface Props {
  compact: boolean
  disabled: boolean
  onPick: () => void
  onDropFiles: (files: File[]) => void
}

export function Dropzone({ compact, disabled, onPick, onDropFiles }: Props) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    depth.current = 0
    setOver(false)
    if (disabled) return
    onDropFiles(Array.from(event.dataTransfer.files))
  }

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!disabled) onPick()
    }
  }

  const Icon = compact ? FilePlus2 : FileUp

  return (
    <div
      className={`kf-drop${compact ? ' kf-drop--compact' : ''}${over ? ' is-over' : ''}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      aria-label="PDFs hinzufügen"
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
      <span className="kf-drop__mark">
        <Icon className="kf-icon kf-icon--lg" aria-hidden="true" />
      </span>
      <div>
        <p className="kf-drop__title">{over ? 'Loslassen zum Hinzufügen' : compact ? 'Weitere Dateien hinzufügen' : 'Leg PDFs hier ab'}</p>
        <p className="kf-drop__hint">
          {compact ? 'Ziehen oder klicken. Ordner funktionieren auch.' : 'Oder klicke zum Auswählen. Ganze Ordner gehen auch. Nichts verlässt diesen Rechner.'}
        </p>
      </div>
      {compact ? null : (
        <div className="kf-drop__formats">
          <span className="kf-chip">PDF</span>
        </div>
      )}
    </div>
  )
}
