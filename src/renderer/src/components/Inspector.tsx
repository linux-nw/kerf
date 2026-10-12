import { FolderOpen, Play, Square } from 'lucide-react'
import type { CompressOptions, PresetId } from '@shared/types'

const presets: { id: PresetId; title: string; desc: string; detail: string }[] = [
  { id: 'email', title: 'E-Mail', desc: 'So klein wie sinnvoll möglich.', detail: '96 dpi, starke Kompression' },
  { id: 'standard', title: 'Standard', desc: 'Gute Lesbarkeit, deutlich kleiner.', detail: '150 dpi, ausgewogen' },
  { id: 'print', title: 'Druck', desc: 'Kaum sichtbarer Unterschied.', detail: '300 dpi, hohe Qualität' },
  { id: 'target', title: 'Zielgröße', desc: 'Probiert Stufen durch, bis es passt.', detail: 'Du nennst das Limit' }
]

interface Props {
  options: CompressOptions
  targetText: string
  targetUnit: 'KB' | 'MB'
  targetInvalid: boolean
  running: boolean
  canStart: boolean
  onOptions: (next: Partial<CompressOptions>) => void
  onTargetText: (value: string) => void
  onTargetUnit: (unit: 'KB' | 'MB') => void
  onPickOutput: () => void
  onStart: () => void
  onCancelAll: () => void
}

export function Inspector(props: Props) {
  const { options, running } = props
  return (
    <aside className="app__aside" aria-label="Einstellungen">
      <div className="app__aside-scroll">
      <h2 className="title-md">Komprimieren</h2>

      <fieldset className="app__group" disabled={running} style={{ minWidth: 0 }}>
        <legend className="kf-overline" style={{ padding: 0, marginBottom: 'var(--space-2)' }}>
          Preset
        </legend>
        <div className="app__presets" role="radiogroup" aria-label="Preset">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={options.preset === preset.id}
              className={`kf-preset${options.preset === preset.id ? ' is-selected' : ''}`}
              onClick={() => props.onOptions({ preset: preset.id })}
            >
              <span className="kf-preset__head">
                <span className="kf-preset__title">{preset.title}</span>
                <span className="kf-radio" aria-hidden="true" />
              </span>
              <span className="kf-preset__desc">{preset.desc}</span>
              <span className="kf-preset__result">{preset.detail}</span>
            </button>
          ))}
        </div>

        {options.preset === 'target' ? (
          <div className="app__target">
            <div className="kf-field">
              <label className="kf-field__label" htmlFor="target-size">
                Höchstens
              </label>
              <div className={`kf-input kf-input--mono${props.targetInvalid ? ' is-error' : ''}`}>
                <input
                  id="target-size"
                  inputMode="decimal"
                  autoComplete="off"
                  value={props.targetText}
                  aria-invalid={props.targetInvalid}
                  aria-describedby="target-help"
                  onChange={(event) => props.onTargetText(event.target.value)}
                />
              </div>
              <span id="target-help" className={`kf-field__help${props.targetInvalid ? ' is-error' : ''}`}>
                {props.targetInvalid ? 'Gib eine Zahl größer 0 ein, zum Beispiel 2,5.' : 'Pro Datei. Wird die Grenze nicht erreicht, bekommst du den besten Versuch.'}
              </span>
            </div>
            <div className="kf-seg" role="radiogroup" aria-label="Einheit">
              {(['KB', 'MB'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  role="radio"
                  aria-checked={props.targetUnit === unit}
                  className={`kf-seg__item${props.targetUnit === unit ? ' is-active' : ''}`}
                  onClick={() => props.onTargetUnit(unit)}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="app__group" disabled={running} style={{ minWidth: 0 }}>
        <legend className="kf-overline" style={{ padding: 0, marginBottom: 'var(--space-2)' }}>
          Optionen
        </legend>
        <button
          type="button"
          role="switch"
          aria-checked={options.stripMetadata}
          className={`kf-switch${options.stripMetadata ? ' is-on' : ''}`}
          onClick={() => props.onOptions({ stripMetadata: !options.stripMetadata })}
        >
          <span className="kf-switch__box" aria-hidden="true" />
          Metadaten entfernen
        </button>
        <p className="kf-field__help" style={{ margin: 0 }}>
          Entfernt Autor, Programm und Zeitstempel aus der Datei.
        </p>
      </fieldset>

      <fieldset className="app__group" disabled={running} style={{ minWidth: 0 }}>
        <legend className="kf-overline" style={{ padding: 0, marginBottom: 'var(--space-2)' }}>
          Ausgabe
        </legend>
        <p className="app__hint">Das Original bleibt unverändert. Das Ergebnis heißt Name.klein.pdf.</p>
        <span className="app__path">{options.outputDir ?? 'Neben der Originaldatei'}</span>
        <div className="kf-row">
          <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={props.onPickOutput}>
            <FolderOpen className="kf-icon kf-icon--sm" aria-hidden="true" />
            Ordner wählen
          </button>
          {options.outputDir ? (
            <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => props.onOptions({ outputDir: null })}>
              Zurücksetzen
            </button>
          ) : null}
        </div>
      </fieldset>

      </div>

      <div className="app__aside-foot">
        {running ? (
          <button type="button" className="kf-btn kf-btn--danger kf-btn--lg" onClick={props.onCancelAll}>
            <Square className="kf-icon kf-icon--sm" aria-hidden="true" />
            Alles abbrechen
          </button>
        ) : (
          <button type="button" className="kf-btn kf-btn--primary kf-btn--lg" disabled={!props.canStart} onClick={props.onStart}>
            <Play className="kf-icon kf-icon--sm" aria-hidden="true" />
            Komprimieren
          </button>
        )}
      </div>
    </aside>
  )
}
