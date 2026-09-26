type DesktopResponse = {
  cachePath?: string
  audioDataUrl?: string
  restartRequired?: boolean
  cancelled?: boolean
  error?: string
  updateStatus?: 'current' | 'available' | 'installing' | 'cancelled'
  version?: string
}

type WebViewBridge = {
  postMessage: (message: unknown) => void
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void
}

declare global {
  interface Window {
    chrome?: { webview?: WebViewBridge }
  }
}

export const isWindowsDesktop = window.location.hostname === 'app.cet6.local' && Boolean(window.chrome?.webview)

export function desktopRequest(
  action: 'getCachePath' | 'chooseCachePath' | 'restart' | 'fetchEnglishAudio' | 'checkUpdate',
  request: { text?: string; rate?: number; manifestUrls?: string[]; userInitiated?: boolean } = {},
): Promise<DesktopResponse> {
  const bridge = window.chrome?.webview
  if (!bridge) return Promise.reject(new Error('当前不是 Windows 桌面版'))
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      bridge.removeEventListener('message', receive)
      reject(new Error('桌面功能响应超时'))
    }, action === 'checkUpdate' ? 180000 : 15000)
    const receive = (event: MessageEvent) => {
      const message = event.data as { id?: string; payload?: DesktopResponse }
      if (message.id !== id) return
      window.clearTimeout(timeout)
      bridge.removeEventListener('message', receive)
      if (message.payload?.error) reject(new Error(message.payload.error))
      else resolve(message.payload ?? {})
    }
    bridge.addEventListener('message', receive)
    bridge.postMessage({ id, action, ...request })
  })
}
