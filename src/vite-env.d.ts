/// <reference types="vite/client" />

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
  }): (reloadPage?: boolean) => Promise<void>
}

interface Window {
  WordAssistantAndroid?: {
    checkForUpdate: (manifestUrls: string, userInitiated: boolean) => void
    getAppVersion: () => string
    startBackgroundPlayback: () => void
    stopBackgroundPlayback: () => void
    pickTextFile: () => void
    downloadAudio: (url: string, requestId: string) => void
  }
}
/// <reference types="vite-plugin-pwa/client" />
