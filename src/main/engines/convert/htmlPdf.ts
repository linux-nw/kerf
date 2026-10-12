import { EngineError } from '../../errors'

export type HtmlToPdf = (html: string) => Promise<Uint8Array>

let renderer: HtmlToPdf | null = null

export function setHtmlToPdf(next: HtmlToPdf): void {
  renderer = next
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  if (!renderer) throw new EngineError('toolmissing', 'Die PDF-Ausgabe aus HTML ist hier nicht verfügbar')
  return renderer(html)
}

export function wrapHtml(title: string, body: string): string {
  const safeTitle = title.replace(/[<>&]/g, '')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${safeTitle}</title><style>
body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.5;color:#111;margin:0;padding:0}
h1,h2,h3,h4{line-height:1.25;margin:1.2em 0 .5em}
h1{font-size:20pt}h2{font-size:16pt}h3{font-size:13pt}
p{margin:.6em 0}
pre,code{font-family:Consolas,"Courier New",monospace;font-size:10pt}
pre{background:#f4f4f4;padding:10px;border-radius:4px;white-space:pre-wrap;word-wrap:break-word}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:10pt}
th,td{border:1px solid #bbb;padding:4px 8px;text-align:left;vertical-align:top}
th{background:#eee}
img{max-width:100%}
blockquote{border-left:3px solid #ccc;margin:1em 0;padding:0 1em;color:#444}
a{color:#0b57d0}
</style></head><body>${body}</body></html>`
}
