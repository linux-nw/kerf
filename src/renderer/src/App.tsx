import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatBytes, parseTargetBytes, savedPercent } from '@shared/format'
import type { AddResult, CompressOptions, NetworkStatus } from '@shared/types'
import { Banner } from './components/Banner'
import { Dropzone } from './components/Dropzone'
import { FileRow } from './components/FileRow'
import { Inspector } from './components/Inspector'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { addFiles, applyUpdate, defaultOptions, isActive, isFinal, totals, type Entry } from './state'
import { applyTheme, loadTheme, saveTheme, type ThemeChoice } from './theme'

const themes: { id: ThemeChoice; label: string }[] = [
  { id: 'dark', label: 'Dunkel' },
  { id: 'light', label: 'Hell' },
  { id: 'system', label: 'System' }
]

export function App() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [options, setOptions] = useState<CompressOptions>(defaultOptions)
  const [targetText, setTargetText] = useState('2')
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('MB')
  const [running, setRunning] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme)
  const [network, setNetwork] = useState<NetworkStatus | null>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
    if (theme !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const listener = () => applyTheme('system')
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [theme])

  const refreshNetwork = useCallback(() => {
    void window.kerf.getNetworkStatus().then(setNetwork)
  }, [])

  useEffect(() => {
    refreshNetwork()
    const timer = window.setInterval(refreshNetwork, 5000)
    return () => window.clearInterval(timer)
  }, [refreshNetwork])

  const receive = useCallback((result: AddResult) => {
    setSkipped(result.skipped)
    if (result.files.length > 0) setEntries((current) => addFiles(current.filter((e) => !isFinal(e) || e.update?.status === 'done'), result.files))
  }, [])

  useEffect(() => {
    const offUpdate = window.kerf.onJobUpdate((update) => setEntries((current) => applyUpdate(current, update)))
    const offOpened = window.kerf.onFilesOpened(receive)
    return () => {
      offUpdate()
      offOpened()
    }
  }, [receive])

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const targetBytes = useMemo(() => parseTargetBytes(targetText, targetUnit), [targetText, targetUnit])
  const targetInvalid = options.preset === 'target' && targetBytes === null

  const pending = entries.filter((entry) => !entry.update || entry.update.status === 'cancelled' || entry.update.status === 'error')
  const canStart = pending.length > 0 && !targetInvalid

  const start = async () => {
    const batch = entriesRef.current.filter((entry) => !entry.update || entry.update.status === 'cancelled' || entry.update.status === 'error')
    if (batch.length === 0) return
    setRunning(true)
    setSkipped([])
    try {
      await window.kerf.startJobs(
        batch.map((entry) => ({ id: entry.info.id, path: entry.info.path })),
        { ...options, targetBytes: options.preset === 'target' ? targetBytes : null }
      )
    } finally {
      setRunning(false)
    }
  }

  const sum = totals(entries)
  const active = entries.filter(isActive).length
  const done = entries.filter(isFinal).length
  const errors = entries.filter((entry) => entry.update?.status === 'error')
  const passwordFiles = errors.filter((entry) => entry.update?.errorCode === 'password')
  const allDone = entries.length > 0 && !running && active === 0 && done === entries.length

  return (
    <div className="app">
      <div className="app__body">
        <Sidebar active="compress" queueCount={active} />

        <main className="app__main">
          <header className="app__head">
            <div>
              <h1 className="title-lg app__title">PDFs komprimieren</h1>
              <p className="app__sub">
                {entries.length === 0 ? 'Noch nichts da. Leg Dateien ab, um zu starten.' : `${entries.length} ${entries.length === 1 ? 'Datei' : 'Dateien'}, ${formatBytes(entries.reduce((n, e) => n + e.info.size, 0))}`}
              </p>
            </div>
            <div className="kf-row">
              <div className="kf-seg" role="radiogroup" aria-label="Erscheinungsbild">
                {themes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === item.id}
                    className={`kf-seg__item${theme === item.id ? ' is-active' : ''}`}
                    onClick={() => setTheme(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {entries.length > 0 && !running ? (
                <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => setEntries([])}>
                  <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
                  Liste leeren
                </button>
              ) : null}
            </div>
          </header>

          <div className="app__scroll">
            <Dropzone
              compact={entries.length > 0}
              disabled={running}
              onPick={() => void window.kerf.pickFiles().then(receive)}
              onDropFiles={(files) => void window.kerf.addPaths(window.kerf.pathsForFiles(files)).then(receive)}
            />

            {skipped.length > 0 ? (
              <Banner tone="warning" title={`${skipped.length} ${skipped.length === 1 ? 'Datei wurde' : 'Dateien wurden'} übersprungen`}>
                Aktuell geht nur PDF. Übersprungen: {skipped.slice(0, 3).join(', ')}
                {skipped.length > 3 ? ` und ${skipped.length - 3} weitere` : ''}.
              </Banner>
            ) : null}

            {passwordFiles.length > 0 ? (
              <Banner tone="danger" title={`${passwordFiles[0]?.info.name ?? 'Eine Datei'} braucht ein Passwort`}>
                Geschützte PDFs kann Kerf noch nicht öffnen. Der Rest der Liste wurde normal verarbeitet.
              </Banner>
            ) : null}

            {allDone && sum.finished > 0 ? (
              <Banner tone="success" title={`${sum.finished} ${sum.finished === 1 ? 'Datei' : 'Dateien'} fertig. Du hast ${formatBytes(sum.before - sum.after)} gespart.`}>
                Die Originale sind unverändert.
              </Banner>
            ) : null}

            {entries.length > 0 ? (
              <div className="app__list" aria-label="Dateiliste">
                {entries.map((entry) => (
                  <FileRow
                    key={entry.info.id}
                    entry={entry}
                    onRemove={() => setEntries((current) => current.filter((e) => e.info.id !== entry.info.id))}
                    onCancel={() => void window.kerf.cancelJob(entry.info.id)}
                    onShow={(path) => void window.kerf.showInFolder(path)}
                  />
                ))}
              </div>
            ) : null}

            {sum.finished > 0 ? (
              <div className="kf-total app__total">
                <span className="kf-total__label">Gespart</span>
                <span className="kf-total__value">{formatBytes(sum.before - sum.after)}</span>
                <div
                  className="kf-total__bar"
                  role="img"
                  aria-label={`${Math.abs(savedPercent(sum.before, sum.after))} Prozent kleiner`}
                >
                  <span style={{ width: `${Math.max(2, Math.min(100, 100 + savedPercent(sum.before, sum.after)))}%` }} />
                </div>
                <div className="kf-total__foot">
                  <span>Vorher {formatBytes(sum.before)}</span>
                  <span>Nachher {formatBytes(sum.after)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </main>

        <Inspector
          options={options}
          targetText={targetText}
          targetUnit={targetUnit}
          targetInvalid={targetInvalid}
          running={running}
          canStart={canStart}
          onOptions={(next) => setOptions((current) => ({ ...current, ...next }))}
          onTargetText={setTargetText}
          onTargetUnit={setTargetUnit}
          onPickOutput={() => void window.kerf.pickOutputDir().then((dir) => dir && setOptions((current) => ({ ...current, outputDir: dir })))}
          onStart={() => void start()}
          onCancelAll={() => void window.kerf.cancelAll()}
        />
      </div>
      <StatusBar network={network} />
    </div>
  )
}
