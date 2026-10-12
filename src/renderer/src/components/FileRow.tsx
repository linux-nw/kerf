import { AlertTriangle, CheckCircle2, Clock, FolderOpen, Loader2, MinusCircle, X, XCircle } from 'lucide-react'
import { formatBytes } from '@shared/format'
import type { JobErrorCode } from '@shared/types'
import type { Entry } from '../state'
import { SizeDelta } from './SizeDelta'

interface Props {
  entry: Entry
  onRemove: () => void
  onCancel: () => void
  onShow: (path: string) => void
}

const errorTexts: Record<JobErrorCode, string> = {
  password: 'Braucht ein Passwort. Geschützte PDFs kann Kerf noch nicht öffnen.',
  unreadable: 'Die Datei ist beschädigt oder kein gültiges PDF.',
  missing: 'Die Datei wurde nicht mehr gefunden.',
  write: 'Das Ergebnis konnte nicht gespeichert werden.',
  unknown: 'Unerwarteter Fehler.'
}

function ext(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1, index + 5).toUpperCase() : 'DATEI'
}

function outputName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function FileRow({ entry, onRemove, onCancel, onShow }: Props) {
  const { info, update } = entry
  const status = update?.status ?? null
  const cls = status === 'running' ? ' is-running' : status === 'error' ? ' is-error' : ''

  let state
  let action
  if (status === 'waiting') {
    state = (
      <span className="kf-status kf-status--wait">
        <Clock className="kf-icon kf-icon--sm" aria-hidden="true" />
        Wartet
      </span>
    )
    action = <IconButton label="Abbrechen" onClick={onCancel} icon={<X className="kf-icon kf-icon--sm" />} />
  } else if (status === 'running') {
    state = (
      <span className="kf-status kf-status--run">
        <Loader2 className="kf-icon kf-icon--sm" aria-hidden="true" />
        Läuft
      </span>
    )
    action = <IconButton label="Abbrechen" onClick={onCancel} icon={<X className="kf-icon kf-icon--sm" />} />
  } else if (status === 'done' && update?.outputSize != null) {
    state = <SizeDelta before={info.size} after={update.outputSize} />
    action = update.outputPath ? (
      <IconButton label="Im Ordner zeigen" onClick={() => onShow(update.outputPath as string)} icon={<FolderOpen className="kf-icon kf-icon--sm" />} />
    ) : null
  } else if (status === 'nogain' || status === 'larger') {
    state = <SizeDelta before={info.size} after={update?.outputSize ?? info.size} />
    action = null
  } else if (status === 'error') {
    state = (
      <span className="kf-status kf-status--err">
        <AlertTriangle className="kf-icon kf-icon--sm" aria-hidden="true" />
        Fehler
      </span>
    )
    action = <IconButton label="Entfernen" onClick={onRemove} icon={<X className="kf-icon kf-icon--sm" />} />
  } else if (status === 'cancelled') {
    state = (
      <span className="kf-status kf-status--wait">
        <XCircle className="kf-icon kf-icon--sm" aria-hidden="true" />
        Abgebrochen
      </span>
    )
    action = <IconButton label="Entfernen" onClick={onRemove} icon={<X className="kf-icon kf-icon--sm" />} />
  } else {
    state = null
    action = <IconButton label="Entfernen" onClick={onRemove} icon={<X className="kf-icon kf-icon--sm" />} />
  }

  let note: string | null = null
  if (status === 'done' && update?.outputPath) {
    note = `${outputName(update.outputPath)}${update.detail ? `. ${update.detail}.` : ''}`
  } else if (status === 'nogain') note = 'Schon optimal. Es wurde nichts gespeichert.'
  else if (status === 'larger') note = 'Das Ergebnis wäre größer geworden. Das Original bleibt, es wurde nichts gespeichert.'
  else if (status === 'error' && update?.errorCode) note = errorTexts[update.errorCode]

  const percent = update?.percent ?? 0

  return (
    <div className={`kf-file${cls}`}>
      <span className="kf-file__ext" aria-hidden="true">
        {ext(info.name)}
      </span>
      <div className="kf-file__main">
        <span className="kf-file__name" title={info.path}>
          {info.name}
        </span>
        <span className="kf-file__meta">{formatBytes(info.size)}</span>
      </div>
      {state}
      <div className="kf-file__actions">{action}</div>
      {status === 'running' ? (
        <div className="kf-file__progress">
          <div className="kf-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${info.name}: ${update?.step ?? ''}`}>
            <div className="kf-progress__bar" style={{ width: `${percent}%` }} />
          </div>
          <span className="kf-progress__pct">{percent} %</span>
        </div>
      ) : null}
      {status === 'running' && update?.step ? <p className="kf-file__note">{update.step}</p> : null}
      {note ? (
        <p className="kf-file__note">
          {status === 'done' ? <CheckCircle2 className="kf-icon kf-icon--sm" style={{ verticalAlign: 'text-bottom', marginRight: 6, color: 'var(--success)' }} aria-hidden="true" /> : null}
          {status === 'nogain' ? <MinusCircle className="kf-icon kf-icon--sm" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" /> : null}
          {note}
        </p>
      ) : null}
    </div>
  )
}

function IconButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm" aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  )
}
