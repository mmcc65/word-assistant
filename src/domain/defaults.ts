import type { AppData, PlaybackContentType, PlaybackPreset, PlaybackRule } from './types'

export const CURRENT_SCHEMA_VERSION = 4

export const nowIso = () => new Date().toISOString()
export const newId = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`

const rule = (enabled: boolean, repeats: number, rate: number, gapSeconds: number): PlaybackRule => ({
  enabled,
  repeats,
  rate,
  gapSeconds,
})

const preset = (
  id: string,
  name: string,
  values: Partial<Record<PlaybackContentType, PlaybackRule>>,
): PlaybackPreset => ({
  id,
  name,
  builtIn: true,
  senseScope: 'all',
  updatedAt: nowIso(),
  rules: {
    word: rule(true, 1, 0.9, 1),
    spelling: rule(false, 1, 0.7, 1),
    partOfSpeechMeaning: rule(true, 1, 1, 1),
    exampleEnglish: rule(false, 1, 0.9, 0.5),
    exampleChinese: rule(false, 1, 1, 1),
    phraseEnglish: rule(false, 1, 0.9, 0.5),
    phraseChinese: rule(false, 1, 1, 2),
    ...values,
  },
})

export const builtInPresets: PlaybackPreset[] = [
  preset('preset-cycling', '骑车模式', {
    word: rule(true, 2, 0.85, 1),
    spelling: rule(true, 1, 0.7, 1),
    partOfSpeechMeaning: rule(true, 1, 1, 1),
    phraseEnglish: rule(true, 1, 0.9, 0.5),
    phraseChinese: rule(true, 1, 1, 1),
    exampleEnglish: rule(true, 1, 0.9, 0.5),
    exampleChinese: rule(true, 1, 1, 1),
  }),
  preset('preset-listening', '听力模式', {
    word: rule(true, 1, 0.95, 0.5),
    partOfSpeechMeaning: rule(false, 0, 1, 0),
    exampleEnglish: rule(true, 2, 0.9, 1),
  }),
  preset('preset-quick', '快速复习', {
    word: rule(true, 1, 1, 0.5),
    partOfSpeechMeaning: rule(true, 1, 1, 1),
  }),
]

export function createEmptyData(): AppData {
  const now = nowIso()
  const rootId = 'wb-cet6'
  const readingId = 'wb-reading'
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    words: [],
    wordbooks: [
      { id: rootId, name: '我的生词', parentId: null, favorite: false, createdAt: now, updatedAt: now },
      { id: 'wb-exam', name: '真题', parentId: rootId, favorite: false, createdAt: now, updatedAt: now },
      { id: readingId, name: '9月25日阅读', parentId: 'wb-exam', favorite: false, createdAt: now, updatedAt: now },
      { id: 'wb-high-frequency', name: '高频词', parentId: rootId, favorite: true, createdAt: now, updatedAt: now },
      { id: 'wb-mistakes', name: '易错词', parentId: rootId, favorite: false, createdAt: now, updatedAt: now },
    ],
    wordbookItems: [],
    presets: builtInPresets,
    playbackPosition: { wordbookId: readingId, wordIndex: 0, total: 0, presetId: 'preset-cycling', updatedAt: now },
    audioCache: [],
    flashcardProgress: [],
    settings: {
      theme: 'system',
      englishVoice: '',
      chineseVoice: '',
      englishAccent: 'en-US',
      activePresetId: 'preset-cycling',
      autoSync: true,
    },
    tombstones: [],
    dirty: false,
    updatedAt: now,
  }
}
