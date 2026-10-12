import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ClipboardPaste, FilePlus2, FileUp, FolderPlus } from 'lucide-react'

interface Props {
  compact: boolean
  disabled?: boolean
  label: string
  formats: string
  allowFolders?: boolean
  onPick: () => void
  onPickFolder?: () => void
  onPaste: () => void
  onDropFiles: (files: File[]) => void
}

export function Dropzone({ compact, disabled, label, formats, allowFolders = true, onPick, onPickFolder, onPaste, onDropFiles }: Props) {
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

  const Icon = compact ? FilePlus2 : FileUp

  return (
    <div className={`kf-dropwrap${compact ? ' kf-dropwrap--compact' : ''}`}>
      <div
        className={`kf-drop${compact ? ' kf-drop--compact' : ''}${over ? ' is-over' : ''}`}
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
        <span className="kf-drop__mark">
          <Icon className="kf-icon kf-icon--lg" aria-hidden="true" />
        </span>
        <div>
          <p className="kf-drop__title">{over ? 'Loslassen zum Hinzufügen' : compact ? 'Weitere Dateien' : label}</p>
          <p className="kf-drop__hint">
            {compact ? 'Ziehen, klicken oder Strg V' : 'Ziehen, klicken oder mit Strg V einfügen. Nichts verlässt diesen Rechner.'}
          </p>
        </div>
        {compact ? null : <span className="kf-chip kf-drop__formats">{formats}</span>}
      </div>
      <div className="kf-dropwrap__side">
        <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={onPaste} disabled={disabled} title="Dateien oder Bild aus der Zwischenablage einfügen">
          <ClipboardPaste className="kf-icon kf-icon--sm" aria-hidden="true" />
          Einfügen
        </button>
        {allowFolders && onPickFolder ? (
          <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={onPickFolder} disabled={disabled}>
            <FolderPlus className="kf-icon kf-icon--sm" aria-hidden="true" />
            Ordner
          </button>
        ) : null}
      </div>
    </div>
  )
}
