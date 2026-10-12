import type { ReactNode } from 'react'
import { toolMeta, type ToolId } from '@shared/tools'
import { Dropzone } from './Dropzone'
import { Notice } from './ui'
import { useApp } from '../context'

interface Props {
  tool: ToolId
  children?: ReactNode
  bar?: ReactNode
  hasFiles: boolean
  disabled?: boolean
  allowFolders?: boolean
  headRight?: ReactNode
  dropLabel?: string
}

export function Page({ tool, children, bar, hasFiles, disabled, allowFolders = true, headRight, dropLabel }: Props) {
  const app = useApp()
  const meta = toolMeta(tool)
  const state = app.state[tool]
  return (
    <>
      <main className="app__main">
        <header className="app__head">
          <div>
            <h1 className="title-lg app__title">{meta.title}</h1>
            <p className="app__sub">{meta.subtitle}</p>
          </div>
          {headRight}
        </header>
        <div className="app__scroll">
          <Dropzone
            compact={hasFiles}
            disabled={disabled}
            label={dropLabel ?? 'Dateien hier ablegen'}
            formats={meta.acceptLabel}
            allowFolders={allowFolders}
            onPick={() => app.pick(tool)}
            onPickFolder={() => app.pickFolder(tool)}
            onPaste={() => app.paste(tool)}
            onDropFiles={(files) => app.drop(tool, files)}
          />
          {state.notice ? (
            <Notice tone="warning" onClose={() => app.dispatch({ type: 'notice', tool, text: null })}>
              {state.notice}
            </Notice>
          ) : null}
          {children}
        </div>
      </main>
      {bar}
    </>
  )
}
