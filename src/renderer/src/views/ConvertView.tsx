import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { commonTargets, lossWarning, sourceKind } from '@shared/convertTargets'
import { extensionOf } from '@shared/tools'
import type { ConvertOptions } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { OutputDir } from '../components/OutputDir'
import { Page } from '../components/Page'
import { Notice, Seg, Toggle } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const QUALITY_TARGETS = ['jpg', 'webp', 'avif']

export function ConvertView() {
  const app = useApp()
  const state = app.state.convert
  const [target, setTarget] = useState('')
  const [quality, setQuality] = useState(85)
  const [icoSizes, setIcoSizes] = useState<number[]>([16, 32, 48, 256])
  const [pdfDpi, setPdfDpi] = useState(150)
  const [outputDir, setOutputDir] = useState<string | null>(null)

  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))
  const basis = pending.length > 0 ? pending : state.entries
  const targets = useMemo(() => commonTargets(basis.map((entry) => entry.info.path), app.caps), [basis, app.caps])

  useEffect(() => {
    if (targets.length === 0) return
    const current = targets.find((item) => item.id === target && item.available)
    if (!current) setTarget(targets.find((item) => item.available)?.id ?? targets[0]?.id ?? '')
  }, [targets, target])

  const groups = useMemo(() => {
    const result = new Map<string, typeof targets>()
    for (const item of targets) result.set(item.group, [...(result.get(item.group) ?? []), item])
    return [...result.entries()]
  }, [targets])

  const sources = [...new Set(basis.map((entry) => extensionOf(entry.info.path)))]
  const warning = sources.map((ext) => lossWarning(ext, target)).find((text) => text !== null) ?? null
  const hasOffice = sources.some((ext) => ['writer', 'calc', 'impress', 'visio'].includes(sourceKind(ext) ?? ''))
  const officeLimited = hasOffice && target === 'pdf' && !app.caps?.libreoffice && !app.caps?.msoffice
  const needsDpi = sources.includes('pdf') && (target === 'png' || target === 'jpg')
  const selected = targets.find((item) => item.id === target)
  const noCommon = basis.length > 0 && targets.length === 0

  const start = () => {
    const options: ConvertOptions = { target, quality, icoSizes: icoSizes.length ? icoSizes : [32], outputDir, pdfDpi }
    app.run('convert', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), options)
  }

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien umwandeln` : 'Umwandeln'}
      disabled={pending.length === 0 || !selected?.available}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
      extra={
        basis.length === 0 ? null : noCommon ? (
          <p className="kf-caption">Diese Dateien haben kein gemeinsames Zielformat. Wandle sie getrennt um.</p>
        ) : (
          <div className="kf-targets" role="radiogroup" aria-label="Zielformat">
            {groups.map(([group, items]) => (
              <div key={group} className="kf-targets__group">
                <span className="kf-overline">{group}</span>
                <div className="kf-targets__chips">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={target === item.id}
                      disabled={!item.available}
                      title={item.reason ?? item.hint}
                      className={`kf-pick${target === item.id ? ' is-active' : ''}`}
                      onClick={() => setTarget(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      }
      options={
        <>
          {QUALITY_TARGETS.includes(target) ? (
            <label className="kf-inline">
              <span className="kf-caption">Qualität {quality}</span>
              <input type="range" min={40} max={100} value={quality} onChange={(event) => setQuality(Number(event.target.value))} aria-label="Qualität" />
            </label>
          ) : null}
          {target === 'ico' ? (
            <div className="kf-row" role="group" aria-label="Größen im Icon">
              {ICO_SIZES.map((size) => (
                <Toggle key={size} checked={icoSizes.includes(size)} onChange={(on) => setIcoSizes(on ? [...icoSizes, size].sort((a, b) => a - b) : icoSizes.filter((entry) => entry !== size))}>
                  {size}
                </Toggle>
              ))}
            </div>
          ) : null}
          {needsDpi ? (
            <Seg label="Auflösung" value={String(pdfDpi)} items={[{ id: '96', label: '96 dpi' }, { id: '150', label: '150 dpi' }, { id: '200', label: '200 dpi' }, { id: '300', label: '300 dpi' }]} onChange={(id) => setPdfDpi(Number(id))} />
          ) : null}
          <OutputDir value={outputDir} onChange={setOutputDir} />
        </>
      }
    />
  )

  return (
    <Page
      tool="convert"
      hasFiles={state.entries.length > 0}
      dropLabel="Dateien zum Umwandeln ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'convert' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {warning ? <Notice tone="warning">{warning}</Notice> : null}
      {officeLimited ? <Notice tone="info">Ohne Microsoft Office oder LibreOffice gelingt DOCX und XLSX nach PDF nur in einfacher Darstellung. Für PPTX und alte Formate wird eines der beiden gebraucht.</Notice> : null}
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => (
            <FileRow key={entry.info.id} tool="convert" entry={entry} onRemove={() => app.dispatch({ type: 'remove', tool: 'convert', id: entry.info.id })} />
          ))}
        </div>
      ) : null}
    </Page>
  )
}
