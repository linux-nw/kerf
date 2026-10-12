import { useState } from 'react'
import { Info, Lock, Trash2 } from 'lucide-react'
import { extensionOf } from '@shared/tools'
import type { ArchiveFormat, ArchiveMode } from '@shared/types'
import { ActionBar } from '../components/ActionBar'
import { ArchiveArt } from '../components/art'
import { Dropzone } from '../components/Dropzone'
import { FileRow } from '../components/FileRow'
import { GroupRow } from '../components/GroupRow'
import { OutputDir } from '../components/OutputDir'
import { Page } from '../components/Page'
import { Field, Seg } from '../components/ui'
import { useApp } from '../context'
import { isActive, isPending } from '../store'

const UNPACKABLE = ['zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'cab', 'iso', 'wim', 'rar']

export function ArchiveView() {
  const app = useApp()
  const state = app.state.archive
  const [mode, setMode] = useState<ArchiveMode>('pack')
  const [format, setFormat] = useState<ArchiveFormat>('zip')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const pending = state.entries.filter(isPending)
  const running = state.entries.some((entry) => isActive(entry.update)) || isActive(state.group)
  const noPassword = mode === 'pack' && format === 'tar.gz'
  const unpackable = pending.filter((entry) => UNPACKABLE.includes(extensionOf(entry.info.path)))

  const start = () => {
    const options = { mode, format, password: noPassword ? '' : password, name, outputDir }
    if (mode === 'pack') {
      const id = crypto.randomUUID()
      app.run('archive', [], [{ id, paths: pending.map((entry) => entry.info.path) }], options, id)
    } else {
      app.run('archive', unpackable.map((entry) => entry.info.id), unpackable.map((entry) => ({ id: entry.info.id, paths: [entry.info.path] })), options)
    }
  }

  const count = mode === 'pack' ? pending.length : unpackable.length

  const bar = (
    <ActionBar
      label={mode === 'pack' ? (pending.length > 1 ? `${pending.length} Dateien packen` : 'Packen') : count > 1 ? `${count} Archive entpacken` : 'Entpacken'}
      disabled={count === 0}
      running={running}
      onStart={start}
      onCancel={() => {
        state.entries.forEach((entry) => isActive(entry.update) && app.cancel(entry.info.id))
        if (state.groupId) app.cancel(state.groupId)
      }}
      options={
        <>
          <Seg label="Modus" value={mode} items={[{ id: 'pack', label: 'Packen' }, { id: 'unpack', label: 'Entpacken' }]} onChange={setMode} />
          {mode === 'pack' ? <Seg label="Format" value={format} items={[{ id: 'zip', label: 'ZIP' }, { id: '7z', label: '7z' }, { id: 'tar.gz', label: 'tar.gz' }]} onChange={setFormat} /> : null}
          <Field label={noPassword ? 'Passwort (geht bei tar.gz nicht)' : 'Passwort (optional)'}>
            <span className="kf-input">
              <input type="password" value={password} disabled={noPassword} onChange={(event) => setPassword(event.target.value)} autoComplete="off" aria-label="Passwort" />
            </span>
          </Field>
          {mode === 'pack' ? (
            <Field label="Name des Archivs">
              <span className="kf-input">
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Archiv" aria-label="Name des Archivs" />
              </span>
            </Field>
          ) : null}
          <OutputDir value={outputDir} onChange={setOutputDir} />
        </>
      }
    />
  )

  const twin = (kind: ArchiveMode) => (
    <Dropzone
      compact={false}
      hero
      art={<ArchiveArt kind={kind} />}
      label={kind === 'pack' ? 'Packen' : 'Entpacken'}
      hint={kind === 'pack' ? 'Dateien und Ordner hier ablegen. Kerf macht ein Archiv daraus.' : 'Ein Archiv hier ablegen. Der Inhalt landet in einem neuen Ordner daneben.'}
      onPick={() => {
        setMode(kind)
        app.pick('archive')
      }}
      onDropFiles={(files) => {
        setMode(kind)
        app.drop('archive', files)
      }}
    >
      <div className="kf-drop__extra" aria-hidden="true">
        {(kind === 'pack' ? ['ZIP', '7z', 'tar.gz'] : ['ZIP', '7z', 'RAR', 'tar.gz', 'ISO']).map((label, index) => (
          <span key={label} className={`kf-c kf-c--mono kf-c--static${kind === 'pack' && index === 0 ? ' is-on' : ''}`}>
            {label}
          </span>
        ))}
        {kind === 'pack' ? (
          <span className="kf-c kf-c--mono kf-c--static">
            <Lock className="kf-icon" style={{ strokeWidth: 1.75 }} />
            Passwort
          </span>
        ) : null}
      </div>
    </Dropzone>
  )

  const startView = (
    <div className="kf-start kf-start--tight">
      <div className="kf-twin">
        {twin('pack')}
        {twin('unpack')}
      </div>
      <div className="kf-footnote">
        <Info className="kf-icon" aria-hidden="true" />
        Ziehen, klicken oder Strg V. Die Zone, auf die du ablegst, bestimmt, ob gepackt oder entpackt wird.
      </div>
    </div>
  )

  return (
    <Page
      tool="archive"
      hasFiles={state.entries.length > 0}
      start={startView}
      subtitle="Dateien einpacken oder Pakete öffnen. Mit Passwort, wenn du willst."
      dropLabel={mode === 'pack' ? 'Dateien oder Ordner zum Packen ablegen' : 'Archive zum Entpacken ablegen'}
      bar={bar}
      headRight={
        state.entries.length > 0 && !running ? (
          <button type="button" className="kf-btn kf-btn--ghost kf-btn--sm" onClick={() => app.dispatch({ type: 'clear', tool: 'archive' })}>
            <Trash2 className="kf-icon kf-icon--sm" aria-hidden="true" />
            Liste leeren
          </button>
        ) : null
      }
    >
      {state.group ? <GroupRow update={state.group} title="Archiv" onDismiss={() => app.dispatch({ type: 'queue', tool: 'archive', ids: [], groupId: null })} /> : null}
      {state.entries.length > 0 ? (
        <div className="app__list" aria-label="Dateiliste">
          {state.entries.map((entry) => (
            <FileRow key={entry.info.id} tool="archive" entry={entry} doneLabel="Entpackt" onRemove={() => app.dispatch({ type: 'remove', tool: 'archive', id: entry.info.id })} />
          ))}
        </div>
      ) : null}
    </Page>
  )
}
