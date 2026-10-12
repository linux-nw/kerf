import type { ReactNode } from 'react'
import { toolMeta, type ToolId } from '@shared/tools'
import { Dropzone } from './Dropzone'
import { Notice } from './ui'
import { useApp } from '../context'

interface Props {
  tool: ToolId
  children?: ReactNode
  start?: ReactNode
  top?: ReactNode
  bar?: ReactNode
  hasFiles: boolean
  disabled?: boolean
  headRight?: ReactNode
  dropLabel?: string
  subtitle?: string
}

export function Page({ tool, children, start, top, bar, hasFiles, disabled, headRight, dropLabel, subtitle }: Props) {
  const app = useApp()
  const meta = toolMeta(tool)
  const state = app.state[tool]
  const showStart = !hasFiles && start !== undefined
  return (
    <>
      <main className="app__main">
        <header className="app__head">
          <div>
            <h1 className="title-lg app__title">{meta.title}</h1>
            <p className="app__sub">{subtitle ?? meta.subtitle}</p>
          </div>
          {headRight}
        </header>
        <div className={`app__scroll${showStart ? ' app__scroll--start' : ''}`}>
          {state.notice ? (
            <Notice tone="warning" onClose={() => app.dispatch({ type: 'notice', tool, text: null })}>
              {state.notice}
            </Notice>
          ) : null}
          {showStart ? (
            start
          ) : (
            <>
              {top}
              <Dropzone compact disabled={disabled} label={dropLabel ?? 'Dateien hier ablegen'} onPick={() => app.pick(tool)} onDropFiles={(files) => app.drop(tool, files)} />
              {children}
            </>
          )}
        </div>
      </main>
      {showStart ? null : bar}
    </>
  )
}
