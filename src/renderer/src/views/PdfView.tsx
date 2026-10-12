import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react'
import type { PageEdit, PdfMode, PdfOptions } from '@shared/types'
import { extensionOf } from '@shared/tools'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { GroupRow } from '../components/GroupRow'
import { OutputDir } from '../components/OutputDir'
import { Page } from '../components/Page'
import { Field, IconButton, Notice, Seg, Switch } from '../components/ui'
import { useApp } from '../context'
import { usePdfInfo, usePdfThumbs } from '../hooks/usePdfThumbs'
import { isActive, isPending } from '../store'

const MODES: Array<{ id: PdfMode; label: string; title: string }> = [
  { id: 'merge', label: 'Zusammenfügen', title: 'PDFs und Bilder zu einer Datei verbinden' },
  { id: 'split', label: 'Teilen', title: 'Eine PDF in mehrere aufteilen' },
  { id: 'pages', label: 'Seiten', title: 'Seiten ordnen, drehen und löschen' },
  { id: 'watermark', label: 'Wasserzeichen', title: 'Text quer über jede Seite legen' },
  { id: 'numbers', label: 'Seitenzahlen', title: 'Seitenzahlen einfügen' }
]

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
      app.run('pdf', pending.map((entry) => entry.info.id), [{ id, paths: pending.map((entry) => entry.info.path) }], options, id)
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
      extra={<Seg label="Werkzeug" value={mode} items={MODES} onChange={setMode} />}
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

  return (
    <Page
      tool="pdf"
      hasFiles={state.entries.length > 0}
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
