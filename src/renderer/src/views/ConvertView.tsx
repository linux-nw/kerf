import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Braces, Check, ChevronDown, ChevronUp, FileCode, FileText, Film, Image, Info, Music, Presentation, RefreshCw, Search, Table2, Trash2, type LucideIcon } from 'lucide-react'
import { anyTargets, commonTargets, describeSource, lossWarning, SOURCE_FORMATS, sourceKind, targetsFor, type AvailableTarget, type SourceKind } from '@shared/convertTargets'
import { extensionOf } from '@shared/tools'
import type { ConvertOptions } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { OutputDir } from '../components/OutputDir'
import { Page } from '../components/Page'
import { ToolDrop } from '../components/ToolDrop'
import { Notice, Seg, Toggle } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const QUALITY_TARGETS = ['jpg', 'webp', 'avif']

const KIND_ICON: Record<SourceKind, LucideIcon> = {
  image: Image,
  pdf: FileText,
  writer: FileText,
  calc: Table2,
  impress: Presentation,
  visio: FileText,
  markdown: FileCode,
  html: FileCode,
  txt: FileText,
  csv: Table2,
  json: Braces,
  yaml: Braces,
  xml: Braces,
  audio: Music,
  video: Film
}

const POPULAR: Array<{ from: string; to: string; label: string }> = [
  { from: 'png', to: 'ico', label: 'PNG' },
  { from: 'jpg', to: 'webp', label: 'JPG' },
  { from: 'heic', to: 'jpg', label: 'HEIC' },
  { from: 'docx', to: 'pdf', label: 'DOCX' },
  { from: 'pdf', to: 'png', label: 'PDF' },
  { from: 'mp4', to: 'mp3', label: 'MP4' },
  { from: 'jpg', to: 'pdf', label: 'Bilder' }
]

const TO_LABEL: Record<string, string> = { ico: 'ICO', webp: 'WebP', jpg: 'JPG', pdf: 'PDF', png: 'PNG', mp3: 'MP3' }

interface PanelGroup {
  title: string
  items: Array<{ id: string; label: string; hint?: string; disabled?: boolean; reason?: string | null }>
}

function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return root
}

function FormatPanel({ groups, selected, placeholder, note, onPick }: { groups: PanelGroup[]; selected: string; placeholder: string; note: string | null; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const visible = groups.map((group) => ({ ...group, items: group.items.filter((item) => needle === '' || `${item.label} ${item.id}`.toLowerCase().includes(needle)) })).filter((group) => group.items.length > 0)
  const all = groups.flatMap((group) => group.items)
  const shown = all.find((item) => item.id === (hover ?? selected))
  const hint = shown ? (shown.disabled ? shown.reason : shown.hint) : null
  return (
    <div className="kf-fmtpanel" role="dialog" aria-label={placeholder}>
      <label className="kf-search">
        <Search className="kf-icon kf-icon--sm" aria-hidden="true" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      {visible.length === 0 ? <p className="kf-emptyline">Nichts passt zu „{query}“.</p> : null}
      {visible.map((group) => (
        <div key={group.title} className="kf-quick kf-quick--sm">
          <span className="kf-lbl">{group.title}</span>
          <div className="kf-chips" role="radiogroup" aria-label={group.title}>
            {group.items.map((item) => (
              <button
                key={item.id + item.label}
                type="button"
                role="radio"
                aria-checked={selected === item.id}
                disabled={item.disabled}
                className={`kf-c${selected === item.id ? ' is-on' : ''}`}
                title={item.disabled ? (item.reason ?? undefined) : item.hint}
                onMouseEnter={() => setHover(item.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(item.id)}
                onBlur={() => setHover(null)}
                onClick={() => onPick(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {hint || note ? (
        <div className="kf-hint">
          <Info className="kf-icon kf-icon--sm" aria-hidden="true" />
          <span>{hint ?? note}</span>
        </div>
      ) : null}
    </div>
  )
}

function Selector({ icon: Icon, big, tag, empty, open, locked, onToggle }: { icon: LucideIcon | null; big: string; tag: string; empty: boolean; open: boolean; locked?: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`kf-sel${empty ? ' is-empty' : ''}${open ? ' is-open' : ''}`} aria-expanded={open} disabled={locked} onClick={onToggle}>
      {Icon ? (
        <span className="kf-ib">
          <Icon className="kf-icon" aria-hidden="true" />
        </span>
      ) : null}
      <span className="kf-sel__grow">
        <span className={`kf-sel__big${empty ? ' is-muted' : ''}`}>{big}</span>
        <span className="kf-sel__tag">{tag}</span>
      </span>
      {locked ? null : open ? <ChevronUp className="kf-icon" aria-hidden="true" /> : <ChevronDown className="kf-icon" aria-hidden="true" />}
    </button>
  )
}

function Label({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="kf-lbl">
      <span>
        {title}
        <em>{hint}</em>
      </span>
    </span>
  )
}

export function ConvertView() {
  const app = useApp()
  const state = app.state.convert
  const [from, setFrom] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [panel, setPanel] = useState<'from' | 'to' | null>(null)
  const [quality, setQuality] = useState(85)
  const [icoSizes, setIcoSizes] = useState<number[]>([16, 32, 48, 256])
  const [pdfDpi, setPdfDpi] = useState(150)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [dropped, setDropped] = useState<string | null>(null)

  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))
  const basis = pending.length > 0 ? pending : state.entries
  const hasFiles = state.entries.length > 0
  const sources = useMemo(() => [...new Set(basis.map((entry) => extensionOf(entry.info.path)))], [basis])

  const targets: AvailableTarget[] = useMemo(() => {
    if (basis.length > 0) return commonTargets(basis.map((entry) => entry.info.path), app.caps)
    if (from) return targetsFor(from, app.caps)
    return anyTargets(app.caps)
  }, [basis, from, app.caps])

  useEffect(() => {
    if (target === '') return
    if (!targets.some((item) => item.id === target && item.available)) {
      if (basis.length > 0 || from) {
        const label = targets.find((item) => item.id === target)?.label ?? target.toUpperCase()
        setDropped(basis.length > 0 ? `${label} ist aus diesen Dateien nicht möglich. Bitte wähle ein Format neu.` : null)
        setTarget('')
      }
    }
  }, [targets, target, basis.length, from])

  useEffect(() => {
    if (basis.length === 0) setDropped(null)
  }, [basis.length])

  const closePanel = useMemo(() => () => setPanel(null), [])
  const root = useDismiss(panel !== null, closePanel)

  const groupsTo: PanelGroup[] = useMemo(() => {
    const map = new Map<string, PanelGroup['items']>()
    for (const item of targets) map.set(item.group, [...(map.get(item.group) ?? []), { id: item.id, label: item.label, hint: item.hint, disabled: !item.available, reason: item.reason }])
    return [...map.entries()].map(([title, items]) => ({ title, items }))
  }, [targets])

  const groupsFrom: PanelGroup[] = useMemo(() => {
    const map = new Map<string, PanelGroup['items']>()
    for (const item of SOURCE_FORMATS) map.set(item.group, [...(map.get(item.group) ?? []), { id: item.id, label: item.label }])
    return [...map.entries()].map(([title, items]) => ({ title, items }))
  }, [])

  const selected = targets.find((item) => item.id === target)
  const warning = target ? (sources.map((ext) => lossWarning(ext, target)).find((text) => text !== null) ?? (from && !hasFiles ? lossWarning(from, target) : null)) : null
  const hasOffice = sources.some((ext) => ['writer', 'calc', 'impress', 'visio'].includes(sourceKind(ext) ?? ''))
  const officeLimited = hasOffice && target === 'pdf' && !app.caps?.libreoffice && !app.caps?.msoffice
  const needsDpi = sources.includes('pdf') && (target === 'png' || target === 'jpg')
  const noCommon = basis.length > 0 && targets.length === 0

  const fromView = (() => {
    if (basis.length > 0) {
      if (sources.length === 1) {
        const info = describeSource(sources[0] ?? '')
        return { icon: info.kind ? KIND_ICON[info.kind] : FileText, big: info.label, tag: basis.length > 1 ? `${basis.length} Dateien · ${info.tag}` : info.tag, empty: false }
      }
      const labels = sources.map((ext) => describeSource(ext).label)
      return { icon: Image, big: `${sources.length} Formate`, tag: labels.slice(0, 4).join(', ') + (labels.length > 4 ? ' …' : ''), empty: false }
    }
    if (from) {
      const info = describeSource(from)
      return { icon: info.kind ? KIND_ICON[info.kind] : FileText, big: info.label, tag: info.tag, empty: false }
    }
    return { icon: null, big: 'Automatisch erkennen', tag: 'Kerf schaut sich deine Datei an', empty: true }
  })()

  const toView = (() => {
    if (selected) {
      const info = describeSource(selected.id)
      return { icon: info.kind ? KIND_ICON[info.kind] : FileText, big: selected.label, tag: selected.hint ?? selected.group, empty: false }
    }
    const source = basis.length > 0 ? (sources.length === 1 ? describeSource(sources[0] ?? '').label : null) : from ? describeSource(from).label : null
    return { icon: null, big: 'Format wählen', tag: source ? `Nur Formate, die aus ${source} möglich sind` : 'z. B. PDF, JPG, MP3, ICO', empty: true }
  })()

  const start = () => {
    const options: ConvertOptions = { target, quality, icoSizes: icoSizes.length ? icoSizes : [32], outputDir, pdfDpi }
    app.run('convert', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), options)
  }

  const chooseFrom = (id: string) => {
    setFrom(id)
    setPanel(null)
  }

  const pickRow: ReactNode = (
    <div className="kf-pickrow" ref={root}>
      <div className="kf-pickcol">
        <Label title="Von" hint="Was hast du?" />
        <Selector icon={fromView.icon} big={fromView.big} tag={fromView.tag} empty={fromView.empty} open={panel === 'from'} locked={hasFiles} onToggle={() => setPanel(panel === 'from' ? null : 'from')} />
        {panel === 'from' && !hasFiles ? <FormatPanel groups={groupsFrom} selected={from ?? ''} placeholder="Format suchen" note="Oder lege einfach eine Datei ab, dann erkennt Kerf das Format selbst." onPick={chooseFrom} /> : null}
      </div>
      <div className="kf-circ" aria-hidden="true">
        <ArrowRight className="kf-icon" />
      </div>
      <div className="kf-pickcol">
        <Label title="In" hint="Was soll draus werden?" />
        <Selector icon={toView.icon} big={toView.big} tag={toView.tag} empty={toView.empty} open={panel === 'to'} onToggle={() => setPanel(panel === 'to' ? null : 'to')} />
        {panel === 'to' ? (
          <FormatPanel
            groups={groupsTo}
            selected={target}
            placeholder="Format suchen"
            note={noCommon ? 'Diese Dateien haben kein gemeinsames Zielformat.' : null}
            onPick={(id) => {
              setTarget(id)
              setDropped(null)
              setPanel(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )

  const startView = (
    <div className="kf-start" style={{ gap: 28 }}>
      {pickRow}
      <ToolDrop tool="convert" label="Datei hier ablegen" />
      <div className="kf-quick">
        <span className="kf-lbl">Beliebt</span>
        <div className="kf-chips">
          {POPULAR.map((route) => (
            <button
              key={`${route.from}-${route.to}`}
              type="button"
              className="kf-route"
              onClick={() => {
                setFrom(route.from)
                setTarget(route.to)
                setPanel(null)
              }}
            >
              {route.label}
              <ArrowRight className="kf-icon" aria-hidden="true" />
              <b>{TO_LABEL[route.to] ?? route.to.toUpperCase()}</b>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien umwandeln` : 'Umwandeln'}
      disabled={pending.length === 0 || !selected?.available}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
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
          {target === '' && pending.length > 0 ? (
            <span className="kf-caption">
              <RefreshCw className="kf-icon kf-icon--sm" aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
              Wähle oben, in welches Format es gehen soll.
            </span>
          ) : null}
          <OutputDir value={outputDir} onChange={setOutputDir} />
        </>
      }
    />
  )

  return (
    <Page
      tool="convert"
      hasFiles={hasFiles}
      start={startView}
      top={pickRow}
      subtitle="Sag Kerf, was du hast und was du willst. Den Rest erledigt es lokal."
      dropLabel="Dateien zum Umwandeln ablegen"
      bar={bar}
      headRight={
        hasFiles && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'convert' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {dropped ? <Notice tone="warning" onClose={() => setDropped(null)}>{dropped}</Notice> : null}
      {warning ? <Notice tone="warning">{warning}</Notice> : null}
      {officeLimited ? <Notice tone="info">Ohne Microsoft Office oder LibreOffice gelingt DOCX und XLSX nach PDF nur in einfacher Darstellung. Für PPTX und alte Formate wird eines der beiden gebraucht.</Notice> : null}
      {noCommon ? <Notice tone="warning">Diese Dateien haben kein gemeinsames Zielformat. Wandle sie getrennt um.</Notice> : null}
      {hasFiles ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => (
            <FileRow key={entry.info.id} tool="convert" entry={entry} onRemove={() => app.dispatch({ type: 'remove', tool: 'convert', id: entry.info.id })} />
          ))}
        </div>
      ) : null}
    </Page>
  )
}
