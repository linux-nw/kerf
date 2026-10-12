import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, Clock, Copy, Download, FileSearch, MapPin, ShieldOff, Trash2, User, X, type LucideIcon } from 'lucide-react'
import { formatBytes } from '@shared/format'
import { extensionOf, CLEANABLE } from '@shared/tools'
import type { MetaReport } from '@shared/types'
import { PasteHint } from '../components/Dropzone'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { copyText, ExtBadge, IconButton, Lbl } from '../components/ui'
import { useApp } from '../context'

interface Loaded {
  report?: MetaReport
  error?: string
}

const FINDS: Array<{ icon: LucideIcon; title: string; text: string; rows: Array<[string, string]> }> = [
  { icon: MapPin, title: 'Ort', text: 'GPS-Koordinaten, wo ein Foto entstanden ist.', rows: [['Breite', '47.7811'], ['Länge', '9.6100']] },
  { icon: Camera, title: 'Kamera', text: 'Gerät, Objektiv, Belichtung und Aufnahmezeit.', rows: [['Modell', 'Pixel 9 Pro'], ['Zeit', '12.07.2026']] },
  { icon: User, title: 'Person', text: 'Autor, Firma und Benutzername in Dokumenten.', rows: [['Autor', 'Max Muster'], ['Firma', 'Muster GmbH']] },
  { icon: Clock, title: 'Verlauf', text: 'Programm, Version und Bearbeitungsdatum.', rows: [['Programm', 'Word 16.0'], ['Geändert', '03.10.2026']] }
]

function reportText(report: MetaReport): string {
  const lines = [`${report.name} (${report.kind}, ${formatBytes(report.size)})`]
  for (const group of report.groups) {
    lines.push('', group.title)
    for (const item of group.items) lines.push(`${item.key}: ${item.value}`)
  }
  return lines.join('\n')
}

export function MetaReadView() {
  const app = useApp()
  const state = app.state.metaread
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    for (const entry of state.entries) {
      if (loaded[entry.info.id]) continue
      setLoaded((current) => ({ ...current, [entry.info.id]: {} }))
      window.kerf
        .readMetadata(entry.info.path)
        .then((report) => setLoaded((current) => ({ ...current, [entry.info.id]: { report } })))
        .catch((error: unknown) => setLoaded((current) => ({ ...current, [entry.info.id]: { error: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Die Datei konnte nicht gelesen werden' } })))
    }
  }, [state.entries, loaded])

  useEffect(() => {
    if (!selected || !state.entries.some((entry) => entry.info.id === selected)) setSelected(state.entries[0]?.info.id ?? null)
  }, [state.entries, selected])

  const current = state.entries.find((entry) => entry.info.id === selected) ?? null
  const report = current ? loaded[current.info.id]?.report : undefined
  const failure = current ? loaded[current.info.id]?.error : undefined

  const groups = useMemo(() => {
    if (!report) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return report.groups
    return report.groups
      .map((group) => ({ ...group, items: group.items.filter((item) => `${item.key} ${item.value}`.toLowerCase().includes(needle)) }))
      .filter((group) => group.items.length > 0)
  }, [report, query])

  const toClean = async () => {
    if (!current) return
    const result = await window.kerf.addPaths('metaclean', [current.info.path])
    app.receive('metaclean', result)
    if (result.files.length > 0) app.go('metaclean')
    else setInfo(`.${extensionOf(current.info.path)} kann Kerf nicht bereinigen. Unterstützt: ${CLEANABLE.join(', ')}`)
  }

  const save = async () => {
    if (!report) return
    await window.kerf.saveText(`${report.name}.metadaten.txt`, reportText(report))
  }

  const startView = (
    <div className="kf-start kf-start--tight">
      <ToolDrop tool="metaread" layout="row" fixed icon={FileSearch} label="Eine Datei zum Ansehen ablegen" hint={<>Foto, PDF oder Office-Datei. <PasteHint /></>} />
      <div className="kf-sec" style={{ flex: 1, minHeight: 0 }}>
        <Lbl>Das findet Kerf</Lbl>
        <div className="kf-rep">
          {FINDS.map((item) => (
            <div key={item.title} className="kf-card kf-k">
              <span className="kf-ib">
                <item.icon className="kf-icon" aria-hidden="true" />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <div className="kf-rows" aria-hidden="true">
                {item.rows.map(([key, value]) => (
                  <div key={key}>
                    {key}
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="kf-callout kf-callout--warn">
          <AlertTriangle className="kf-icon" aria-hidden="true" />
          Heikle Felder wie Ort und Autor markiert Kerf farbig. Entfernen kannst du sie im nächsten Bereich.
        </div>
      </div>
    </div>
  )

  return (
    <Page
      tool="metaread"
      hasFiles={state.entries.length > 0}
      start={startView}
      subtitle="Sieh nach, was in deinen Dateien steckt, bevor du sie weitergibst."
      dropLabel="Datei zum Ansehen ablegen"
      headRight={
        state.entries.length > 0 ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'metaread' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {info ? <div className="kf-note kf-note--warning"><span className="kf-note__text">{info}</span></div> : null}
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => {
            const data = loaded[entry.info.id]
            return (
              <div key={entry.info.id} className={`kf-file kf-file--meta is-clickable${selected === entry.info.id ? ' is-selected' : ''}`} role="button" tabIndex={0} onClick={() => setSelected(entry.info.id)} onKeyDown={(event) => event.key === 'Enter' && setSelected(entry.info.id)}>
                <ExtBadge name={entry.info.name} />
                <div className="kf-file__main">
                  <span className="kf-file__name" title={entry.info.path}>{entry.info.name}</span>
                  <span className="kf-file__meta">{formatBytes(entry.info.size)}</span>
                </div>
                {data?.report ? (
                  data.report.sensitive.length > 0 ? (
                    <span className="kf-status kf-status--warn">
                      <AlertTriangle className="kf-icon kf-icon--sm" aria-hidden="true" />
                      {data.report.sensitive.length} sensible {data.report.sensitive.length === 1 ? 'Angabe' : 'Angaben'}
                    </span>
                  ) : (
                    <span className="kf-status kf-status--ok">Nichts Sensibles</span>
                  )
                ) : data?.error ? (
                  <span className="kf-status kf-status--err">Fehler</span>
                ) : (
                  <span className="kf-status kf-status--wait">Liest …</span>
                )}
                <div className="kf-file__actions" onClick={(event) => event.stopPropagation()}>
                  <IconButton label="Entfernen" onClick={() => app.dispatch({ type: 'remove', tool: 'metaread', id: entry.info.id })}>
                    <X className="kf-icon kf-icon--sm" />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {failure ? <div className="kf-note kf-note--danger"><span className="kf-note__text">{failure}</span></div> : null}

      {report ? (
        <section className="kf-report" aria-label={`Metadaten von ${report.name}`}>
          <div className="kf-report__head">
            <div>
              <h2 className="title-md kf-report__title">{report.name}</h2>
              <p className="kf-caption">{report.kind} · {formatBytes(report.size)}</p>
            </div>
            <div className="kf-row">
              <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void copyText(reportText(report))}>
                <Copy className="kf-icon kf-icon--sm" aria-hidden="true" />
                Kopieren
              </button>
              <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void save()}>
                <Download className="kf-icon kf-icon--sm" aria-hidden="true" />
                Als Text speichern
              </button>
              {report.sensitive.length > 0 ? (
                <button type="button" className="kf-btn kf-btn--primary kf-btn--sm" onClick={() => void toClean()}>
                  <ShieldOff className="kf-icon kf-icon--sm" aria-hidden="true" />
                  Metadaten entfernen
                </button>
              ) : null}
            </div>
          </div>
          {report.sensitive.length > 0 ? (
            <div className="kf-report__chips" aria-label="Sensible Angaben">
              {report.sensitive.map((item) => (
                <span key={item} className="kf-flag">{item}</span>
              ))}
            </div>
          ) : null}
          {report.hints.length > 0 ? (
            <ul className="kf-report__hints">
              {report.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          ) : null}
          <span className="kf-input kf-report__search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Angaben durchsuchen" aria-label="Angaben durchsuchen" />
          </span>
          {groups.length === 0 ? <p className="kf-caption">{report.groups.length === 0 ? 'In dieser Datei wurden keine Metadaten gefunden.' : 'Nichts gefunden.'}</p> : null}
          {groups.map((group) => (
            <div key={group.title} className="kf-report__group">
              <h3 className="kf-overline">{group.title}</h3>
              <dl className="kf-report__list">
                {group.items.map((item) => (
                  <div key={`${group.title}-${item.key}`} className="kf-report__item">
                    <dt>{item.key}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ) : null}
    </Page>
  )
}
