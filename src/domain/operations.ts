import { newId, nowIso } from './defaults'
import type { AppData } from './types'

export function collectDescendantWordbookIds(data: AppData, rootId: string): Set<string> {
  const result = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const book of data.wordbooks) {
      if (book.parentId && result.has(book.parentId) && !result.has(book.id)) {
        result.add(book.id)
        changed = true
      }
    }
  }
  return result
}

export function linkWordToBook(data: AppData, wordId: string, wordbookId: string): AppData {
  if (data.wordbookItems.some((item) => item.wordId === wordId && item.wordbookId === wordbookId)) return data
  const now = nowIso()
  return {
    ...data,
    wordbookItems: [...data.wordbookItems, { id: newId('item'), wordbookId, wordId, createdAt: now, updatedAt: now }],
    dirty: true,
    updatedAt: now,
  }
}

export function setWordFavorite(data: AppData, wordId: string, favorite: boolean): AppData {
  const target = data.words.find((word) => word.id === wordId)
  if (!target) return data
  const now = nowIso()
  const words = data.words.map((word) => word.id === wordId ? { ...word, favorite, updatedAt: now } : word)
  const existingCaches = data.audioCache.filter((cache) => cache.wordId === wordId)
  const audioCache = favorite
    ? existingCaches.length
      ? data.audioCache.map((cache) => cache.wordId === wordId ? { ...cache, policy: 'persistent' as const, updatedAt: now } : cache)
      : [...data.audioCache, { id: newId('audio'), wordId, cacheKey: `tts:${target.normalizedWord}`, bytes: 0, policy: 'persistent' as const, updatedAt: now }]
    : data.audioCache.map((cache) => cache.wordId === wordId && cache.policy === 'persistent' ? { ...cache, policy: 'pending-delete' as const, updatedAt: now } : cache)
  return { ...data, words, audioCache, dirty: true, updatedAt: now }
}

export function setWordbookFavorite(data: AppData, wordbookId: string, favorite: boolean): AppData {
  const now = nowIso()
  const selectedBooks = collectDescendantWordbookIds(data, wordbookId)
  const selectedWordIds = new Set(data.wordbookItems.filter((item) => selectedBooks.has(item.wordbookId)).map((item) => item.wordId))
  const favoriteRootsAfter = data.wordbooks.filter((book) => book.favorite && book.id !== wordbookId).map((book) => book.id)
  if (favorite) favoriteRootsAfter.push(wordbookId)
  const favoriteBookIdsAfter = new Set(favoriteRootsAfter.flatMap((id) => [...collectDescendantWordbookIds(data, id)]))
  const protectedWordIds = new Set(data.wordbookItems.filter((item) => favoriteBookIdsAfter.has(item.wordbookId)).map((item) => item.wordId))
  let audioCache = [...data.audioCache]
  for (const wordId of selectedWordIds) {
    const word = data.words.find((item) => item.id === wordId)
    if (!word) continue
    const existing = audioCache.filter((cache) => cache.wordId === wordId)
    if (favorite) {
      audioCache = existing.length
        ? audioCache.map((cache) => cache.wordId === wordId ? { ...cache, policy: 'persistent' as const, updatedAt: now } : cache)
        : [...audioCache, { id: newId('audio'), wordId, cacheKey: `tts:${word.normalizedWord}`, bytes: 0, policy: 'persistent' as const, updatedAt: now }]
    } else if (!word.favorite && !protectedWordIds.has(wordId)) {
      audioCache = audioCache.map((cache) => cache.wordId === wordId && cache.policy === 'persistent' ? { ...cache, policy: 'pending-delete' as const, updatedAt: now } : cache)
    }
  }
  return {
    ...data,
    wordbooks: data.wordbooks.map((book) => book.id === wordbookId ? { ...book, favorite, updatedAt: now } : book),
    audioCache,
    dirty: true,
    updatedAt: now,
  }
}

export function cleanTemporaryAudio(data: AppData): AppData {
  return { ...data, audioCache: data.audioCache.filter((item) => item.policy === 'persistent'), dirty: true, updatedAt: nowIso() }
}
