import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, EyeOff, Search, ShieldCheck, Square, Trash2, X } from 'lucide-react'
import type { RedactBox, TextMatch } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { OutputDir } from '../components/OutputDir'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { Notice, Toggle } from '../components/ui'
import { useApp } from '../context'
import { usePdfInfo } from '../hooks/usePdfThumbs'
import { isActive } from '../store'

const PRESETS = [
  { id: 'email', label: 'E-Mail-Adressen' },
  { id: 'iban', label: 'IBAN' },
  { id: 'phone', label: 'Telefonnummern' },
  { id: 'date', label: 'Datumsangaben' }
]

const VIEW_WIDTH = 720

interface Match extends TextMatch {
  key: string
  on: boolean
}

export function RedactView() {
  const app = useApp()
  const state = app.state.redact
  const [active, setActive] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [terms, setTerms] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [presets, setPresets] = useState<string[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [manual, setManual] = useState<RedactBox[]>([])
  const [drawing, setDrawing] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const stage = useRef<HTMLDivElement>(null)

  const entry = state.entries.find((item) => item.info.id === active) ?? state.entries[0] ?? null
  const path = entry?.info.path ?? null
  const { info, error } = usePdfInfo(path)
  const size = info?.sizes[page - 1]
  const scale = size ? VIEW_WIDTH / size.width : 1
  const running = state.entries.some((item) => isActive(item.update))

  useEffect(() => {
    setPage(1)
    setMatches([])
    setManual([])
  }, [path])

  useEffect(() => {
    if (!path || !info) return
    let alive = true
    let url: string | null = null
    setFailed(null)
    window.kerf
      .pdfPage(path, page, VIEW_WIDTH * 2)
      .then((data) => {
        if (!alive) return
        url = URL.createObjectURL(new Blob([data.slice().buffer], { type: 'image/png' }))
        setPageUrl(url)
      })
      .catch(() => alive && setFailed('Die Seite konnte nicht angezeigt werden'))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, info, page])

  useEffect(() => {
    if (!path || !info || (terms.length === 0 && presets.length === 0)) {
      setMatches([])
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      window.kerf
        .pdfFind(path, terms, presets)
        .then((found) => alive && setMatches(found.map((match, index) => ({ ...match, key: `${match.page}-${index}`, on: true }))))
        .catch(() => alive && setMatches([]))
    }, 350)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [path, info, terms, presets])

  const addTerm = () => {
    const value = draft.trim()
    if (value && !terms.includes(value)) setTerms([...terms, value])
    setDraft('')
  }

  const point = (event: PointerEvent): { x: number; y: number } => {
    const rect = stage.current?.getBoundingClientRect()
    return { x: Math.max(0, Math.min(VIEW_WIDTH, event.clientX - (rect?.left ?? 0))), y: Math.max(0, event.clientY - (rect?.top ?? 0)) }
  }

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-box]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = point(event)
    setDrawing({ ...origin.current, width: 0, height: 0 })
  }
  const move = (event: PointerEvent) => {
    if (!origin.current) return
    const current = point(event)
    setDrawing({ x: Math.min(origin.current.x, current.x), y: Math.min(origin.current.y, current.y), width: Math.abs(current.x - origin.current.x), height: Math.abs(current.y - origin.current.y) })
  }
  const up = () => {
    if (drawing && drawing.width > 6 && drawing.height > 6) {
      setManual((current) => [...current, { page, x: drawing.x / scale, y: drawing.y / scale, width: drawing.width / scale, height: drawing.height / scale }])
    }
    origin.current = null
    setDrawing(null)
  }

  const onPage = matches.filter((match) => match.page === page)
  const chosen = matches.filter((match) => match.on)
  const boxes: RedactBox[] = [...chosen.map(({ page: p, x, y, width, height }) => ({ page: p, x, y, width, height })), ...manual]
  const pagesAffected = new Set(boxes.map((box) => box.page)).size
  const perPage = useMemo(() => {
    const result = new Map<number, number>()
    for (const match of matches) if (match.on) result.set(match.page, (result.get(match.page) ?? 0) + 1)
    for (const box of manual) result.set(box.page, (result.get(box.page) ?? 0) + 1)
    return result
  }, [matches, manual])

  const start = () => {
    if (!entry) return
    app.run('redact', [entry.info.id], [{ id: entry.info.id, paths: [entry.info.path] }], { boxes, checkTerms: terms, outputDir })
  }

  const bar = (
    <ActionBar
      label={boxes.length > 0 ? `${boxes.length} ${boxes.length === 1 ? 'Bereich' : 'Bereiche'} auf ${pagesAffected} ${pagesAffected === 1 ? 'Seite' : 'Seiten'} schwärzen` : 'Schwärzen'}
      disabled={!entry || boxes.length === 0}
      running={running}
      onStart={start}
      onCancel={() => entry && app.cancel(entry.info.id)}
      options={<OutputDir value={outputDir} onChange={setOutputDir} />}
    />
  )

  const startView = (
    <div className="kf-start kf-start--tight">
      <div className="kf-split kf-split--red">
        <ToolDrop tool="redact" icon={EyeOff} label="Eine PDF ablegen" />
        <div className="kf-docbox" aria-hidden="true">
          <div className="kf-sheet">
            <div className="kf-ln kf-ln--h" />
            <div className="kf-ln" style={{ width: '90%' }} />
            <div className="kf-bk" style={{ width: '62%' }} />
            <div className="kf-ln" style={{ width: '80%' }} />
            <div className="kf-ln" style={{ width: '94%' }} />
            <div className="kf-bk" style={{ width: '78%' }} />
            <div className="kf-ln" style={{ width: '70%' }} />
            <div className="kf-ln" style={{ width: '88%' }} />
            <div className="kf-bk" style={{ width: '48%' }} />
            <div className="kf-ln" style={{ width: '92%' }} />
            <div className="kf-ln" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
      <div className="kf-how3">
        {[
          { icon: Square, title: 'Markieren', text: 'Rechteck über die Stelle ziehen.' },
          { icon: Search, title: 'Suchen', text: 'Wort, IBAN oder E-Mail eingeben, alle Treffer werden markiert.' },
          { icon: Check, title: 'Prüfen', text: 'Kerf sucht im Ergebnis nach, ob noch etwas lesbar ist.' }
        ].map((item) => (
          <div key={item.title} className="kf-fact">
            <span className="kf-ib kf-ib--sm">
              <item.icon className="kf-icon" aria-hidden="true" />
            </span>
            <div>
              <b>{item.title}</b>
              <span>{item.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="kf-callout kf-callout--ok">
        <ShieldCheck className="kf-icon" aria-hidden="true" />
        Der Text unter dem Balken wird wirklich entfernt, nicht nur schwarz überdeckt.
      </div>
    </div>
  )

  return (
    <Page
      tool="redact"
      hasFiles={state.entries.length > 0}
      start={startView}
      subtitle="Namen, IBANs und Adressen in PDFs unwiderruflich unkenntlich machen."
      dropLabel="PDF zum Schwärzen ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'redact' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((item) => (
            <FileRow
              key={item.info.id}
              tool="redact"
              entry={item}
              selected={entry?.info.id === item.info.id}
              onSelect={() => setActive(item.info.id)}
              onRemove={() => app.dispatch({ type: 'remove', tool: 'redact', id: item.info.id })}
            />
          ))}
        </div>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {entry && info ? (
        <section className="kf-redact" aria-label="Seitenansicht zum Schwärzen">
          <div className="kf-redact__panel">
            <div className="kf-redact__search">
              <span className="kf-input">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && addTerm()}
                  placeholder="Begriff suchen, zum Beispiel einen Namen"
                  aria-label="Begriff zum Schwärzen"
                />
              </span>
              <button type="button" className="kf-btn kf-btn--secondary" onClick={addTerm} disabled={draft.trim() === ''}>
                Hinzufügen
              </button>
            </div>
            <div className="kf-row" role="group" aria-label="Automatisch finden">
              {PRESETS.map((preset) => (
                <Toggle key={preset.id} checked={presets.includes(preset.id)} onChange={(on) => setPresets(on ? [...presets, preset.id] : presets.filter((id) => id !== preset.id))}>
                  {preset.label}
                </Toggle>
              ))}
            </div>
            {terms.length > 0 ? (
              <div className="kf-row" aria-label="Gesuchte Begriffe">
                {terms.map((term) => (
                  <span key={term} className="kf-flag kf-flag--term">
                    {term}
                    <button type="button" aria-label={`${term} entfernen`} onClick={() => setTerms(terms.filter((entry2) => entry2 !== term))}>
                      <X className="kf-icon kf-icon--sm" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <p className="kf-caption">
              {matches.length > 0
                ? `${chosen.length} von ${matches.length} Treffern ausgewählt. Klick auf einen Treffer nimmt ihn heraus.`
                : 'Zieh mit der Maus Rechtecke über Stellen, die weg sollen. Gesuchte Begriffe und automatische Treffer erscheinen hier von selbst.'}
            </p>
          </div>

          <div className="kf-redact__nav">
            <button type="button" className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm" aria-label="Vorherige Seite" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="kf-icon kf-icon--sm" />
            </button>
            <span className="kf-mono">
              Seite {page} von {info.pages}
              {perPage.get(page) ? ` · ${perPage.get(page)} markiert` : ''}
            </span>
            <button type="button" className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm" aria-label="Nächste Seite" disabled={page >= info.pages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="kf-icon kf-icon--sm" />
            </button>
          </div>

          <div className="kf-redact__stage" ref={stage} style={{ width: VIEW_WIDTH, height: size ? size.height * scale : 400 }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            {pageUrl ? <img src={pageUrl} alt={`Seite ${page}`} draggable={false} width={VIEW_WIDTH} /> : <span className="kf-caption kf-redact__loading">{failed ?? 'Seite wird geladen …'}</span>}
            {onPage.map((match) => (
              <button
                key={match.key}
                type="button"
                data-box
                className={`kf-box kf-box--match${match.on ? ' is-on' : ''}`}
                style={{ left: match.x * scale, top: match.y * scale, width: match.width * scale, height: match.height * scale }}
                title={match.on ? `„${match.text}“ wird geschwärzt. Klicken zum Herausnehmen` : `„${match.text}“ bleibt stehen. Klicken zum Schwärzen`}
                onClick={() => setMatches((current) => current.map((item) => (item.key === match.key ? { ...item, on: !item.on } : item)))}
              />
            ))}
            {manual.map((box, index) =>
              box.page === page ? (
                <button
                  key={`m-${index}`}
                  type="button"
                  data-box
                  className="kf-box kf-box--manual is-on"
                  style={{ left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale }}
                  title="Eigener Bereich. Klicken zum Entfernen"
                  onClick={() => setManual((current) => current.filter((_, position) => position !== index))}
                />
              ) : null
            )}
            {drawing ? <div className="kf-box kf-box--draft" style={{ left: drawing.x, top: drawing.y, width: drawing.width, height: drawing.height }} /> : null}
          </div>
        </section>
      ) : null}
    </Page>
  )
}
