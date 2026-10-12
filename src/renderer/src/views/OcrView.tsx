import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, Download, Eye, Trash2, X } from 'lucide-react'
import { pagesToText } from '@shared/ocrText'
import { OCR_LANGUAGES } from '@shared/tools'
import type { OcrOptions, OcrOutput, OcrResult } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { OutputDir } from '../components/OutputDir'
import { Popover } from '../components/Popover'
import { Page } from '../components/Page'
import { copyText, IconButton, Toggle } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const OUTPUTS: Array<{ id: OcrOutput; label: string }> = [
  { id: 'pdf', label: 'Durchsuchbares PDF' },
  { id: 'txt', label: 'Text' },
  { id: 'md', label: 'Markdown' },
  { id: 'docx', label: 'Word' }
]

function Reader({ name, result, onClose }: { name: string; result: OcrResult; onClose: () => void }) {
  const text = useMemo(() => pagesToText(result.pages), [result])
  const [done, setDone] = useState<string | null>(null)
  return (
    <section className="kf-reader" aria-label={`Ergebnis für ${name}`}>
      <div className="kf-report__head">
        <div>
          <h2 className="title-md kf-report__title">{name}</h2>
          <p className="kf-caption">
            {result.pages.length} {result.pages.length === 1 ? 'Seite' : 'Seiten'} · {result.words} Wörter{result.confidence !== null ? ` · Sicherheit ${result.confidence} %` : ''}
          </p>
        </div>
        <div className="kf-row">
          <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void copyText(text).then(() => setDone('Kopiert'))}>
            <Copy className="kf-icon kf-icon--sm" aria-hidden="true" />
            {done ?? 'Text kopieren'}
          </button>
          <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void window.kerf.saveText(`${name.replace(/\.[^.]+$/, '')}.txt`, `${text}\n`)}>
            <Download className="kf-icon kf-icon--sm" aria-hidden="true" />
            Speichern unter
          </button>
          <IconButton label="Ergebnis schließen" onClick={onClose}>
            <X className="kf-icon kf-icon--sm" />
          </IconButton>
        </div>
      </div>
      <div className="kf-reader__body">
        {result.pages.map((page) => (
          <article key={page.number} className="kf-reader__page">
            {result.pages.length > 1 || page.confidence !== null ? (
              <header className="kf-reader__pagehead">
                <span className="kf-overline">Seite {page.number}</span>
                {page.source === 'textlayer' ? <span className="kf-chip">Vorhandener Text</span> : null}
                {page.confidence !== null ? (
                  <span className={`kf-chip${page.confidence < 70 ? ' kf-chip--warn' : ''}`}>
                    {page.confidence < 70 ? <AlertTriangle className="kf-icon kf-icon--sm" aria-hidden="true" /> : null}
                    Sicherheit {page.confidence} %
                  </span>
                ) : null}
              </header>
            ) : null}
            {page.blocks.length === 0 ? <p className="kf-caption">Auf dieser Seite wurde kein Text erkannt.</p> : null}
            {page.blocks.map((block, index) => {
              if (block.kind === 'heading') {
                const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5'
                return <Tag key={index} className={`kf-reader__h${block.level}`}>{block.text}</Tag>
              }
              if (block.kind === 'paragraph') return <p key={index} className="kf-reader__p">{block.text}</p>
              const List = block.ordered ? 'ol' : 'ul'
              return (
                <List key={index} className="kf-reader__list">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </List>
              )
            })}
          </article>
        ))}
      </div>
    </section>
  )
}

export function OcrView() {
  const app = useApp()
  const state = app.state.ocr
  const available = app.caps?.ocrLanguages
  const languageList = useMemo(() => OCR_LANGUAGES.filter((entry) => !available || available.includes(entry.code)), [available])
  const [languages, setLanguages] = useState<string[]>(['deu', 'eng'])
  const [outputs, setOutputs] = useState<OcrOutput[]>(['pdf', 'txt'])
  const [skipTextPages, setSkipTextPages] = useState(true)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [reader, setReader] = useState<string | null>(null)

  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))

  useEffect(() => {
    if (!available) return
    setLanguages((current) => {
      const kept = current.filter((code) => available.includes(code))
      return kept.length > 0 ? kept : available.includes('eng') ? ['eng'] : available.slice(0, 1)
    })
  }, [available])

  const finishedKey = state.entries.filter((entry) => entry.update?.status === 'done').map((entry) => entry.info.id).join(',')
  useEffect(() => {
    const last = [...state.entries].reverse().find((entry) => entry.update?.status === 'done' && entry.update.data)
    if (last && !running) setReader((current) => current ?? last.info.id)
  }, [finishedKey, running, state.entries])

  const toggleLanguage = (code: string, on: boolean) => {
    if (on) setLanguages([...languages, code])
    else if (languages.length > 1) setLanguages(languages.filter((entry) => entry !== code))
  }

  const start = () => {
    const options: OcrOptions = { languages, outputs, outputDir, skipTextPages }
    app.run('ocr', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), options)
  }

  const open = state.entries.find((entry) => entry.info.id === reader && entry.update?.status === 'done' && entry.update.data)

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien erkennen` : 'Text erkennen'}
      disabled={pending.length === 0 || outputs.length === 0}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
      options={
        <>
          <Popover label="Sprachen" summary={languages.map((code) => OCR_LANGUAGES.find((entry) => entry.code === code)?.label ?? code).join(' + ')} width={420}>
            <p className="kf-caption">Alles anhaken, was im Dokument vorkommt. Mehrere gehen gleichzeitig.</p>
            <div className="kf-targets__chips" role="group" aria-label="Sprachen">
              {languageList.map((entry) => (
                <Toggle key={entry.code} checked={languages.includes(entry.code)} onChange={(on) => toggleLanguage(entry.code, on)}>
                  {entry.label}
                </Toggle>
              ))}
            </div>
          </Popover>
          <Popover label="Ergebnis" summary={OUTPUTS.filter((entry) => outputs.includes(entry.id)).map((entry) => entry.label.replace('Durchsuchbares ', '')).join(', ') || 'nichts gewählt'}>
            <div className="kf-targets__chips" role="group" aria-label="Ausgabe">
              {OUTPUTS.map((entry) => (
                <Toggle key={entry.id} checked={outputs.includes(entry.id)} onChange={(on) => setOutputs(on ? [...outputs, entry.id] : outputs.filter((id) => id !== entry.id))}>
                  {entry.label}
                </Toggle>
              ))}
            </div>
            <Toggle checked={skipTextPages} onChange={setSkipTextPages} title="PDF-Seiten, die schon Text haben, werden nicht neu erkannt">
              Seiten mit Text überspringen
            </Toggle>
          </Popover>
          <OutputDir value={outputDir} onChange={setOutputDir} />
        </>
      }
    />
  )

  return (
    <Page
      tool="ocr"
      hasFiles={state.entries.length > 0}
      dropLabel="Scans oder Fotos mit Text ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => { setReader(null); app.dispatch({ type: 'clear', tool: 'ocr' }) }}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => {
            const result = entry.update?.status === 'done' ? (entry.update.data as OcrResult | null) : null
            const summary = result ? `${result.pages.length} ${result.pages.length === 1 ? 'Seite' : 'Seiten'}${result.confidence !== null ? ` · Sicherheit ${result.confidence} %` : ''}` : undefined
            return (
              <FileRow
                key={entry.info.id}
                tool="ocr"
                entry={entry}
                doneLabel={summary ?? 'Fertig'}
                selected={open?.info.id === entry.info.id}
                extra={
                  result ? (
                    <IconButton label="Ergebnis ansehen" onClick={() => setReader(entry.info.id)}>
                      <Eye className="kf-icon kf-icon--sm" />
                    </IconButton>
                  ) : null
                }
                onRemove={() => {
                  if (reader === entry.info.id) setReader(null)
                  app.dispatch({ type: 'remove', tool: 'ocr', id: entry.info.id })
                }}
              />
            )
          })}
        </div>
      ) : null}
      {open && open.update?.data ? <Reader name={open.info.name} result={open.update.data as OcrResult} onClose={() => setReader(null)} /> : null}
    </Page>
  )
}
