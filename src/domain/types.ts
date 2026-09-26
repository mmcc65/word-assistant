export type Id = string
export type Frequency = 'common' | 'less-common' | 'formal' | 'technical' | 'archaic'
export type Accent = 'en-US' | 'en-GB' | 'zh-CN'

export interface Example {
  id: Id
  english: string
  chinese: string
  source: string
  representative: boolean
}

export interface Phrase {
  id: Id
  english: string
  chinese: string
  example?: Example
  kind: 'collocation' | 'phrase' | 'idiom'
}

export interface Sense {
  id: Id
  chinese: string
  english: string
  usage?: string
  frequency: Frequency
  tags: string[]
  favorite: boolean
  examples: Example[]
  phrases: Phrase[]
}

export interface MeaningGroup {
  partOfSpeech: string
  senses: Sense[]
}

export interface Pronunciation {
  ipa?: string
  audioUrl?: string
}

export interface WordEntry {
  id: Id
  word: string
  normalizedWord: string
  uk: Pronunciation
  us: Pronunciation
  inflections: string[]
  tags: string[]
  favorite: boolean
  meanings: MeaningGroup[]
  note: string
  sources: string[]
  createdAt: string
  updatedAt: string
}

export interface Wordbook {
  id: Id
  name: string
  parentId: Id | null
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface WordbookItem {
  id: Id
  wordbookId: Id
  wordId: Id
  createdAt: string
  updatedAt: string
}

export type PlaybackContentType =
  | 'word'
  | 'spelling'
  | 'partOfSpeechMeaning'
  | 'exampleEnglish'
  | 'exampleChinese'
  | 'phraseEnglish'
  | 'phraseChinese'

export interface PlaybackRule {
  enabled: boolean
  repeats: number
  rate: number
  gapSeconds: number
}

export type SenseScope = 'all' | 'common' | 'favorites'

export interface PlaybackPreset {
  id: Id
  name: string
  builtIn: boolean
  senseScope: SenseScope
  rules: Record<PlaybackContentType, PlaybackRule>
  updatedAt: string
}

export interface PlaybackPosition {
  wordbookId: Id | null
  wordIndex: number
  total: number
  presetId: Id
  updatedAt: string
}

export interface AudioCacheRecord {
  id: Id
  wordId: Id
  cacheKey: string
  bytes: number
  policy: 'persistent' | 'temporary' | 'pending-delete'
  updatedAt: string
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark'
  englishVoice: string
  chineseVoice: string
  englishAccent: 'en-US' | 'en-GB'
  activePresetId: Id
  lastSyncAt?: string
  autoSync: boolean
}

export interface Tombstone {
  entity: 'word' | 'wordbook' | 'wordbookItem' | 'preset' | 'audioCache'
  id: Id
  deletedAt: string
}

export interface AppData {
  schemaVersion: number
  words: WordEntry[]
  wordbooks: Wordbook[]
  wordbookItems: WordbookItem[]
  presets: PlaybackPreset[]
  playbackPosition: PlaybackPosition
  audioCache: AudioCacheRecord[]
  settings: AppSettings
  tombstones: Tombstone[]
  dirty: boolean
  updatedAt: string
}

export interface QueueItem {
  id: Id
  wordId: Id
  type: PlaybackContentType
  text: string
  lang: Accent
  rate: number
  gapSeconds: number
  repetition: number
}

export interface ImportRow {
  rowNumber: number
  word: string
  partOfSpeech?: string
  meaning?: string
  example?: string
  exampleTranslation?: string
  phrase?: string
  phraseTranslation?: string
  note?: string
}

export type ImportStatus = 'ready' | 'existing' | 'invalid'

export interface ImportPreviewRow extends ImportRow {
  normalizedWord: string
  status: ImportStatus
  reason?: string
}

export interface SyncPayload {
  schemaVersion: number
  data: AppData
  deviceId: string
  updatedAt: string
}
