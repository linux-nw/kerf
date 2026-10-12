import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, FolderOpen, Loader2, Trash2, X, XCircle } from 'lucide-react'
import { formatBytes } from '@shared/format'
import type { JobErrorCode, JobUpdate } from '@shared/types'
import { useApp } from '../context'
import type { Entry } from '../store'
import { SizeDelta } from './SizeDelta'
import { baseName, ExtBadge, IconButton } from './ui'

interface Props {
  tool: Parameters<ReturnType<typeof useApp>['run']>[0]
  entry: Entry
  delta?: boolean
  keepsHistory?: boolean
  onRemove: () => void
  extra?: ReactNode
  note?: ReactNode
  doneLabel?: string
  selected?: boolean
  onSelect?: () => void
}

const errorTexts: Record<JobErrorCode, string> = {
  password: 'Braucht ein Passwort. Geschützte Dateien kann Kerf hier nicht öffnen.',
  unreadable: 'Die Datei ist beschädigt oder hat ein unerwartetes Format.',
  missing: 'Die Datei wurde nicht mehr gefunden.',
  write: 'Das Ergebnis konnte nicht gespeichert werden.',
  unsupported: 'Das geht mit dieser Datei nicht.',
  toolmissing: 'Dafür fehlt ein Programm auf diesem Rechner.',
  unknown: 'Unerwarteter Fehler.'
}

function errorText(update: JobUpdate): string {
  const code = update.errorCode ?? 'unknown'
  const base = errorTexts[code]
  if ((code === 'unsupported' || code === 'toolmissing' || code === 'unknown') && update.detail) return update.detail
  return base
}

export function FileRow({ tool, entry, delta = false, keepsHistory = true, onRemove, extra, note, doneLabel = 'Fertig', selected, onSelect }: Props) {
  const app = useApp()
  const { info, update } = entry
  const status = update?.status ?? null
  const cls = `${status === 'running' ? ' is-running' : ''}${status === 'error' ? ' is-error' : ''}${selected ? ' is-selected' : ''}${onSelect ? ' is-clickable' : ''}`
  const out = update?.outputPath ?? null

  let state: ReactNode = null
  let actions: ReactNode
  if (status === 'waiting' || status === 'running') {
    state = (
      <span className={`kf-status ${status === 'running' ? 'kf-status--run' : 'kf-status--wait'}`}>
        {status === 'running' ? <Loader2 className="kf-icon kf-icon--sm kf-spin" aria-hidden="true" /> : <Clock className="kf-icon kf-icon--sm" aria-hidden="true" />}
        {status === 'running' ? 'Läuft' : 'Wartet'}
      </span>
    )
    actions = (
      <IconButton label="Abbrechen" onClick={() => app.cancel(info.id)}>
        <X className="kf-icon kf-icon--sm" />
      </IconButton>
    )
  } else if (status === 'done') {
    state = delta && update?.outputSize != null ? <SizeDelta before={info.size} after={update.outputSize} /> : <span className="kf-status kf-status--ok"><CheckCircle2 className="kf-icon kf-icon--sm" aria-hidden="true" />{doneLabel}</span>
    actions = (
      <>
        {out ? (
          <IconButton label="Im Ordner zeigen" onClick={() => void window.kerf.showInFolder(out)}>
            <FolderOpen className="kf-icon kf-icon--sm" />
          </IconButton>
        ) : null}
        {keepsHistory && out ? (
          <IconButton
            label="Aus dem Verlauf entfernen"
            danger
            onClick={() => app.askForget({ id: info.id, name: info.name, fileName: baseName(out), onDone: onRemove })}
          >
            <Trash2 className="kf-icon kf-icon--sm" />
          </IconButton>
        ) : (
          <IconButton label="Aus der Liste entfernen" onClick={onRemove}>
            <X className="kf-icon kf-icon--sm" />
          </IconButton>
        )}
      </>
    )
  } else if (status === 'nogain' || status === 'larger') {
    state = delta ? <SizeDelta before={info.size} after={update?.outputSize ?? info.size} /> : <span className="kf-status kf-status--wait">Nichts geändert</span>
    actions = (
      <IconButton label="Aus der Liste entfernen" onClick={onRemove}>
        <X className="kf-icon kf-icon--sm" />
      </IconButton>
    )
  } else if (status === 'error') {
    state = (
      <span className="kf-status kf-status--err">
        <AlertTriangle className="kf-icon kf-icon--sm" aria-hidden="true" />
        Fehler
      </span>
    )
    actions = (
      <IconButton label="Entfernen" onClick={onRemove}>
        <X className="kf-icon kf-icon--sm" />
      </IconButton>
    )
  } else if (status === 'cancelled') {
    state = (
      <span className="kf-status kf-status--wait">
        <XCircle className="kf-icon kf-icon--sm" aria-hidden="true" />
        Abgebrochen
      </span>
    )
    actions = (
      <IconButton label="Entfernen" onClick={onRemove}>
        <X className="kf-icon kf-icon--sm" />
      </IconButton>
    )
  } else {
    actions = (
      <IconButton label="Entfernen" onClick={onRemove}>
        <X className="kf-icon kf-icon--sm" />
      </IconButton>
    )
  }

  let text: ReactNode = note ?? null
  if (!text && status === 'error' && update) text = errorText(update)
  else if (!text && status === 'nogain') text = update?.detail ?? 'Schon optimal. Es wurde nichts gespeichert.'
  else if (!text && status === 'larger') text = 'Das Ergebnis wäre größer geworden. Es wurde nichts gespeichert.'
  else if (!text && status === 'done' && update?.detail) text = update.detail
  else if (!text && status === 'running' && update?.step) text = update.step

  const finished = status === 'done' || status === 'nogain' || status === 'larger'
  const sub = !delta && status === 'done' && out ? `→ ${baseName(out)}` : delta && finished ? null : formatBytes(info.size)
  const percent = update?.percent ?? 0

  return (
    <div className={`kf-file${cls}`} onClick={onSelect} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} onKeyDown={onSelect ? (event) => event.key === 'Enter' && onSelect() : undefined}>
      <ExtBadge name={info.name} />
      <div className="kf-file__main">
        <span className="kf-file__name" title={info.path}>
          {info.name}
        </span>
        {sub ? <span className="kf-file__meta">{sub}</span> : null}
      </div>
      {state}
      <div className="kf-file__actions" onClick={(event) => event.stopPropagation()}>
        {extra}
        {actions}
      </div>
      {status === 'running' ? (
        <div className="kf-file__progress">
          <div className="kf-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${info.name}: ${update?.step ?? ''}`}>
            <div className="kf-progress__bar" style={{ width: `${percent}%` }} />
          </div>
          <span className="kf-progress__pct">{percent} %</span>
        </div>
      ) : null}
      {text ? <p className="kf-file__note">{text}</p> : null}
    </div>
  )
}
