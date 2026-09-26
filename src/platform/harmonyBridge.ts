import type { QueueItem } from '../domain/types'

/**
 * ArkWeb 宿主应向 window.cet6Harmony 注入同名方法。
 * PWA 中不存在桥接时，调用方必须退回 Web Speech / 文件输入能力。
 */
export interface HarmonyBridge {
  platformVersion(): Promise<{ harmonyVersion: string; apiLevel: number }>
  startBackgroundPlayback(queue: QueueItem[]): Promise<void>
  pauseBackgroundPlayback(): Promise<void>
  stopBackgroundPlayback(): Promise<void>
  cacheAudio(cacheKey: string, sourceUrl: string, persistent: boolean): Promise<{ bytes: number }>
  markAudioForCleanup(cacheKey: string): Promise<void>
  pickDocument(mimeTypes: string[]): Promise<{ name: string; text: string } | null>
  checkForUpdate(): Promise<{ version: string; notes: string[]; installUrl?: string }>
  openInstallFlow(installUrl: string): Promise<void>
}

declare global {
  interface Window { cet6Harmony?: HarmonyBridge }
}

export const harmonyBridge = (): HarmonyBridge | null => window.cet6Harmony ?? null
