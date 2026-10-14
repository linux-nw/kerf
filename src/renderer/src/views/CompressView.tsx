import { useState } from 'react'
import { Check, Settings2, Shrink, Trash2 } from 'lucide-react'
import type { CompressOptions, PresetId } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { Field, Lbl, Seg, Switch } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const PRESETS: Array<{ id: PresetId; label: string; title: string }> = [
  { id: 'kompakt', label: 'Kompakt', title: 'Wie die üblichen Programme: Bilder auf 150 dpi, Schriften und Struktur aufgeräumt' },
  { id: 'winzig', label: 'Winzig', title: 'So klein wie technisch möglich, ohne dass man es sieht' }
]

const CARDS: Array<{ id: PresetId; title: string; text: string; points: string[] }> = [
  {
    id: 'kompakt',
    title: 'Kompakt',
    text: 'Wie die üblichen Programme. Für fast alles die richtige Wahl.',
    points: ['Bilder auf etwa 150 dpi', 'Schriften auf genutzte Zeichen gekürzt', 'Duplikate und Ballast entfernt']
  },
  {
    id: 'winzig',
    title: 'Winzig',
    text: 'So klein wie technisch möglich. Kerf misst bei jedem Bild, wie weit es ohne sichtbaren Unterschied geht.',
    points: ['Qualität pro Bild per Messung statt fester Zahl', 'Graue und Schwarz-Weiß-Bilder schlanker gespeichert', 'Alles aus Kompakt, nur gründlicher']
  }
]

export function CompressView() {
  const app = useApp()
  const state = app.state.compress
  const [options, setOptions] = useState<CompressOptions>({ preset: 'kompakt', stripMetadata: false, outputDir: null })
  const [open, setOpen] = useState(false)

  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))

  const start = () => {
    app.run('compress', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), options)
  }

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien komprimieren` : 'Komprimieren'}
      disabled={pending.length === 0}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
      options={
        <>
          <Seg label="Stärke" value={options.preset} items={PRESETS} onChange={(preset) => setOptions({ ...options, preset })} />
          <div className="kf-pop">
            <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>
              <Settings2 className="kf-icon kf-icon--sm" aria-hidden="true" />
              Optionen
            </button>
            {open ? (
              <div className="kf-pop__panel" role="dialog" aria-label="Weitere Optionen">
                <Switch checked={options.stripMetadata} onChange={(stripMetadata) => setOptions({ ...options, stripMetadata })}>
                  Metadaten entfernen
                </Switch>
                <div className="kf-pop__row">
                  <span className="kf-caption">{options.outputDir ? options.outputDir : 'Ergebnis neben das Original'}</span>
                  <div className="kf-row">
                    <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void window.kerf.pickOutputDir().then((dir) => dir && setOptions({ ...options, outputDir: dir }))}>
                      Ordner wählen
                    </button>
                    {options.outputDir ? (
                      <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => setOptions({ ...options, outputDir: null })}>
                        Zurücksetzen
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      }
    />
  )

  const startView = (
    <div className="kf-start kf-start--tight">
      <ToolDrop tool="compress" layout="row" icon={Shrink} label="Dateien hier ablegen">
        <div className="kf-fmt kf-drop__extra" aria-label="Unterstützte Formate">
          {['PDF', 'JPG', 'PNG', 'WebP', 'AVIF', 'GIF', 'TIFF', 'SVG', 'DOCX', 'PPTX', 'XLSX', 'ODF', 'EPUB'].map((format) => (
            <span key={format}>{format}</span>
          ))}
        </div>
      </ToolDrop>
      <div className="kf-sec">
        <Lbl>Wie stark soll es schrumpfen?</Lbl>
        <div className="kf-cards2" role="radiogroup" aria-label="Stärke">
          {CARDS.map((card) => (
            <button key={card.id} type="button" role="radio" aria-checked={options.preset === card.id} className={`kf-card kf-card--tight${options.preset === card.id ? ' is-on' : ''}`} onClick={() => setOptions({ ...options, preset: card.id })}>
              <span className="kf-card__hd">
                <h3>{card.title}</h3>
                {options.preset === card.id ? (
                  <span className="kf-chk">
                    <Check className="kf-icon" aria-hidden="true" />
                  </span>
                ) : null}
              </span>
              <p className="kf-fix">{card.text}</p>
              <ul className="kf-points">
                {card.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <Page
      tool="compress"
      hasFiles={state.entries.length > 0}
      start={startView}
      subtitle="Dateien kleiner machen, ohne das Original anzufassen."
      dropLabel="Dateien zum Komprimieren ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'compress' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => (
            <FileRow key={entry.info.id} tool="compress" entry={entry} delta onRemove={() => app.dispatch({ type: 'remove', tool: 'compress', id: entry.info.id })} />
          ))}
        </div>
      ) : null}
    </Page>
  )
}
