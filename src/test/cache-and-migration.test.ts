import { describe, expect, it } from 'vitest'
import { createEmptyData } from '../domain/defaults'
import { migrateData } from '../storage/migrations'

describe('缓存与数据库迁移', () => {
  it('迁移旧快照并补齐 tombstone', () => {
    const migrated = migrateData({ schemaVersion: 1, words: [] })
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.tombstones).toEqual([])
    expect(migrated.wordbooks.length).toBeGreaterThan(0)
  })

  it('拒绝读取未来版本数据', () => {
    expect(() => migrateData({ schemaVersion: 99 })).toThrow('更高版本')
  })

  it('把旧版默认六级词本改为通用名称，但保留用户自定义名称', () => {
    const oldDefault = createEmptyData()
    oldDefault.schemaVersion = 2
    oldDefault.wordbooks[0].name = '六级'
    expect(migrateData(oldDefault).wordbooks[0].name).toBe('我的生词')

    const customized = createEmptyData()
    customized.schemaVersion = 2
    customized.wordbooks[0].name = '雅思冲刺'
    expect(migrateData(customized).wordbooks[0].name).toBe('雅思冲刺')
  })

  it('取消收藏的缓存状态不影响词条', () => {
    const data = createEmptyData()
    data.words.push({ id: 'word-1' } as never)
    data.audioCache.push({ id: 'cache-1', wordId: 'word-1', cacheKey: 'tts:issue', bytes: 100, policy: 'pending-delete', updatedAt: new Date().toISOString() })
    const cleaned = { ...data, audioCache: data.audioCache.filter((item) => item.policy === 'persistent') }
    expect(cleaned.audioCache).toHaveLength(0)
    expect(cleaned.words).toHaveLength(1)
  })
})
