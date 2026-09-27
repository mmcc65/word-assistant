import { describe, expect, it } from 'vitest'
import { createEmptyData } from '../domain/defaults'
import { importRowToEntry } from '../domain/importer'
import { cleanTemporaryAudio, collectDescendantWordbookIds, collectWordbookWordIds, linkWordToBook, setWordbookFavorite, setWordFavorite } from '../domain/operations'

describe('生词本关系与收藏缓存', () => {
  it('同一生词本关系不会重复，但同一词可属于多个生词本', () => {
    const word = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    let data = createEmptyData()
    data.words = [word]
    data = linkWordToBook(data, word.id, 'wb-reading')
    data = linkWordToBook(data, word.id, 'wb-reading')
    data = linkWordToBook(data, word.id, 'wb-high-frequency')
    expect(data.wordbookItems).toHaveLength(2)
    expect(new Set(data.wordbookItems.map((item) => item.wordId))).toEqual(new Set([word.id]))
  })

  it('收藏创建长期音频占位，取消收藏只标记音频且保留文字', () => {
    const word = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    let data = createEmptyData()
    data.words = [word]
    data = setWordFavorite(data, word.id, true)
    expect(data.words[0].favorite).toBe(true)
    expect(data.audioCache[0].policy).toBe('persistent')
    data = setWordFavorite(data, word.id, false)
    expect(data.words[0].favorite).toBe(false)
    expect(data.audioCache[0].policy).toBe('pending-delete')
    expect(data.words[0].word).toBe('issue')
  })

  it('清缓存不删除长期收藏音频', () => {
    const data = createEmptyData()
    data.audioCache = [
      { id: '1', wordId: 'w1', cacheKey: 'a', bytes: 10, policy: 'persistent', updatedAt: new Date().toISOString() },
      { id: '2', wordId: 'w2', cacheKey: 'b', bytes: 10, policy: 'temporary', updatedAt: new Date().toISOString() },
      { id: '3', wordId: 'w3', cacheKey: 'c', bytes: 10, policy: 'pending-delete', updatedAt: new Date().toISOString() },
    ]
    expect(cleanTemporaryAudio(data).audioCache.map((item) => item.id)).toEqual(['1'])
  })

  it('父文件夹包含子文件夹，收藏时准备全部相关音频', () => {
    const word = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    let data = createEmptyData()
    data.words = [word]
    data = linkWordToBook(data, word.id, 'wb-reading')
    expect(collectDescendantWordbookIds(data, 'wb-cet6')).toContain('wb-reading')
    data = setWordbookFavorite(data, 'wb-cet6', true)
    expect(data.wordbooks.find((book) => book.id === 'wb-cet6')?.favorite).toBe(true)
    expect(data.audioCache.find((item) => item.wordId === word.id)?.policy).toBe('persistent')
  })

  it('文件夹数量包含全部子文件夹、自动去重并忽略失效关联', () => {
    const word = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    let data = createEmptyData()
    data.words = [word]
    data = linkWordToBook(data, word.id, 'wb-exam')
    data = linkWordToBook(data, word.id, 'wb-reading')
    data.wordbookItems.push({ id: 'dangling', wordbookId: 'wb-reading', wordId: 'missing-word', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    expect(collectWordbookWordIds(data, 'wb-exam')).toEqual(new Set([word.id]))
  })

  it('“我的生词”始终代表完整词库，包括尚未归入具体文件夹的历史词条', () => {
    const linked = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    const orphan = importRowToEntry({ rowNumber: 2, word: 'address', meaning: '处理' })
    let data = createEmptyData()
    data.words = [linked, orphan]
    data = linkWordToBook(data, linked.id, 'wb-reading')
    expect(collectWordbookWordIds(data, 'wb-cet6')).toEqual(new Set([linked.id, orphan.id]))
  })
})
