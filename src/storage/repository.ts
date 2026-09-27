import { createEmptyData } from '../domain/defaults'
import type { AppData } from '../domain/types'
import { migrateData } from './migrations'

const DB_NAME = 'cet6-word-assistant'
const STORE_NAME = 'app-state'
const STATE_KEY = 'current'
const MEMORY_KEY = 'cet6-word-assistant-fallback'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      if (!request.result.objectStoreNames.contains('offline-audio')) {
        const audioStore = request.result.createObjectStore('offline-audio', { keyPath: 'url' })
        audioStore.createIndex('wordbookIds', 'wordbookIds', { multiEntry: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadData(): Promise<AppData> {
  if (!('indexedDB' in globalThis)) {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? migrateData(JSON.parse(raw)) : createEmptyData()
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY)
    request.onsuccess = () => resolve(request.result ? migrateData(request.result as AppData) : createEmptyData())
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

export async function saveData(data: AppData): Promise<void> {
  if (!('indexedDB' in globalThis)) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(data))
    return
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(data, STATE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: '生词助手', data }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `生词助手备份-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function estimateStorage(data: AppData) {
  const estimate = await navigator.storage?.estimate?.()
  const textBytes = new Blob([JSON.stringify(data)]).size
  const persistentAudio = data.audioCache.filter((item) => item.policy === 'persistent').reduce((sum, item) => sum + item.bytes, 0)
  const temporaryAudio = data.audioCache.filter((item) => item.policy !== 'persistent').reduce((sum, item) => sum + item.bytes, 0)
  return { textBytes, persistentAudio, temporaryAudio, totalUsage: estimate?.usage ?? textBytes, quota: estimate?.quota ?? 0 }
}
