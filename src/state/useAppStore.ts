import { useCallback, useEffect, useState } from 'react'
import { newId, nowIso } from '../domain/defaults'
import { addTombstone, upsertWord } from '../domain/merge'
import { cleanTemporaryAudio, linkWordToBook, setWordFavorite, setWordbookFavorite } from '../domain/operations'
import type { AppData, PlaybackPreset, WordEntry, Wordbook } from '../domain/types'
import { loadData, saveData } from '../storage/repository'

export function useAppStore() {
  const [data, setDataState] = useState<AppData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData().then((loaded) => {
      setDataState(loaded)
      void saveData(loaded).catch((reason) => setError(reason instanceof Error ? reason.message : '保存迁移后的本地数据失败'))
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '无法读取本地数据'))
  }, [])

  const commit = useCallback((updater: (current: AppData) => AppData) => {
    setDataState((current) => {
      if (!current) return current
      const next = updater(current)
      void saveData(next).catch((reason) => setError(reason instanceof Error ? reason.message : '保存失败'))
      return next
    })
  }, [])

  const replaceData = useCallback((next: AppData) => {
    setDataState(next)
    void saveData(next).catch((reason) => setError(reason instanceof Error ? reason.message : '保存失败'))
  }, [])

  const addWord = useCallback((entry: WordEntry, wordbookId: string) => {
    let resultingWord = entry
    let existed = false
    commit((current) => {
      const result = upsertWord(current, entry)
      resultingWord = result.word
      existed = result.existed
      return linkWordToBook(result.data, result.word.id, wordbookId)
    })
    return { word: resultingWord, existed }
  }, [commit])

  const toggleWordFavorite = useCallback((wordId: string) => commit((current) => {
    const target = current.words.find((word) => word.id === wordId)
    return target ? setWordFavorite(current, wordId, !target.favorite) : current
  }), [commit])

  const toggleSenseFavorite = useCallback((wordId: string, senseId: string) => commit((current) => ({
    ...current,
    words: current.words.map((word) => word.id !== wordId ? word : {
      ...word,
      meanings: word.meanings.map((group) => ({ ...group, senses: group.senses.map((sense) => sense.id === senseId ? { ...sense, favorite: !sense.favorite } : sense) })),
      updatedAt: nowIso(),
    }),
    dirty: true,
    updatedAt: nowIso(),
  })), [commit])

  const saveNote = useCallback((wordId: string, note: string) => commit((current) => ({
    ...current,
    words: current.words.map((word) => word.id === wordId ? { ...word, note, updatedAt: nowIso() } : word),
    dirty: true,
    updatedAt: nowIso(),
  })), [commit])

  const createWordbook = useCallback((name: string, parentId: string | null) => commit((current) => {
    const now = nowIso()
    return { ...current, wordbooks: [...current.wordbooks, { id: newId('wb'), name, parentId, favorite: false, createdAt: now, updatedAt: now }], dirty: true, updatedAt: now }
  }), [commit])

  const updateWordbook = useCallback((id: string, changes: Partial<Pick<Wordbook, 'name' | 'parentId' | 'favorite'>>) => commit((current) => {
    const now = nowIso()
    const withFavorite = typeof changes.favorite === 'boolean' ? setWordbookFavorite(current, id, changes.favorite) : current
    const { favorite: _favorite, ...otherChanges } = changes
    return { ...withFavorite, wordbooks: withFavorite.wordbooks.map((book) => book.id === id ? { ...book, ...otherChanges, updatedAt: now } : book), dirty: true, updatedAt: now }
  }), [commit])

  const deleteWordbook = useCallback((id: string) => commit((current) => {
    const descendants = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const book of current.wordbooks) if (book.parentId && descendants.has(book.parentId) && !descendants.has(book.id)) { descendants.add(book.id); changed = true }
    }
    const relations = current.wordbookItems.filter((item) => descendants.has(item.wordbookId))
    const tombstones = [...descendants].reduce((list, bookId) => addTombstone({ ...current, tombstones: list }, { entity: 'wordbook', id: bookId }), current.tombstones)
    const allTombstones = relations.reduce((list, item) => addTombstone({ ...current, tombstones: list }, { entity: 'wordbookItem', id: item.id }), tombstones)
    return { ...current, wordbooks: current.wordbooks.filter((book) => !descendants.has(book.id)), wordbookItems: current.wordbookItems.filter((item) => !descendants.has(item.wordbookId)), tombstones: allTombstones, dirty: true, updatedAt: nowIso() }
  }), [commit])

  const removeWordFromBook = useCallback((wordId: string, wordbookId: string) => commit((current) => {
    const removed = current.wordbookItems.filter((item) => item.wordId === wordId && item.wordbookId === wordbookId)
    const tombstones = removed.reduce((list, item) => addTombstone({ ...current, tombstones: list }, { entity: 'wordbookItem', id: item.id }), current.tombstones)
    return { ...current, wordbookItems: current.wordbookItems.filter((item) => !(item.wordId === wordId && item.wordbookId === wordbookId)), tombstones, dirty: true, updatedAt: nowIso() }
  }), [commit])

  const moveWord = useCallback((wordId: string, fromWordbookId: string, toWordbookId: string) => commit((current) => {
    const removed = current.wordbookItems.filter((item) => item.wordId === wordId && item.wordbookId === fromWordbookId)
    const tombstones = removed.reduce((list, item) => addTombstone({ ...current, tombstones: list }, { entity: 'wordbookItem', id: item.id }), current.tombstones)
    const withoutOld = { ...current, wordbookItems: current.wordbookItems.filter((item) => !(item.wordId === wordId && item.wordbookId === fromWordbookId)), tombstones }
    return linkWordToBook(withoutOld, wordId, toWordbookId)
  }), [commit])

  const savePreset = useCallback((preset: PlaybackPreset) => commit((current) => ({
    ...current,
    presets: current.presets.some((item) => item.id === preset.id)
      ? current.presets.map((item) => item.id === preset.id ? { ...preset, updatedAt: nowIso() } : item)
      : [...current.presets, { ...preset, updatedAt: nowIso() }],
    dirty: true,
    updatedAt: nowIso(),
  })), [commit])

  const cleanTemporaryCache = useCallback(() => commit(cleanTemporaryAudio), [commit])

  return {
    data, error, setError, commit, replaceData, addWord, toggleWordFavorite, toggleSenseFavorite, saveNote,
    createWordbook, updateWordbook, deleteWordbook, removeWordFromBook, moveWord, savePreset, cleanTemporaryCache,
  }
}

export type AppStore = ReturnType<typeof useAppStore>
