import { describe, expect, it } from 'vitest'
import { createEmptyData, newId, nowIso } from '../domain/defaults'
import { importRowToEntry } from '../domain/importer'
import { mergeAppData, mergeWordEntries, upsertWord } from '../domain/merge'

describe('词条去重与安全合并', () => {
  it('同一规范化单词只保存一份', () => {
    let data = createEmptyData()
    data = upsertWord(data, importRowToEntry({ rowNumber: 1, word: ' Issue ', meaning: '问题' })).data
    data = upsertWord(data, importRowToEntry({ rowNumber: 2, word: 'issue', meaning: '议题' })).data
    expect(data.words).toHaveLength(1)
  })

  it('保留私人备注并合并新例句和短语', () => {
    const current = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题', note: '不要覆盖', example: 'Old example.', exampleTranslation: '旧例句。' })
    const incoming = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题', note: '新备注', example: 'New example.', exampleTranslation: '新例句。', phrase: 'raise an issue', phraseTranslation: '提出问题' })
    const merged = mergeWordEntries(current, incoming)
    expect(merged.note).toBe('不要覆盖')
    expect(merged.meanings[0].senses[0].examples).toHaveLength(2)
    expect(merged.meanings[0].senses[0].phrases[0].chinese).toBe('提出问题')
  })

  it('同步按更新时间合并并去重生词本关系', () => {
    const local = createEmptyData()
    const word = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    local.words = [word]
    const time = nowIso()
    local.wordbookItems = [{ id: newId('item'), wordbookId: 'wb-reading', wordId: word.id, createdAt: time, updatedAt: time }]
    const remote = structuredClone(local)
    remote.wordbookItems.push({ ...remote.wordbookItems[0], id: newId('item') })
    const merged = mergeAppData(local, remote)
    expect(merged.words).toHaveLength(1)
    expect(merged.wordbookItems).toHaveLength(1)
  })

  it('同步保留较新的单词卡复习记录', () => {
    const local = createEmptyData()
    const remote = createEmptyData()
    local.flashcardProgress = [{ wordId: 'word-1', level: 1, streak: 1, reviewCount: 1, lastRating: 'known', lastReviewedAt: '2026-01-01T00:00:00.000Z', nextReviewAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]
    remote.flashcardProgress = [{ ...local.flashcardProgress[0], level: 3, reviewCount: 4, updatedAt: '2026-01-03T00:00:00.000Z' }]
    local.words = [{ id: 'word-1' } as never]
    remote.words = [{ id: 'word-1' } as never]
    expect(mergeAppData(local, remote).flashcardProgress[0].level).toBe(3)
  })
})
