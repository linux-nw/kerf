import { useEffect, useState } from 'react'
import type { PdfInfo } from '@shared/types'

export function usePdfInfo(path: string | null): { info: PdfInfo | null; error: string | null } {
  const [info, setInfo] = useState<PdfInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setInfo(null)
    setError(null)
    if (!path) return
    let alive = true
    window.kerf
      .pdfInfo(path)
      .then((result) => alive && setInfo(result))
      .catch((reason: unknown) => alive && setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '') : 'Die Datei konnte nicht gelesen werden'))
    return () => {
      alive = false
    }
  }, [path])
  return { info, error }
}

export function usePdfThumbs(path: string | null, pages: number, width: number): Record<number, string> {
  const [urls, setUrls] = useState<Record<number, string>>({})
  useEffect(() => {
    setUrls({})
    if (!path || pages === 0) return
    let alive = true
    const created: string[] = []
    void (async () => {
      for (let page = 1; page <= pages && alive; page += 1) {
        try {
          const data = await window.kerf.pdfPage(path, page, width)
          if (!alive) return
          const url = URL.createObjectURL(new Blob([data.slice().buffer], { type: 'image/png' }))
          created.push(url)
          setUrls((current) => ({ ...current, [page]: url }))
        } catch {
          return
        }
      }
    })()
    return () => {
      alive = false
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [path, pages, width])
  return urls
}
