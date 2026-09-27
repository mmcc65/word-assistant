export interface OfflineAudioRecord {
  url: string
  blob: Blob
  bytes: number
  wordbookIds: string[]
  updatedAt: string
}

const DB_NAME = 'cet6-word-assistant'
const AUDIO_STORE = 'offline-audio'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('app-state')) request.result.createObjectStore('app-state')
      if (!request.result.objectStoreNames.contains(AUDIO_STORE)) {
        const store = request.result.createObjectStore(AUDIO_STORE, { keyPath: 'url' })
        store.createIndex('wordbookIds', 'wordbookIds', { multiEntry: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function findOfflineAudio(url: string): Promise<Blob | null> {
  if (!globalThis.indexedDB) return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readonly')
    const request = transaction.objectStore(AUDIO_STORE).get(url)
    request.onsuccess = () => resolve((request.result as OfflineAudioRecord | undefined)?.blob ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

export async function saveOfflineAudio(url: string, blob: Blob, wordbookId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite')
    const store = transaction.objectStore(AUDIO_STORE)
    const request = store.get(url)
    request.onsuccess = () => {
      const previous = request.result as OfflineAudioRecord | undefined
      store.put({
        url,
        blob,
        bytes: blob.size,
        wordbookIds: [...new Set([...(previous?.wordbookIds ?? []), wordbookId])],
        updatedAt: new Date().toISOString(),
      } satisfies OfflineAudioRecord)
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('保存离线音频失败'))
  })
  db.close()
}

export async function offlineAudioForWordbook(wordbookId: string): Promise<OfflineAudioRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readonly')
    const request = transaction.objectStore(AUDIO_STORE).index('wordbookIds').getAll(wordbookId)
    request.onsuccess = () => resolve(request.result as OfflineAudioRecord[])
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

export async function deleteOfflineAudioForWordbook(wordbookId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite')
    const store = transaction.objectStore(AUDIO_STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      for (const record of request.result as OfflineAudioRecord[]) {
        if (!record.wordbookIds.includes(wordbookId)) continue
        const wordbookIds = record.wordbookIds.filter((id) => id !== wordbookId)
        if (wordbookIds.length) store.put({ ...record, wordbookIds })
        else store.delete(record.url)
      }
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('删除离线音频失败'))
  })
  db.close()
}
