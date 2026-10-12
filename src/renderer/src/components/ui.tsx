import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

export function Seg<T extends string>({ value, items, onChange, label }: { value: T; items: Array<{ id: T; label: string; title?: string; disabled?: boolean }>; onChange: (id: T) => void; label: string }) {
  return (
    <div className="kf-seg" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          title={item.title}
          disabled={item.disabled}
          className={`kf-seg__item${value === item.id ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, children, title, disabled }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode; title?: string; disabled?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} title={title} disabled={disabled} className={`kf-opt${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="kf-opt__box" aria-hidden="true" />
      {children}
    </button>
  )
}

export function ChipToggle({ on, onChange, children, disabled }: { on: boolean; onChange: (next: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled} className={`kf-c${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      {on ? <Check className="kf-icon" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function Lbl({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="kf-lbl">
      <span>{children}</span>
      {aside ? <span className="kf-lbl__aside">{aside}</span> : null}
    </div>
  )
}

export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`kf-switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="kf-switch__box" aria-hidden="true" />
      {children}
    </button>
  )
}

export function Field({ label, children, help, error }: { label: string; children: ReactNode; help?: string; error?: boolean }) {
  return (
    <label className="kf-field">
      <span className="kf-field__label">{label}</span>
      {children}
      {help ? <span className={`kf-field__help${error ? ' is-error' : ''}`}>{help}</span> : null}
    </label>
  )
}

export function IconButton({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={`kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm${danger ? ' kf-btn--hover-danger' : ''}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', children, onClose }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`kf-note kf-note--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="kf-note__text">{children}</span>
      {onClose ? (
        <button type="button" className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm" aria-label="Hinweis schließen" onClick={onClose}>
          ×
        </button>
      ) : null}
    </div>
  )
}

export function ExtBadge({ name }: { name: string }) {
  const index = name.lastIndexOf('.')
  return (
    <span className="kf-file__ext" aria-hidden="true">
      {index > 0 ? name.slice(index + 1, index + 5).toUpperCase() : 'DATEI'}
    </span>
  )
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}
