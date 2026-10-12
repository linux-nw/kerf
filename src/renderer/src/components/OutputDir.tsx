import { FolderOpen, X } from 'lucide-react'
import { useApp } from '../context'

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export function OutputDir({ value, onChange }: { value: string | null; onChange: (dir: string | null) => void }) {
  const app = useApp()
  const fallback = app.settings?.outputDir ?? null
  const shown = value ?? fallback
  return (
    <div className="kf-row kf-outdir">
      <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => void window.kerf.pickOutputDir().then((dir) => dir && onChange(dir))} title={shown ?? 'Ergebnis liegt neben dem Original'}>
        <FolderOpen className="kf-icon kf-icon--sm" aria-hidden="true" />
        {value ? folderName(value) : fallback ? `${folderName(fallback)} (Standard)` : 'Neben dem Original'}
      </button>
      {value ? (
        <button type="button" className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm" aria-label="Ausgabeordner zurücksetzen" onClick={() => onChange(null)}>
          <X className="kf-icon kf-icon--sm" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
