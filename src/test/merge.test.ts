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
})
