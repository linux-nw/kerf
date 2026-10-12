import { Combine, FileArchive, FileDown, FileImage, FileScan, FileText, Fingerprint, ScanText, ShieldCheck, Shrink, type LucideIcon } from 'lucide-react'
import { LocalBadge } from './LocalBadge'

interface Module {
  id: string
  label: string
  icon: LucideIcon
  ready: boolean
}

const tools: Module[] = [
  { id: 'compress', label: 'Komprimieren', icon: Shrink, ready: true },
  { id: 'convert', label: 'Konvertieren', icon: FileImage, ready: false },
  { id: 'office', label: 'Office zu PDF', icon: FileText, ready: false },
  { id: 'pdf', label: 'PDF-Werkzeuge', icon: Combine, ready: false },
  { id: 'ocr', label: 'Texterkennung', icon: ScanText, ready: false }
]

const privacy: Module[] = [
  { id: 'scrub', label: 'Metadaten', icon: FileScan, ready: false },
  { id: 'redact', label: 'Schwärzen', icon: ShieldCheck, ready: false },
  { id: 'hash', label: 'Prüfsummen', icon: Fingerprint, ready: false },
  { id: 'archive', label: 'Archive', icon: FileArchive, ready: false },
  { id: 'export', label: 'Exportieren', icon: FileDown, ready: false }
]

function Group({ label, items, active }: { label: string; items: Module[]; active: string }) {
  return (
    <nav className="kf-nav" aria-label={label}>
      <span className="kf-overline kf-nav__label">{label}</span>
      {items.map(({ id, label: text, icon: Icon, ready }) => (
        <button
          key={id}
          type="button"
          className={`kf-nav__item${id === active ? ' is-active' : ''}`}
          aria-current={id === active ? 'page' : undefined}
          disabled={!ready}
          title={ready ? undefined : 'Kommt bald'}
        >
          <Icon className="kf-icon" aria-hidden="true" />
          {text}
          {ready ? null : <span className="kf-nav__count">bald</span>}
        </button>
      ))}
    </nav>
  )
}

export function Sidebar({ active, queueCount }: { active: string; queueCount: number }) {
  return (
    <aside className="kf-side" aria-label="Hauptnavigation">
      <div className="kf-side__brand">
        <svg className="kf-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20 L12 4 L20 20" />
          <path d="M8 14 H16" />
        </svg>
        Kerf
      </div>
      <div className="kf-side__scroll">
        <Group label="Werkzeuge" items={tools} active={active} />
        <Group label="Privatsphäre" items={privacy} active={active} />
      </div>
      <div className="kf-side__foot">
        {queueCount > 0 ? <span className="kf-caption">{queueCount} in der Warteschlange</span> : null}
        <LocalBadge />
      </div>
    </aside>
  )
}
