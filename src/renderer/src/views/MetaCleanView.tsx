import { Trash2 } from 'lucide-react'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { OutputDir } from '../components/OutputDir'
import { Page } from '../components/Page'
import { useApp } from '../context'
import { isActive, isPending } from '../store'
import { useState } from 'react'

interface CleanData {
  removed: string[]
  hints: string[]
}

export function MetaCleanView() {
  const app = useApp()
  const state = app.state.metaclean
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))

  const start = () => app.run('metaclean', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), { outputDir })

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien bereinigen` : 'Metadaten entfernen'}
      disabled={pending.length === 0}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
      options={<OutputDir value={outputDir} onChange={setOutputDir} />}
    />
  )

  return (
    <Page
      tool="metaclean"
      hasFiles={state.entries.length > 0}
      dropLabel="Dateien zum Bereinigen ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'metaclean' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => {
            const data = entry.update?.status === 'done' ? (entry.update.data as CleanData | null) : null
            const note = data ? (
              <>
                {data.removed.length ? `Entfernt: ${data.removed.join(', ')}.` : 'Es wurde nichts Sensibles gefunden.'}
                {data.hints.length ? ` ${data.hints.join(' ')}` : ''}
                {entry.update?.detail ? ` ${entry.update.detail}` : ''}
              </>
            ) : undefined
            return <FileRow key={entry.info.id} tool="metaclean" entry={entry} note={note} onRemove={() => app.dispatch({ type: 'remove', tool: 'metaclean', id: entry.info.id })} />
          })}
        </div>
      ) : null}
    </Page>
  )
}
