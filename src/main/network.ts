export function isLocalUrl(url: string, devServerUrl: string | undefined): boolean {
  if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('data:') || url.startsWith('blob:')) return true
  if (!devServerUrl) return false
  try {
    const target = new URL(url)
    const dev = new URL(devServerUrl)
    return target.origin === dev.origin || (target.protocol === 'ws:' && target.host === dev.host)
  } catch {
    return false
  }
}
