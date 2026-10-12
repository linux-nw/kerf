import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Trash2, X } from 'lucide-react'
import type { JobUpdate } from '@shared/types'
import { useApp } from '../context'
import { baseName, IconButton } from './ui'

export function GroupRow({ update, title, onDismiss }: { update: JobUpdate; title: string; onDismiss: () => void }) {
  const app = useApp()
  const out = update.outputPath
  const active = update.status === 'waiting' || update.status === 'running'
  return (
    <div className={`kf-file kf-file--group${update.status === 'error' ? ' is-error' : ''}${active ? ' is-running' : ''}`}>
      <span className="kf-file__ext" aria-hidden="true">
        {active ? <Loader2 className="kf-icon kf-icon--sm kf-spin" /> : update.status === 'done' ? <CheckCircle2 className="kf-icon kf-icon--sm" /> : <AlertTriangle className="kf-icon kf-icon--sm" />}
      </span>
      <div className="kf-file__main">
        <span className="kf-file__name">{title}</span>
        <span className="kf-file__meta">
          {active ? (update.step ?? 'Läuft') : update.status === 'done' && out ? `→ ${baseName(out)}` : update.status === 'error' ? (update.detail ?? 'Fehler') : update.status === 'cancelled' ? 'Abgebrochen' : (update.detail ?? 'Nichts geändert')}
        </span>
      </div>
      <span />
      <div className="kf-file__actions">
        {active ? (
          <IconButton label="Abbrechen" onClick={() => app.cancel(update.id)}>
            <X className="kf-icon kf-icon--sm" />
          </IconButton>
        ) : (
          <>
            {out ? (
              <IconButton label="Im Ordner zeigen" onClick={() => void window.kerf.showInFolder(out)}>
                <FolderOpen className="kf-icon kf-icon--sm" />
              </IconButton>
            ) : null}
            {update.status === 'done' && out ? (
              <IconButton label="Aus dem Verlauf entfernen" danger onClick={() => app.askForget({ id: update.id, name: title, fileName: baseName(out), onDone: onDismiss })}>
                <Trash2 className="kf-icon kf-icon--sm" />
              </IconButton>
            ) : (
              <IconButton label="Ausblenden" onClick={onDismiss}>
                <X className="kf-icon kf-icon--sm" />
              </IconButton>
            )}
          </>
        )}
      </div>
      {active ? (
        <div className="kf-file__progress">
          <div className="kf-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={update.percent}>
            <div className="kf-progress__bar" style={{ width: `${update.percent}%` }} />
          </div>
          <span className="kf-progress__pct">{update.percent} %</span>
        </div>
      ) : null}
    </div>
  )
}
