import { BrowserWindow } from 'electron'

export async function htmlToPdfWindow(html: string): Promise<Uint8Array> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, images: true }
  })
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7 } })
    return new Uint8Array(pdf)
  } finally {
    window.destroy()
  }
}
