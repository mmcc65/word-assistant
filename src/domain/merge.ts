import { newId, nowIso } from './defaults'
import { normalizeWord, uniqueStrings } from './normalize'
import type { AppData, Example, MeaningGroup, Phrase, Sense, Tombstone, WordEntry } from './types'

const key = (value: string) => value.trim().toLocaleLowerCase('en-US')

function mergeExamples(current: Example[], incoming: Example[]): Example[] {
  const result = [...current]
  for (const item of incoming) {
    const found = result.find((value) => key(value.english) === key(item.english))
    if (!found) result.push({ ...item, id: item.id || newId('example') })
    else {
      found.chinese ||= item.chinese
      found.source ||= item.source
      found.representative ||= item.representative
    }
  }
  return result
}

function mergePhrases(current: Phrase[], incoming: Phrase[]): Phrase[] {
  const result = [...current]
  for (const item of incoming) {
    const found = result.find((value) => key(value.english) === key(item.english))
    if (!found) result.push({ ...item, id: item.id || newId('phrase') })
    else {
      found.chinese ||= item.chinese
      if (!found.example && item.example) found.example = item.example
    }
  }
  return result
}

function mergeSenses(current: Sense[], incoming: Sense[]): Sense[] {
  const result = structuredClone(current)
  for (const item of incoming) {
    const found = result.find((value) => key(value.english) === key(item.english) || (value.chinese && key(value.chinese) === key(item.chinese)))
    if (!found) result.push({ ...item, id: item.id || newId('sense') })
    else {
      found.chinese ||= item.chinese
      found.english ||= item.english
      found.usage ||= item.usage
      found.tags = uniqueStrings([...found.tags, ...item.tags])
      found.favorite ||= item.favorite
      found.examples = mergeExamples(found.examples, item.examples)
      found.phrases = mergePhrases(found.phrases, item.phrases)
    }
  }
  return result
}

function mergeMeaningGroups(current: MeaningGroup[], incoming: MeaningGroup[]): MeaningGroup[] {
  const result = structuredClone(current)
  for (const group of incoming) {
    const found = result.find((value) => key(value.partOfSpeech) === key(group.partOfSpeech))
    if (!found) result.push(structuredClone(group))
    else found.senses = mergeSenses(found.senses, group.senses)
  }
  return result
}

export function mergeWordEntries(current: WordEntry, incoming: WordEntry): WordEntry {
  return {
    ...current,
    uk: { ipa: current.uk.ipa || incoming.uk.ipa, audioUrl: current.uk.audioUrl || incoming.uk.audioUrl },
    us: { ipa: current.us.ipa || incoming.us.ipa, audioUrl: current.us.audioUrl || incoming.us.audioUrl },
    inflections: uniqueStrings([...current.inflections, ...incoming.inflections]),
    tags: uniqueStrings([...current.tags, ...incoming.tags]),
    favorite: current.favorite || incoming.favorite,
    meanings: mergeMeaningGroups(current.meanings, incoming.meanings),
    note: current.note || incoming.note,
    sources: uniqueStrings([...current.sources, ...incoming.sources]),
    updatedAt: nowIso(),
  }
}

export function upsertWord(data: AppData, incoming: WordEntry): { data: AppData; word: WordEntry; existed: boolean } {
  const normalized = normalizeWord(incoming.word)
  const found = data.words.find((word) => word.normalizedWord === normalized)
  const word = found ? mergeWordEntries(found, incoming) : { ...incoming, normalizedWord: normalized }
  const words = found ? data.words.map((item) => (item.id === found.id ? word : item)) : [...data.words, word]
  return { data: { ...data, words, dirty: true, updatedAt: nowIso() }, word, existed: Boolean(found) }
}

export function mergeAppData(local: AppData, remote: AppData): AppData {
  const tombstones = mergeById(local.tombstones, remote.tombstones, (item) => `${item.entity}:${item.id}`, (item) => item.deletedAt)
  const removed = new Set(tombstones.map((item) => `${item.entity}:${item.id}`))
  const words = mergeById(local.words, remote.words, (item) => item.id, (item) => item.updatedAt).filter((item) => !removed.has(`word:${item.id}`))
  const wordbooks = mergeById(local.wordbooks, remote.wordbooks, (item) => item.id, (item) => item.updatedAt).filter((item) => !removed.has(`wordbook:${item.id}`))
  const wordbookItems = mergeById(local.wordbookItems, remote.wordbookItems, (item) => item.id, (item) => item.updatedAt).filter((item) => !removed.has(`wordbookItem:${item.id}`))
  const presets = mergeById(local.presets, remote.presets, (item) => item.id, (item) => item.updatedAt).filter((item) => !removed.has(`preset:${item.id}`))
  const audioCache = mergeById(local.audioCache, remote.audioCache, (item) => item.id, (item) => item.updatedAt).filter((item) => !removed.has(`audioCache:${item.id}`))
  const flashcardProgress = mergeById(local.flashcardProgress ?? [], remote.flashcardProgress ?? [], (item) => item.wordId, (item) => item.updatedAt)
    .filter((item) => words.some((word) => word.id === item.wordId))
  const newer = Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt) ? local : remote
  return {
    ...newer,
    words,
    wordbooks,
    wordbookItems: dedupeRelations(wordbookItems),
    presets,
    audioCache,
    flashcardProgress,
    tombstones,
    dirty: true,
    updatedAt: nowIso(),
  }
}

function mergeById<T>(local: T[], remote: T[], getId: (item: T) => string, getDate: (item: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const id = getId(item)
    const old = map.get(id)
    const currentDate = getDate(item)
    const oldDate = old ? getDate(old) : ''
    if (!old || Date.parse(currentDate) >= Date.parse(oldDate)) map.set(id, structuredClone(item))
  }
  return [...map.values()]
}

function dedupeRelations(items: AppData['wordbookItems']): AppData['wordbookItems'] {
  const byPair = new Map<string, AppData['wordbookItems'][number]>()
  for (const item of items) byPair.set(`${item.wordbookId}:${item.wordId}`, item)
  return [...byPair.values()]
}

export function addTombstone(data: AppData, tombstone: Omit<Tombstone, 'deletedAt'>): Tombstone[] {
  return [...data.tombstones.filter((item) => !(item.entity === tombstone.entity && item.id === tombstone.id)), { ...tombstone, deletedAt: nowIso() }]
}
