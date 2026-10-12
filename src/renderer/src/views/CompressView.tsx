import { useMemo, useState } from 'react'
import { Check, Settings2, Shrink, Trash2 } from 'lucide-react'
import { parseTargetBytes } from '@shared/format'
import type { CompressOptions, PresetId } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { Field, Lbl, Seg, Switch } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const PRESETS: Array<{ id: PresetId; label: string; title: string }> = [
  { id: 'email', label: 'E-Mail', title: 'Klein genug zum Versenden. Bilder bis 1600 Pixel' },
  { id: 'standard', label: 'Standard', title: 'Gute Balance aus Größe und Qualität' },
  { id: 'print', label: 'Druck', title: 'Hohe Qualität für den Druck' },
  { id: 'target', label: 'Zielgröße', title: 'Kerf sucht die beste Qualität unter deiner Grenze' }
]

const CARDS: Array<{ id: PresetId; title: string; text: string; left: number | null }> = [
  { id: 'email', title: 'E-Mail', text: 'Stark verkleinert. Gut lesbar am Bildschirm, passt in jeden Anhang.', left: 12 },
  { id: 'standard', title: 'Standard', text: 'Gute Balance aus Größe und Qualität für fast alles.', left: 35 },
  { id: 'print', title: 'Druck', text: 'Nur das Überflüssige weg. Bilder bleiben scharf.', left: 68 }
]

export function CompressView() {
  const app = useApp()
  const state = app.state.compress
  const [options, setOptions] = useState<CompressOptions>({ preset: 'standard', targetBytes: null, stripMetadata: false, outputDir: null })
  const [targetText, setTargetText] = useState('500')
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB')
  const [open, setOpen] = useState(false)

  const targetBytes = useMemo(() => parseTargetBytes(targetText, targetUnit), [targetText, targetUnit])
  const targetInvalid = options.preset === 'target' && targetBytes === null
  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))

  const start = () => {
    app.run('compress', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), { ...options, targetBytes: options.preset === 'target' ? targetBytes : null })
  }

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien komprimieren` : 'Komprimieren'}
      disabled={pending.length === 0 || targetInvalid}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
      options={
        <>
          <Seg label="Stärke" value={options.preset} items={PRESETS} onChange={(preset) => setOptions({ ...options, preset })} />
          {options.preset === 'target' ? (
            <div className="kf-target">
              <Field label="Unter">
                <span className={`kf-input kf-input--mono${targetInvalid ? ' is-error' : ''}`}>
                  <input inputMode="decimal" value={targetText} onChange={(event) => setTargetText(event.target.value)} aria-label="Zielgröße" />
                  <select className="kf-unit" value={targetUnit} onChange={(event) => setTargetUnit(event.target.value as 'KB' | 'MB')} aria-label="Einheit">
                    <option>KB</option>
                    <option>MB</option>
                  </select>
                </span>
              </Field>
            </div>
          ) : null}
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
          {['PDF', 'JPG', 'PNG', 'WebP', 'AVIF', 'DOCX', 'PPTX', 'XLSX'].map((format) => (
            <span key={format}>{format}</span>
          ))}
        </div>
      </ToolDrop>
      <div className="kf-sec">
        <Lbl>Wie stark soll es schrumpfen?</Lbl>
        <div className="kf-cards4" role="radiogroup" aria-label="Stärke">
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
              <span className="kf-bars" aria-hidden="true">
                <span className="kf-bb is-orig"><i /></span>
                <span className="kf-bb"><i style={{ width: `${card.left}%` }} /></span>
                <span className="kf-pct"><span>Typisch übrig</span><b>~ {card.left} %</b></span>
              </span>
            </button>
          ))}
          <div className={`kf-card kf-card--tight${options.preset === 'target' ? ' is-on' : ''}`} onClick={() => setOptions({ ...options, preset: 'target' })}>
            <div className="kf-card__hd">
              <h3>Zielgröße</h3>
              {options.preset === 'target' ? (
                <span className="kf-chk">
                  <Check className="kf-icon" aria-hidden="true" />
                </span>
              ) : null}
            </div>
            <p className="kf-fix">Du nennst die Grenze, Kerf probiert Stufen durch.</p>
            <span className={`kf-input kf-input--mono${targetInvalid ? ' is-error' : ''}`}>
              <span className="kf-muted">unter</span>
              <input inputMode="decimal" value={targetText} onFocus={() => setOptions({ ...options, preset: 'target' })} onChange={(event) => setTargetText(event.target.value)} aria-label="Zielgröße" />
              <select className="kf-unit" value={targetUnit} onChange={(event) => setTargetUnit(event.target.value as 'KB' | 'MB')} aria-label="Einheit">
                <option>KB</option>
                <option>MB</option>
              </select>
            </span>
          </div>
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
