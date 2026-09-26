import Papa from 'papaparse'
import { newId, nowIso } from './defaults'
import { isRecognizableEnglish, normalizeWord } from './normalize'
import type { ImportPreviewRow, ImportRow, WordEntry } from './types'

const aliases: Record<string, keyof ImportRow> = {
  word: 'word',
  单词: 'word',
  part_of_speech: 'partOfSpeech',
  pos: 'partOfSpeech',
  词性: 'partOfSpeech',
  meaning: 'meaning',
  中文释义: 'meaning',
  example: 'example',
  例句: 'example',
  example_translation: 'exampleTranslation',
  例句中文: 'exampleTranslation',
  phrase: 'phrase',
  短语: 'phrase',
  phrase_translation: 'phraseTranslation',
  短语中文: 'phraseTranslation',
  note: 'note',
  备注: 'note',
}

export function parsePlainText(text: string): ImportRow[] {
  return text
    .split(/\r?\n/)
    .map((word, index) => ({ rowNumber: index + 1, word: word.trim() }))
    .filter((row) => row.word)
}

export function parseCsv(text: string): ImportRow[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy' })
  return parsed.data.map((raw, index) => {
    const row: ImportRow = { rowNumber: index + 2, word: '' }
    for (const [rawName, value] of Object.entries(raw)) {
      const target = aliases[rawName.trim().toLocaleLowerCase('en-US')]
      if (target && target !== 'rowNumber') Object.assign(row, { [target]: String(value ?? '').trim() })
    }
    return row
  })
}

export function buildImportPreview(rows: ImportRow[], existingWords: string[]): ImportPreviewRow[] {
  const existing = new Set(existingWords.map(normalizeWord))
  const seen = new Set<string>()
  return rows.map((row) => {
    const normalizedWord = normalizeWord(row.word)
    if (!isRecognizableEnglish(row.word)) return { ...row, normalizedWord, status: 'invalid', reason: '不是可识别的英文单词或短语' }
    if (existing.has(normalizedWord) || seen.has(normalizedWord)) {
      seen.add(normalizedWord)
      return { ...row, normalizedWord, status: 'existing', reason: '已存在，将安全合并' }
    }
    seen.add(normalizedWord)
    return { ...row, normalizedWord, status: 'ready' }
  })
}

export function importRowToEntry(row: ImportRow): WordEntry {
  const now = nowIso()
  const hasMeaning = Boolean(row.meaning || row.example || row.phrase)
  return {
    id: newId('word'),
    word: row.word.trim(),
    normalizedWord: normalizeWord(row.word),
    uk: {},
    us: {},
    inflections: [],
    tags: [],
    favorite: false,
    note: row.note ?? '',
    sources: ['用户导入'],
    createdAt: now,
    updatedAt: now,
    meanings: hasMeaning
      ? [{
          partOfSpeech: row.partOfSpeech || '未分类',
          senses: [{
            id: newId('sense'),
            chinese: row.meaning || '待补充中文释义',
            english: '',
            frequency: 'common',
            tags: [],
            favorite: false,
            examples: row.example
              ? [{ id: newId('example'), english: row.example, chinese: row.exampleTranslation || '待补充中文翻译', source: '用户导入', representative: true }]
              : [],
            phrases: row.phrase
              ? [{ id: newId('phrase'), english: row.phrase, chinese: row.phraseTranslation || '待补充中文翻译', kind: 'phrase' }]
              : [],
          }],
        }]
      : [],
  }
}
