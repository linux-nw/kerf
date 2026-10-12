import { ArrowDown, Check, FileScan, FileText, Image, ShieldCheck, Trash2 } from 'lucide-react'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { OutputDir } from '../components/OutputDir'
import { PasteHint } from '../components/Dropzone'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { Lbl } from '../components/ui'
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

  const startView = (
    <div className="kf-start kf-start--tight">
      <div className="kf-split kf-split--halves">
        <ToolDrop tool="metaclean" icon={FileScan} label="Dateien hier ablegen" hint={<>JPG, PNG, PDF, DOCX und mehr.<br /><PasteHint /></>} />
        <div className="kf-cmp" aria-hidden="true">
          <div className="kf-half">
            <Lbl>Vorher</Lbl>
            <div className="kf-chips">
              {['GPS-Ort', 'Kameramodell', 'Aufnahmezeit', 'Autor', 'Programm', 'Benutzername'].map((item) => (
                <span key={item} className="kf-struck">{item}</span>
              ))}
            </div>
          </div>
          <div className="kf-mid">
            <span>
              <ArrowDown className="kf-icon kf-icon--sm" />
            </span>
          </div>
          <div className="kf-half kf-half--after">
            <Lbl>Nachher</Lbl>
            <div className="kf-clean">
              <ShieldCheck className="kf-icon" />
              Keine Spuren mehr
            </div>
          </div>
        </div>
      </div>
      <div className="kf-facts">
        <div className="kf-fact">
          <Image className="kf-icon" aria-hidden="true" />
          <div>
            <b>Bild bleibt gleich</b>
            <span>Keine neue Komprimierung, keine Qualitätsverluste.</span>
          </div>
        </div>
        <div className="kf-fact">
          <FileText className="kf-icon" aria-hidden="true" />
          <div>
            <b>Neue Datei</b>
            <span>Das Ergebnis heißt „name.bereinigt“. Das Original bleibt.</span>
          </div>
        </div>
        <div className="kf-fact">
          <Check className="kf-icon" aria-hidden="true" />
          <div>
            <b>Wird geprüft</b>
            <span>Kerf liest das Ergebnis nochmal und meldet Restspuren.</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Page
      tool="metaclean"
      hasFiles={state.entries.length > 0}
      start={startView}
      subtitle="Spuren aus Fotos und Dokumenten löschen, bevor du sie teilst."
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
