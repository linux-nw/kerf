import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Droplets, Hash, Info, LayoutGrid, Merge, RotateCcw, RotateCw, Scissors, Trash2, Undo2, type LucideIcon } from 'lucide-react'
import type { PageEdit, PdfMode, PdfOptions } from '@shared/types'
import { extensionOf } from '@shared/tools'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { GroupRow } from '../components/GroupRow'
import { OutputDir } from '../components/OutputDir'
import { PdfArt } from '../components/art'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { Field, IconButton, Lbl, Notice, Switch } from '../components/ui'
import { useApp } from '../context'
import { usePdfInfo, usePdfThumbs } from '../hooks/usePdfThumbs'
import { isActive, isPending } from '../store'

const MODES: Array<{ id: PdfMode; label: string; title: string }> = [
  { id: 'merge', label: 'Zusammenführen', title: 'PDFs und Bilder zu einer Datei verbinden' },
  { id: 'split', label: 'Teilen', title: 'Eine PDF in mehrere aufteilen' },
  { id: 'pages', label: 'Seiten ordnen', title: 'Seiten ordnen, drehen und löschen' },
  { id: 'watermark', label: 'Wasserzeichen', title: 'Text quer über jede Seite legen' },
  { id: 'numbers', label: 'Seitenzahlen', title: 'Seitenzahlen einfügen' }
]

const TILES: Array<{ id: PdfMode; title: string; text: string; code: string; wide?: boolean }> = [
  { id: 'merge', title: 'Zusammenführen', text: 'Mehrere PDFs zu einer Datei verbinden. Die Reihenfolge ziehst du selbst.', code: '3 PDFs → 1 PDF' },
  { id: 'split', title: 'Teilen', text: 'Eine PDF zerlegen: nach Seitenbereichen oder jede Seite einzeln.', code: '1 PDF → mehrere PDFs' },
  { id: 'pages', title: 'Seiten ordnen', text: 'Seiten verschieben, drehen oder löschen. Du siehst jede Seite als Vorschau.', code: 'Seiten umsortieren' },
  { id: 'watermark', title: 'Wasserzeichen', text: 'Text quer über jede Seite legen, zum Beispiel „Entwurf“ oder „Vertraulich“. Das Original bleibt unverändert.', code: 'Text auf allen Seiten', wide: true },
  { id: 'numbers', title: 'Seitenzahlen', text: 'Jede Seite bekommt eine Nummer. Format und Position wählst du, auch „Seite 1 von 12“.', code: '1, 2, 3 … automatisch', wide: true }
]

const DROP: Record<PdfMode, { icon: LucideIcon; title: string; hint: string }> = {
  merge: { icon: Merge, title: 'PDFs hier ablegen', hint: 'Mindestens zwei Dateien, auch Bilder.' },
  split: { icon: Scissors, title: 'Eine PDF hier ablegen', hint: 'Sie wird in mehrere Dateien zerlegt.' },
  pages: { icon: LayoutGrid, title: 'Eine PDF hier ablegen', hint: 'Danach siehst du jede Seite als Vorschau.' },
  watermark: { icon: Droplets, title: 'PDFs hier ablegen', hint: 'Der Text kommt auf jede Seite.' },
  numbers: { icon: Hash, title: 'PDFs hier ablegen', hint: 'Jede Seite bekommt ihre Nummer.' }
}

const HOW: Record<PdfMode, { steps: Array<[string, string]>; result: string }> = {
  merge: {
    steps: [['PDFs hineinziehen', 'Beliebig viele, auch aus verschiedenen Ordnern.'], ['Reihenfolge festlegen', 'Dateien in der Liste nach oben oder unten schieben.'], ['Zusammenführen', 'Kerf speichert eine neue PDF neben der ersten Datei.']],
    result: 'Rechnung.zusammen.pdf'
  },
  split: {
    steps: [['PDF hineinziehen', 'Eine oder mehrere, jede wird einzeln geteilt.'], ['Bereiche festlegen', 'Zum Beispiel 1-3, 5 oder jede Seite einzeln.'], ['Teilen', 'Die Teile landen in einem neuen Ordner neben dem Original.']],
    result: 'Rechnung_Teile/'
  },
  pages: {
    steps: [['PDF hineinziehen', 'Du siehst alle Seiten als kleine Vorschau.'], ['Seiten bearbeiten', 'Verschieben, drehen oder löschen, wie du es brauchst.'], ['Übernehmen', 'Kerf speichert eine neue PDF, das Original bleibt.']],
    result: 'Rechnung.bearbeitet.pdf'
  },
  watermark: {
    steps: [['PDFs hineinziehen', 'Eine oder mehrere auf einmal.'], ['Text und Look wählen', 'Zum Beispiel ENTWURF, mit Größe und Sichtbarkeit.'], ['Einfügen', 'Kerf speichert neue Dateien, die Originale bleiben.']],
    result: 'Rechnung.wasserzeichen.pdf'
  },
  numbers: {
    steps: [['PDFs hineinziehen', 'Eine oder mehrere auf einmal.'], ['Format wählen', 'Zum Beispiel „Seite 1 von 12“, Position und Startzahl.'], ['Einfügen', 'Kerf speichert neue Dateien, die Originale bleiben.']],
    result: 'Rechnung.nummeriert.pdf'
  }
}

const POSITIONS: Array<{ id: PdfOptions['numberPosition']; label: string }> = [
  { id: 'bottom-center', label: 'Unten Mitte' },
  { id: 'bottom-right', label: 'Unten rechts' },
  { id: 'bottom-left', label: 'Unten links' },
  { id: 'top-center', label: 'Oben Mitte' },
  { id: 'top-right', label: 'Oben rechts' },
  { id: 'top-left', label: 'Oben links' }
]

function PageGrid({ path, edits, onChange }: { path: string; edits: PageEdit[]; onChange: (next: PageEdit[]) => void }) {
  const { info } = usePdfInfo(path)
  const thumbs = usePdfThumbs(path, info?.pages ?? 0, 200)
  const total = info?.pages ?? 0

  useEffect(() => {
    if (info && edits.length === 0) onChange(Array.from({ length: info.pages }, (_, index) => ({ source: index + 1, rotation: 0 })))
  }, [info, edits.length, onChange])

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= edits.length) return
    const next = [...edits]
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    onChange(next)
  }
  const rotate = (index: number, delta: number) => onChange(edits.map((edit, position) => (position === index ? { ...edit, rotation: (((edit.rotation + delta) % 360) + 360) % 360 } : edit)))
  const remove = (index: number) => onChange(edits.filter((_, position) => position !== index))
  const reset = () => onChange(Array.from({ length: total }, (_, index) => ({ source: index + 1, rotation: 0 })))

  return (
    <section className="kf-grid" aria-label="Seiten">
      <div className="kf-grid__head">
        <span className="kf-caption">
          {edits.length} von {total} Seiten
        </span>
        <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={reset}>
          <Undo2 className="kf-icon kf-icon--sm" aria-hidden="true" />
          Zurücksetzen
        </button>
      </div>
      <div className="kf-grid__cells">
        {edits.map((edit, index) => (
          <figure key={`${edit.source}-${index}`} className="kf-cell">
            <div className="kf-cell__thumb">
              {thumbs[edit.source] ? <img src={thumbs[edit.source]} alt={`Seite ${edit.source}`} style={{ transform: `rotate(${edit.rotation}deg)` }} /> : <span className="kf-caption">…</span>}
            </div>
            <figcaption className="kf-cell__cap">
              <span className="kf-mono">{index + 1}</span>
              {edit.source !== index + 1 ? <span className="kf-caption">(war {edit.source})</span> : null}
            </figcaption>
            <div className="kf-cell__tools">
              <IconButton label="Nach links schieben" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowLeft className="kf-icon kf-icon--sm" />
              </IconButton>
              <IconButton label="Links drehen" onClick={() => rotate(index, -90)}>
                <RotateCcw className="kf-icon kf-icon--sm" />
              </IconButton>
              <IconButton label="Rechts drehen" onClick={() => rotate(index, 90)}>
                <RotateCw className="kf-icon kf-icon--sm" />
              </IconButton>
              <IconButton label="Seite löschen" danger onClick={() => remove(index)}>
                <Trash2 className="kf-icon kf-icon--sm" />
              </IconButton>
              <IconButton label="Nach rechts schieben" disabled={index === edits.length - 1} onClick={() => move(index, 1)}>
                <ArrowRight className="kf-icon kf-icon--sm" />
              </IconButton>
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}

export function PdfView() {
  const app = useApp()
  const state = app.state.pdf
  const [mode, setMode] = useState<PdfMode>('merge')
  const [chosen, setChosen] = useState(false)
  const [splitEvery, setSplitEvery] = useState(false)
  const [ranges, setRanges] = useState('')
  const [watermark, setWatermark] = useState('ENTWURF')
  const [opacity, setOpacity] = useState(0.2)
  const [size, setSize] = useState(72)
  const [format, setFormat] = useState('Seite {n} von {total}')
  const [position, setPosition] = useState<PdfOptions['numberPosition']>('bottom-center')
  const [start, setStart] = useState(1)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [edits, setEdits] = useState<PageEdit[]>([])
  const [active, setActive] = useState<string | null>(null)

  const pdfs = state.entries.filter((entry) => extensionOf(entry.info.path) === 'pdf')
  const pending = state.entries.filter(isPending)
  const pendingPdfs = pending.filter((entry) => extensionOf(entry.info.path) === 'pdf')
  const running = state.entries.some((entry) => isActive(entry.update)) || isActive(state.group)
  const activeEntry = pdfs.find((entry) => entry.info.id === active) ?? pdfs[0] ?? null

  useEffect(() => {
    setEdits([])
  }, [activeEntry?.info.path])

  const jobsFor = useMemo(() => (mode === 'merge' ? pending : mode === 'pages' ? (activeEntry ? [activeEntry] : []) : pendingPdfs), [mode, pending, pendingPdfs, activeEntry])
  const rangeProblem = mode === 'split' && !splitEvery && ranges.trim() === ''
  const mergeProblem = mode === 'merge' && pending.length < 2
  const watermarkProblem = mode === 'watermark' && watermark.trim() === ''

  const run = () => {
    const options: Partial<PdfOptions> & { mode: PdfMode } = {
      mode,
      outputDir,
      splitEvery,
      splitRanges: ranges,
      pages: edits,
      watermarkText: watermark,
      watermarkOpacity: opacity,
      watermarkSize: size,
      numberFormat: format,
      numberPosition: position,
      numberStart: start
    }
    if (mode === 'merge') {
      const id = crypto.randomUUID()
      app.run('pdf', [], [{ id, paths: pending.map((entry) => entry.info.path) }], options, id)
      return
    }
    app.run('pdf', jobsFor.map((entry) => entry.info.id), jobsFor.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), options)
  }

  const labels: Record<PdfMode, string> = {
    merge: 'Zusammenfügen',
    split: jobsFor.length > 1 ? `${jobsFor.length} PDFs teilen` : 'Teilen',
    pages: 'Seiten übernehmen',
    watermark: 'Wasserzeichen einfügen',
    numbers: 'Seitenzahlen einfügen'
  }

  const bar = (
    <ActionBar
      label={labels[mode]}
      disabled={jobsFor.length === 0 || rangeProblem || mergeProblem || watermarkProblem || (mode === 'pages' && edits.length === 0)}
      running={running}
      onStart={run}
      onCancel={() => {
        state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))
        if (state.groupId) app.cancel(state.groupId)
      }}
      options={
        <>
          {mode === 'split' ? (
            <>
              <Switch checked={splitEvery} onChange={setSplitEvery}>
                Jede Seite einzeln
              </Switch>
              {!splitEvery ? (
                <Field label="Seitenbereiche" help="Zum Beispiel 1-3, 5, 7-">
                  <span className="kf-input kf-input--mono">
                    <input value={ranges} onChange={(event) => setRanges(event.target.value)} placeholder="1-3, 5, 7-" aria-label="Seitenbereiche" />
                  </span>
                </Field>
              ) : null}
            </>
          ) : null}
          {mode === 'watermark' ? (
            <>
              <Field label="Text">
                <span className="kf-input">
                  <input value={watermark} onChange={(event) => setWatermark(event.target.value)} aria-label="Text des Wasserzeichens" />
                </span>
              </Field>
              <label className="kf-inline">
                <span className="kf-caption">Größe {size}</span>
                <input type="range" min={20} max={160} value={size} onChange={(event) => setSize(Number(event.target.value))} aria-label="Größe" />
              </label>
              <label className="kf-inline">
                <span className="kf-caption">Sichtbarkeit {Math.round(opacity * 100)} %</span>
                <input type="range" min={5} max={80} value={Math.round(opacity * 100)} onChange={(event) => setOpacity(Number(event.target.value) / 100)} aria-label="Sichtbarkeit" />
              </label>
            </>
          ) : null}
          {mode === 'numbers' ? (
            <>
              <Field label="Format" help="{n} Seite, {total} Gesamtzahl">
                <span className="kf-input">
                  <input value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Format" />
                </span>
              </Field>
              <Field label="Position">
                <select className="kf-select" value={position} onChange={(event) => setPosition(event.target.value as PdfOptions['numberPosition'])} aria-label="Position">
                  {POSITIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start bei">
                <span className="kf-input kf-input--mono">
                  <input type="number" min={0} value={start} onChange={(event) => setStart(Number(event.target.value) || 1)} aria-label="Startzahl" />
                </span>
              </Field>
            </>
          ) : null}
          <OutputDir value={outputDir} onChange={setOutputDir} />
        </>
      }
    />
  )

  const tabs = (
    <div className="kf-tabs" role="tablist" aria-label="Werkzeug">
      {MODES.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} title={item.title} className={mode === item.id ? 'is-on' : ''} onClick={() => setMode(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  )

  const drop = DROP[mode]
  const how = HOW[mode]
  const startView = chosen ? (
    <div className="kf-start kf-start--tight">
      {tabs}
      <div className="kf-work">
        <ToolDrop tool="pdf" label={drop.title} icon={drop.icon} hint={<>{drop.hint} Ziehen, klicken oder <kbd className="kf-kbd">Strg</kbd> + <kbd className="kf-kbd">V</kbd></>} />
        <div className="kf-howto">
          <Lbl>So läuft es</Lbl>
          {how.steps.map(([title, text], index) => (
            <div key={title} className="kf-how">
              <span className="kf-how__n">{index + 1}</span>
              <div>
                <b>{title}</b>
                <span className="kf-how__t">{text}</span>
              </div>
            </div>
          ))}
          <div className="kf-res">
            <span className="kf-mini">PDF</span>
            <code>{how.result}</code>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="kf-start">
      <div className="kf-steps" aria-label="Ablauf">
        <span className="kf-step is-on"><span className="kf-step__n">1</span>Aufgabe wählen</span>
        <span className="kf-step__line" />
        <span className="kf-step"><span className="kf-step__n">2</span>PDFs hineinziehen</span>
        <span className="kf-step__line" />
        <span className="kf-step"><span className="kf-step__n">3</span>Speichern</span>
      </div>
      <div className="kf-tiles">
        {TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={`kf-tile${tile.wide ? ' kf-tile--wide' : ''}`}
            onClick={() => {
              setMode(tile.id)
              setChosen(true)
            }}
          >
            <span className="kf-tile__art">
              <PdfArt mode={tile.id} />
            </span>
            <span className="kf-tile__text">
              <h2>{tile.title}</h2>
              <p>{tile.text}</p>
              <code>{tile.code}</code>
            </span>
          </button>
        ))}
      </div>
      <div className="kf-footnote">
        <Info className="kf-icon" aria-hidden="true" />
        Danach PDFs ziehen, klicken oder mit Strg V einfügen. Deine Originale bleiben unberührt.
      </div>
    </div>
  )

  return (
    <Page
      tool="pdf"
      hasFiles={state.entries.length > 0}
      start={startView}
      top={tabs}
      subtitle="Such dir aus, was mit deinen PDFs passieren soll."
      dropLabel="PDFs oder Bilder ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'pdf' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {mode === 'merge' && pending.length === 1 ? <Notice tone="info">Zum Zusammenfügen werden mindestens zwei Dateien gebraucht.</Notice> : null}
      {mode !== 'merge' && mode !== 'pages' && state.entries.some((entry) => extensionOf(entry.info.path) !== 'pdf') ? <Notice tone="info">Bilder lassen sich nur zusammenfügen. Hier werden sie ausgelassen.</Notice> : null}
      {state.group ? <GroupRow update={state.group} title="Zusammengefügte PDF" onDismiss={() => app.dispatch({ type: 'queue', tool: 'pdf', ids: [], groupId: null })} /> : null}
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry, index) => {
            const isImage = extensionOf(entry.info.path) !== 'pdf'
            return (
              <FileRow
                key={entry.info.id}
                tool="pdf"
                entry={entry}
                selected={mode === 'pages' && activeEntry?.info.id === entry.info.id}
                onSelect={mode === 'pages' && !isImage ? () => setActive(entry.info.id) : undefined}
                extra={
                  mode === 'merge' ? (
                    <>
                      <IconButton label="Nach oben" disabled={index === 0} onClick={() => app.dispatch({ type: 'move', tool: 'pdf', id: entry.info.id, direction: -1 })}>
                        <ArrowUp className="kf-icon kf-icon--sm" />
                      </IconButton>
                      <IconButton label="Nach unten" disabled={index === state.entries.length - 1} onClick={() => app.dispatch({ type: 'move', tool: 'pdf', id: entry.info.id, direction: 1 })}>
                        <ArrowDown className="kf-icon kf-icon--sm" />
                      </IconButton>
                    </>
                  ) : null
                }
                onRemove={() => app.dispatch({ type: 'remove', tool: 'pdf', id: entry.info.id })}
              />
            )
          })}
        </div>
      ) : null}
      {mode === 'pages' && activeEntry ? <PageGrid path={activeEntry.info.path} edits={edits} onChange={setEdits} /> : null}
    </Page>
  )
}
