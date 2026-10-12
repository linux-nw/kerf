import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Download, FolderOpen, HardDrive, Info, Loader2, RefreshCw, ScanText, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { formatBytes } from '@shared/format'
import { OCR_LANGUAGES } from '@shared/tools'
import type { AiProvider, AiStatus, AppInfo, OcrOutput } from '@shared/types'
import { ChipToggle, Field, Seg, Switch } from '../components/ui'
import { useApp } from '../context'

const OUTPUTS: Array<{ id: OcrOutput; label: string }> = [
  { id: 'pdf', label: 'Durchsuchbare PDF' },
  { id: 'txt', label: 'Text' },
  { id: 'md', label: 'Markdown' },
  { id: 'docx', label: 'Word' }
]

const GEMMA = [
  { id: 'gemma4:e4b', title: 'Gemma 4 E4B', size: 'ca. 9,6 GB', note: 'Empfohlen. Findet Erkennungsfehler zuverlässig. Läuft gut ab etwa 16 GB Arbeitsspeicher.', recommended: true },
  { id: 'gemma4:e2b', title: 'Gemma 4 E2B', size: 'ca. 7,2 GB', note: 'Für schwächere Rechner. Etwas weniger gründlich, dafür schneller.', recommended: false }
]

function Section({ icon: Icon, title, text, children }: { icon: typeof SlidersHorizontal; title: string; text: string; children: ReactNode }) {
  return (
    <section className="kf-set" aria-label={title}>
      <div className="kf-set__head">
        <span className="kf-ib kf-ib--sm">
          <Icon className="kf-icon" aria-hidden="true" />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Row({ title, text, children, stack, off }: { title: string; text?: ReactNode; children: ReactNode; stack?: boolean; off?: boolean }) {
  return (
    <div className={`kf-set__row${stack ? ' is-stack' : ''}${off ? ' is-off' : ''}`}>
      <div>
        <b>{title}</b>
        {text ? <span className="kf-set__t">{text}</span> : null}
      </div>
      <div className="kf-set__ctl">{children}</div>
    </div>
  )
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function installed(status: AiStatus | null, id: string): boolean {
  return status?.models.some((model) => model.id === id || model.id.startsWith(`${id}-`)) ?? false
}

function AiSection() {
  const app = useApp()
  const settings = app.settings
  const ai = settings?.ai
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [custom, setCustom] = useState('')
  const handled = useRef(new Set<string>())

  useEffect(() => {
    if (ai) {
      setUrl(ai.baseUrl)
      setKey(ai.apiKey)
    }
  }, [ai?.baseUrl, ai?.apiKey, ai?.provider])

  const provider = ai?.provider
  const baseUrl = ai?.baseUrl
  const apiKey = ai?.apiKey

  const check = useCallback(async () => {
    if (!provider || !baseUrl) return
    setChecking(true)
    const result = await window.kerf.aiStatus({ provider, baseUrl, apiKey: apiKey ?? '' })
    setStatus(result)
    setChecking(false)
  }, [provider, baseUrl, apiKey])

  useEffect(() => {
    void check()
  }, [check])

  const model = ai?.model ?? ''
  const saveAi = app.saveSettings
  useEffect(() => {
    for (const pull of Object.values(app.pulls)) {
      if (!pull.done || handled.current.has(pull.model)) continue
      handled.current.add(pull.model)
      if (!pull.error) {
        void check()
        if (model === '') void saveAi({ ai: { model: pull.model } })
      }
    }
  }, [app.pulls, check, model, saveAi])

  if (!ai || !settings) return null

  const pulling = Object.values(app.pulls).some((pull) => !pull.done)
  const startPull = (id: string) => {
    handled.current.delete(id)
    app.dismissPull(id)
    void window.kerf.aiPull(ai.baseUrl, id)
  }

  const commitConnection = () => {
    const patch: { baseUrl?: string; apiKey?: string } = {}
    if (url.trim() !== ai.baseUrl) patch.baseUrl = url.trim()
    if (key !== ai.apiKey) patch.apiKey = key
    if (Object.keys(patch).length > 0) void app.saveSettings({ ai: patch })
  }

  const setProvider = (next: AiProvider) => {
    if (next === ai.provider) return
    const baseUrlForProvider = next === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1'
    void app.saveSettings({ ai: { provider: next, baseUrl: baseUrlForProvider, model: '' } })
  }

  const badge = checking ? (
    <span className="kf-set__badge is-wait">
      <Loader2 className="kf-icon kf-spin" aria-hidden="true" />
      Prüft …
    </span>
  ) : status?.reachable ? (
    <span className="kf-set__badge is-ok">
      <Check className="kf-icon" aria-hidden="true" />
      Verbunden{status.version ? ` · Version ${status.version}` : ''}
    </span>
  ) : (
    <span className="kf-set__badge is-bad">
      <X className="kf-icon" aria-hidden="true" />
      {status && !status.hostAllowed ? 'Adresse nicht erlaubt' : 'Nicht erreichbar'}
    </span>
  )

  const models = status?.models ?? []
  const modelMissing = ai.enabled && ai.model === ''

  return (
    <Section icon={Sparkles} title="KI-Aufbereitung" text="Ein lokales Sprachmodell bessert Erkennungsfehler aus. Der Text verlässt dabei nie deinen Rechner oder dein Heimnetz.">
      <div className={`kf-big${ai.enabled ? ' is-on' : ''}`}>
        <div className="kf-big__t">
          <b>Texterkennung mit KI nachbessern</b>
          <span>{ai.enabled ? 'An. Kerf schickt den erkannten Text an das gewählte Modell und übernimmt nur kleine, sichere Korrekturen.' : 'Aus. Der Text bleibt so, wie die Erkennung ihn liefert.'}</span>
        </div>
        <Switch checked={ai.enabled} onChange={(enabled) => void app.saveSettings({ ai: { enabled } })}>
          {ai.enabled ? 'An' : 'Aus'}
        </Switch>
      </div>
      {modelMissing ? (
        <div className="kf-set__row is-stack">
          <div className="kf-callout kf-callout--warn">
            <Info className="kf-icon" aria-hidden="true" />
            Noch kein Modell gewählt. Ohne Modell läuft die Erkennung wie sonst. Wähle unten eines aus oder lade eines herunter.
          </div>
        </div>
      ) : null}
      <Row title="Anbieter" text={ai.provider === 'ollama' ? 'Ollama läuft auf deinem Rechner und lädt Modelle für dich herunter.' : 'Jeder Server mit OpenAI-Schnittstelle, zum Beispiel LM Studio, llama.cpp oder vLLM.'}>
        <Seg label="Anbieter" value={ai.provider} items={[{ id: 'ollama', label: 'Ollama' }, { id: 'openai', label: 'Anderer (OpenAI-kompatibel)' }]} onChange={setProvider} />
      </Row>
      <div className="kf-set__row is-stack">
        <div className="kf-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <Field label="Adresse" help="Erlaubt: dieser Rechner und dein Heimnetz, zum Beispiel 127.0.0.1 oder 192.168.x.x">
              <span className="kf-input kf-input--mono">
                <input value={url} onChange={(event) => setUrl(event.target.value)} onBlur={commitConnection} spellCheck={false} aria-label="Adresse des KI-Servers" />
              </span>
            </Field>
          </div>
          {ai.provider === 'openai' ? (
            <div style={{ width: 240 }}>
              <Field label="Schlüssel (optional)">
                <span className="kf-input kf-input--mono">
                  <input type="password" value={key} onChange={(event) => setKey(event.target.value)} onBlur={commitConnection} autoComplete="off" aria-label="API-Schlüssel" />
                </span>
              </Field>
            </div>
          ) : null}
          <button type="button" className="kf-btn kf-btn--secondary" onClick={() => { commitConnection(); void check() }}>
            <RefreshCw className="kf-icon kf-icon--sm" aria-hidden="true" />
            Verbindung prüfen
          </button>
          {badge}
        </div>
        {status && !status.reachable && status.error ? <span className="kf-set__t kf-muted">{status.error}</span> : null}
      </div>
      <div className="kf-lbl" style={{ padding: '14px 20px 8px', borderTop: '1px solid var(--line)' }}>
        <span>Modelle auf diesem Server<em>{models.length > 0 ? `${models.length} gefunden` : ''}</em></span>
      </div>
      <div className="kf-models" role="radiogroup" aria-label="Modell wählen">
        {models.map((item) => (
          <button key={item.id} type="button" role="radio" aria-checked={ai.model === item.id} className={`kf-model${ai.model === item.id ? ' is-on' : ''}`} onClick={() => void app.saveSettings({ ai: { model: item.id } })}>
            <span className="kf-radio" aria-hidden="true" />
            <span className="kf-model__name">{item.label}</span>
            <span className="kf-model__meta">{item.detail ?? ''}</span>
            <span className="kf-model__meta">{item.sizeBytes ? formatBytes(item.sizeBytes) : ''}</span>
          </button>
        ))}
        {models.length === 0 ? <div className="kf-model__empty">{status?.reachable ? 'Hier ist noch kein Modell installiert.' : 'Sobald die Verbindung steht, erscheinen hier deine Modelle.'}</div> : null}
      </div>
      {ai.provider === 'ollama' ? (
        <>
          <div className="kf-lbl" style={{ padding: '14px 20px 8px', borderTop: '1px solid var(--line)' }}>
            <span>Empfohlene Modelle herunterladen</span>
          </div>
          {GEMMA.map((entry) => {
            const have = installed(status, entry.id)
            const pull = app.pulls[entry.id]
            const active = pull !== undefined && !pull.done
            const percent = pull && pull.total ? Math.min(100, Math.round(((pull.completed ?? 0) / pull.total) * 100)) : null
            return (
              <div key={entry.id} className="kf-big" style={{ alignItems: 'flex-start' }}>
                <div className="kf-big__t">
                  <b>
                    {entry.title} <span className="kf-model__meta">{entry.id} · {entry.size}</span>
                  </b>
                  <span>{entry.note}</span>
                  {pull && (active || pull.error) ? (
                    <div className="kf-dl" style={{ marginTop: 10 }}>
                      {active ? (
                        <div className="kf-progress" role="progressbar" aria-valuenow={percent ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                          <div className="kf-progress__bar" style={{ width: `${percent ?? 4}%` }} />
                        </div>
                      ) : null}
                      {active ? <span className="kf-progress__pct">{percent === null ? '…' : `${percent} %`}</span> : null}
                      <span className="kf-dl__status">{pull.error ? `Fehler: ${pull.error}` : pull.status}</span>
                    </div>
                  ) : null}
                </div>
                {have ? (
                  <span className="kf-set__badge is-ok">
                    <Check className="kf-icon" aria-hidden="true" />
                    Installiert
                  </span>
                ) : active ? (
                  <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void window.kerf.aiPullCancel()}>
                    <X className="kf-icon kf-icon--sm" aria-hidden="true" />
                    Abbrechen
                  </button>
                ) : (
                  <button type="button" className={`kf-btn kf-btn--sm ${entry.recommended ? 'kf-btn--primary' : 'kf-btn--secondary'}`} disabled={pulling || !status?.reachable} onClick={() => startPull(entry.id)}>
                    <Download className="kf-icon kf-icon--sm" aria-hidden="true" />
                    Herunterladen
                  </button>
                )}
              </div>
            )
          })}
          <div className="kf-set__row">
            <div>
              <b>Anderes Modell laden</b>
              <span className="kf-set__t">Name wie bei Ollama, zum Beispiel qwen3:8b.</span>
            </div>
            <div className="kf-set__ctl">
              <span className="kf-input kf-input--mono" style={{ width: 200 }}>
                <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="modell:größe" spellCheck={false} aria-label="Modellname" />
              </span>
              <button
                type="button"
                className="kf-btn kf-btn--secondary kf-btn--sm"
                disabled={pulling || !status?.reachable || !/^[\w.\-:/]{1,120}$/.test(custom.trim())}
                onClick={() => {
                  startPull(custom.trim())
                  setCustom('')
                }}
              >
                <Download className="kf-icon kf-icon--sm" aria-hidden="true" />
                Laden
              </button>
            </div>
          </div>
        </>
      ) : null}
    </Section>
  )
}

export function SettingsView() {
  const app = useApp()
  const settings = app.settings
  const [info, setInfo] = useState<AppInfo | null>(null)
  const available = app.caps?.ocrLanguages

  useEffect(() => {
    void window.kerf.getAppInfo().then(setInfo)
  }, [])

  const languages = OCR_LANGUAGES.filter((entry) => !available || available.includes(entry.code))

  return (
    <main className="app__main">
      <header className="app__head">
        <div>
          <h1 className="title-lg app__title">Einstellungen</h1>
          <p className="app__sub">Wie Kerf standardmäßig arbeitet. Alles bleibt auf diesem Rechner.</p>
        </div>
      </header>
      <div className="app__scroll">
        {settings ? (
          <div className="kf-settings">
            <Section icon={SlidersHorizontal} title="Allgemein" text="Wohin Ergebnisse gehen und was Kerf sich merkt.">
              <Row title="Standard-Ausgabeordner" text={settings.outputDir ?? 'Ohne Auswahl landet das Ergebnis neben dem Original.'}>
                <button type="button" className="kf-btn kf-btn--secondary kf-btn--sm" onClick={() => void window.kerf.pickOutputDir().then((dir) => { if (dir) void app.saveSettings({ outputDir: dir }) })}>
                  <FolderOpen className="kf-icon kf-icon--sm" aria-hidden="true" />
                  {settings.outputDir ? folderName(settings.outputDir) : 'Ordner wählen'}
                </button>
                {settings.outputDir ? (
                  <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => void app.saveSettings({ outputDir: null })}>
                    Zurücksetzen
                  </button>
                ) : null}
              </Row>
              <Row title="Verlauf speichern" text="Merkt sich fertige Aufgaben mit Link zur Datei. Die Dateien selbst werden nie angefasst.">
                <Switch checked={settings.historyEnabled} onChange={(historyEnabled) => void app.saveSettings({ historyEnabled })}>
                  {settings.historyEnabled ? 'An' : 'Aus'}
                </Switch>
                <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" disabled={app.history.length === 0} onClick={app.askClearHistory}>
                  <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
                  Verlauf leeren
                </button>
              </Row>
            </Section>

            <Section icon={ScanText} title="Texterkennung" text="Diese Auswahl ist beim Öffnen der Texterkennung schon gesetzt.">
              <Row title="Sprachen" stack text="Alles anhaken, was oft in deinen Dokumenten vorkommt.">
                <div className="kf-chips" role="group" aria-label="Standardsprachen">
                  {languages.map((entry) => (
                    <ChipToggle
                      key={entry.code}
                      on={settings.ocrLanguages.includes(entry.code)}
                      onChange={(on) => {
                        const next = on ? [...settings.ocrLanguages, entry.code] : settings.ocrLanguages.filter((code) => code !== entry.code)
                        if (next.length > 0) void app.saveSettings({ ocrLanguages: next })
                      }}
                    >
                      {entry.label}
                    </ChipToggle>
                  ))}
                </div>
              </Row>
              <Row title="Ergebnis" stack text="Was Kerf standardmäßig erzeugt.">
                <div className="kf-chips" role="group" aria-label="Standardausgabe">
                  {OUTPUTS.map((entry) => (
                    <ChipToggle
                      key={entry.id}
                      on={settings.ocrOutputs.includes(entry.id)}
                      onChange={(on) => {
                        const next = on ? [...settings.ocrOutputs, entry.id] : settings.ocrOutputs.filter((id) => id !== entry.id)
                        if (next.length > 0) void app.saveSettings({ ocrOutputs: next })
                      }}
                    >
                      {entry.label}
                    </ChipToggle>
                  ))}
                </div>
              </Row>
            </Section>

            <AiSection />

            <Section icon={HardDrive} title="Über Kerf" text="Version und Ablageorte. Kerf funkt nie nach Hause.">
              <div className="kf-about">
                <div>
                  <b>Version</b>
                  <span>{info?.version ?? '…'}</span>
                </div>
                <div>
                  <b>System</b>
                  <span>{info?.platform ?? '…'}</span>
                </div>
                <div>
                  <b>Datenordner</b>
                  <span>{info?.dataPath ?? '…'}</span>
                </div>
                <div>
                  <b>Texterkennung</b>
                  <span>{available ? `${available.length} Sprachen installiert` : '…'}</span>
                </div>
                <div>
                  <b>Office-Umwandlung</b>
                  <span>{app.caps ? (app.caps.libreoffice ? 'LibreOffice gefunden' : app.caps.msoffice ? 'Microsoft Office gefunden' : 'Nicht gefunden, nur einfache Darstellung') : '…'}</span>
                </div>
                <div>
                  <b>Audio und Video</b>
                  <span>{app.caps ? (app.caps.ffmpeg ? 'FFmpeg gefunden' : 'FFmpeg nicht gefunden') : '…'}</span>
                </div>
              </div>
            </Section>
          </div>
        ) : (
          <p className="kf-caption">Einstellungen werden geladen …</p>
        )}
      </div>
    </main>
  )
}
