import { useMemo, useState } from 'react'
import { Check, Copy, Trash2, X } from 'lucide-react'
import type { HashAlgorithm } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { FileRow } from '../components/FileRow'
import { Page } from '../components/Page'
import { copyText, Toggle } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const ALGORITHMS: Array<{ id: HashAlgorithm; label: string }> = [
  { id: 'sha256', label: 'SHA-256' },
  { id: 'sha1', label: 'SHA-1' },
  { id: 'sha512', label: 'SHA-512' },
  { id: 'md5', label: 'MD5' }
]

interface HashData {
  hashes: Record<string, string>
}

function HashList({ data, expected }: { data: HashData; expected: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const wanted = expected.trim().toLowerCase()
  return (
    <div className="kf-hashes">
      {ALGORITHMS.filter((algorithm) => data.hashes[algorithm.id]).map((algorithm) => {
        const value = data.hashes[algorithm.id] ?? ''
        const match = wanted !== '' && value.toLowerCase() === wanted
        return (
          <div key={algorithm.id} className={`kf-hash${match ? ' is-match' : ''}`}>
            <span className="kf-hash__label">{algorithm.label}</span>
            <code className="kf-hash__value">{value}</code>
            {match ? (
              <span className="kf-status kf-status--ok">
                <Check className="kf-icon kf-icon--sm" aria-hidden="true" />
                Stimmt überein
              </span>
            ) : null}
            <button
              type="button"
              className="kf-btn kf-btn--ghost kf-btn--icon kf-btn--sm"
              aria-label={`${algorithm.label} kopieren`}
              title="Kopieren"
              onClick={() => void copyText(value).then(() => setCopied(algorithm.id))}
            >
              {copied === algorithm.id ? <Check className="kf-icon kf-icon--sm" /> : <Copy className="kf-icon kf-icon--sm" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function HashView() {
  const app = useApp()
  const state = app.state.hash
  const [algorithms, setAlgorithms] = useState<HashAlgorithm[]>(['sha256'])
  const [expected, setExpected] = useState('')
  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update))

  const anyMatch = useMemo(() => {
    const wanted = expected.trim().toLowerCase()
    if (!wanted) return null
    const results = state.entries.flatMap((entry) => {
      const data = entry.update?.status === 'done' ? (entry.update.data as HashData | null) : null
      return data ? [Object.values(data.hashes).some((value) => value.toLowerCase() === wanted)] : []
    })
    if (results.length === 0) return null
    return results.some(Boolean)
  }, [expected, state.entries])

  const start = () => app.run('hash', pending.map((entry) => entry.info.id), pending.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), { algorithms })

  const bar = (
    <ActionBar
      label={pending.length > 1 ? `${pending.length} Dateien prüfen` : 'Prüfsumme berechnen'}
      disabled={pending.length === 0 || algorithms.length === 0}
      running={running}
      onStart={start}
      onCancel={() => state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))}
      options={
        <div className="kf-row" role="group" aria-label="Verfahren">
          {ALGORITHMS.map((algorithm) => (
            <Toggle key={algorithm.id} checked={algorithms.includes(algorithm.id)} onChange={(on) => setAlgorithms(on ? [...algorithms, algorithm.id] : algorithms.filter((entry) => entry !== algorithm.id))}>
              {algorithm.label}
            </Toggle>
          ))}
        </div>
      }
    />
  )

  return (
    <Page
      tool="hash"
      hasFiles={state.entries.length > 0}
      dropLabel="Dateien zum Prüfen ablegen"
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'hash' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {state.entries.length > 0 ? (
        <>
          <div className="kf-compare-field">
            <label className="kf-field">
              <span className="kf-field__label">Vergleichswert (optional)</span>
              <span className="kf-input kf-input--mono">
                <input value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="Prüfsumme der Webseite hier einfügen" spellCheck={false} />
              </span>
            </label>
            {anyMatch === true ? (
              <span className="kf-status kf-status--ok">
                <Check className="kf-icon kf-icon--sm" aria-hidden="true" />
                Eine Datei stimmt überein
              </span>
            ) : anyMatch === false ? (
              <span className="kf-status kf-status--err">
                <X className="kf-icon kf-icon--sm" aria-hidden="true" />
                Keine Datei stimmt überein
              </span>
            ) : null}
          </div>
          <div className="app__list" aria-label="Dateiliste">
            {state.entries.map((entry) => {
              const data = entry.update?.status === 'done' ? (entry.update.data as HashData | null) : null
              return <FileRow key={entry.info.id} tool="hash" entry={entry} keepsHistory={false} note={data ? <HashList data={data} expected={expected} /> : undefined} onRemove={() => app.dispatch({ type: 'remove', tool: 'hash', id: entry.info.id })} />
            })}
          </div>
        </>
      ) : null}
    </Page>
  )
}
