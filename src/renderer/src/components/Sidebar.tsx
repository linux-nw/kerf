import { Archive, Combine, EyeOff, FileScan, FileSearch, Fingerprint, History, Monitor, Moon, RefreshCw, ScanText, Settings, Shrink, Sun, type LucideIcon } from 'lucide-react'
import { TOOLS, type NavId, type ToolId } from '@shared/tools'
import type { ThemeChoice } from '../theme'
import { LocalBadge } from './LocalBadge'

const ICONS: Record<ToolId, LucideIcon> = {
  compress: Shrink,
  convert: RefreshCw,
  pdf: Combine,
  ocr: ScanText,
  metaread: FileSearch,
  metaclean: FileScan,
  redact: EyeOff,
  hash: Fingerprint,
  archive: Archive
}

const GROUPS: Array<{ id: 'tools' | 'privacy' | 'more'; label: string }> = [
  { id: 'tools', label: 'Werkzeuge' },
  { id: 'privacy', label: 'Privatsphäre' },
  { id: 'more', label: 'Weiteres' }
]

const THEMES: Array<{ id: ThemeChoice; label: string; icon: LucideIcon }> = [
  { id: 'dark', label: 'Dunkel', icon: Moon },
  { id: 'light', label: 'Hell', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor }
]

interface Props {
  active: NavId
  busy: Partial<Record<ToolId, number>>
  historyCount: number
  theme: ThemeChoice
  onNavigate: (id: NavId) => void
  onTheme: (theme: ThemeChoice) => void
}

export function Sidebar({ active, busy, historyCount, theme, onNavigate, onTheme }: Props) {
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
        {GROUPS.map((group) => (
          <nav key={group.id} className="kf-nav" aria-label={group.label}>
            <span className="kf-overline kf-nav__label">{group.label}</span>
            {TOOLS.filter((tool) => tool.group === group.id).map((tool) => {
              const Icon = ICONS[tool.id]
              const count = busy[tool.id] ?? 0
              return (
                <button key={tool.id} type="button" className={`kf-nav__item${active === tool.id ? ' is-active' : ''}`} aria-current={active === tool.id ? 'page' : undefined} onClick={() => onNavigate(tool.id)}>
                  <Icon className="kf-icon" aria-hidden="true" />
                  {tool.label}
                  {count > 0 ? <span className="kf-nav__count">{count}</span> : null}
                </button>
              )
            })}
          </nav>
        ))}
        <nav className="kf-nav" aria-label="Verlauf">
          <span className="kf-overline kf-nav__label">Zuletzt</span>
          <button type="button" className={`kf-nav__item${active === 'history' ? ' is-active' : ''}`} aria-current={active === 'history' ? 'page' : undefined} onClick={() => onNavigate('history')}>
            <History className="kf-icon" aria-hidden="true" />
            Verlauf
            {historyCount > 0 ? <span className="kf-nav__count">{historyCount}</span> : null}
          </button>
        </nav>
      </div>
      <div className="kf-side__foot">
        <nav className="kf-nav" aria-label="Einstellungen">
          <button type="button" className={`kf-nav__item${active === 'settings' ? ' is-active' : ''}`} aria-current={active === 'settings' ? 'page' : undefined} onClick={() => onNavigate('settings')}>
            <Settings className="kf-icon" aria-hidden="true" />
            Einstellungen
          </button>
        </nav>
        <div className="kf-seg kf-seg--icons" role="radiogroup" aria-label="Erscheinungsbild">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={theme === id} title={label} aria-label={label} className={`kf-seg__item${theme === id ? ' is-active' : ''}`} onClick={() => onTheme(id)}>
              <Icon className="kf-icon kf-icon--sm" aria-hidden="true" />
            </button>
          ))}
        </div>
        <LocalBadge />
      </div>
    </aside>
  )
}
