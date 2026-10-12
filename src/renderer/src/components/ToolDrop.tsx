import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { ToolId } from '@shared/tools'
import { useApp } from '../context'
import { Dropzone } from './Dropzone'

interface Props {
  tool: ToolId
  label: string
  hint?: ReactNode
  icon?: LucideIcon
  layout?: 'center' | 'row'
  fixed?: boolean
  dim?: boolean
  className?: string
  disabled?: boolean
  children?: ReactNode
}

export function ToolDrop({ tool, label, hint, icon, layout, fixed, dim, className, disabled, children }: Props) {
  const app = useApp()
  return (
    <Dropzone compact={false} hero disabled={disabled} label={label} hint={hint} icon={icon} layout={layout} fixed={fixed} dim={dim} className={className} onPick={() => app.pick(tool)} onDropFiles={(files) => app.drop(tool, files)}>
      {children}
    </Dropzone>
  )
}
