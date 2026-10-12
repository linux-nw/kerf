import { FileText, FolderOpen, Trash2 } from 'lucide-react'
import { toolMeta } from '@shared/tools'
import type { HistoryEntry } from '@shared/types'
import { SizeDelta } from '../components/SizeDelta'
import { baseName, ExtBadge, IconButton } from '../components/ui'
import { useApp } from '../context'

const formatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

function Row({ entry }: { entry: HistoryEntry }) {
  const app = useApp()
  const outName = baseName(entry.outputPath)
  const delta = entry.tool === 'compress' && entry.inputSize !== null && entry.outputSize !== null
  return (
    <div className={`kf-file kf-file--history${entry.exists ? '' : ' is-gone'}`}>
      <ExtBadge name={outName} />
      <div className="kf-file__main">
        <span className="kf-file__name" title={entry.outputPath}>
          {outName}
        </span>
        <span className="kf-file__meta">
          {toolMeta(entry.tool).label} · {formatter.format(new Date(entry.time))}
          {entry.summary ? ` · ${entry.summary}` : ''}
        </span>
      </div>
      {delta ? <SizeDelta before={entry.inputSize as number} after={entry.outputSize as number} /> : entry.exists ? <span /> : <span className="kf-status kf-status--warn">Datei nicht mehr da</span>}
      <div className="kf-file__actions">
        <IconButton label="Im Ordner zeigen" disabled={!entry.exists} onClick={() => void window.kerf.showInFolder(entry.outputPath)}>
          <FolderOpen className="kf-icon kf-icon--sm" />
        </IconButton>
        <IconButton label="Aus dem Verlauf entfernen" danger onClick={() => app.askForget({ id: entry.id, name: entry.inputName, fileName: outName })}>
          <Trash2 className="kf-icon kf-icon--sm" />
        </IconButton>
      </div>
    </div>
  )
}

export function HistoryView() {
  const app = useApp()
  return (
    <main className="app__main">
      <header className="app__head">
        <div>
          <h1 className="title-lg app__title">Verlauf</h1>
          <p className="app__sub">Deine letzten Ergebnisse. Einträge entfernen löscht nie eine Datei.</p>
        </div>
        {app.history.length > 0 ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={app.askClearHistory}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Verlauf leeren
          </button>
        ) : null}
      </header>
      <div className="app__scroll">
        {app.history.length === 0 ? (
          <div className="kf-empty">
            <FileText className="kf-icon kf-icon--lg" aria-hidden="true" />
            <p className="kf-empty__title">Noch nichts im Verlauf</p>
            <p className="kf-caption">Sobald Kerf eine Datei fertig bearbeitet hat, steht sie hier.</p>
          </div>
        ) : (
          <div className="app__list" aria-label="Verlauf">
            {app.history.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
