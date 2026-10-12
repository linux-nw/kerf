import { FolderOpen, X } from 'lucide-react'

export function OutputDir({ value, onChange }: { value: string | null; onChange: (dir: string | null) => void }) {
  return (
    <div className="kf-row kf-outdir">
      <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => void window.kerf.pickOutputDir().then((dir) => dir && onChange(dir))} title={value ?? 'Ergebnis liegt neben dem Original'}>
        <FolderOpen className="kf-icon kf-icon--sm" aria-hidden="true" />
        {value ? value.split(/[\\/]/).filter(Boolean).pop() : 'Neben dem Original'}
      </button>
      {value ? (
        <button type="button" className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm" aria-label="Ausgabeordner zurücksetzen" onClick={() => onChange(null)}>
          <X className="kf-icon kf-icon--sm" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
