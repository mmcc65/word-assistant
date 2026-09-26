import { describe, expect, it, vi } from 'vitest'
import { CachedDictionaryProvider, FallbackDictionaryProvider, OfflineEcdictProvider, type DictionaryProvider } from '../providers/dictionary'
import { importRowToEntry } from '../domain/importer'

describe('词典查询性能策略', () => {
  it('本地命中后不再等待远程 Provider', async () => {
    const entry = importRowToEntry({ rowNumber: 1, word: 'issue', meaning: '问题' })
    expect(entry.tags).toEqual([])
    const local: DictionaryProvider = { name: 'local', lookup: vi.fn(async () => entry) }
    const remote: DictionaryProvider = { name: 'remote', lookup: vi.fn(async () => null) }
    const provider = new FallbackDictionaryProvider([local, remote])
    expect((await provider.lookup('issue'))?.word).toBe('issue')
    expect(remote.lookup).not.toHaveBeenCalled()
  })

  it('本地未命中时回退远程，并缓存第二次结果', async () => {
    const entry = importRowToEntry({ rowNumber: 1, word: 'novel', meaning: '新颖的' })
    const remote: DictionaryProvider = { name: 'remote', lookup: vi.fn(async () => entry) }
    const provider = new CachedDictionaryProvider(new FallbackDictionaryProvider([{ name: 'local', lookup: async () => null }, remote]))
    expect((await provider.lookup('novel'))?.word).toBe('novel')
    expect((await provider.lookup('novel'))?.word).toBe('novel')
    expect(remote.lookup).toHaveBeenCalledTimes(1)
  })

  it('从按首字母拆分的离线英汉词典即时生成词条', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      quick: ['kwɪk', 'moving fast', 'adj. 快的；迅速的', 'cet4 cet6', 'r:quicker/t:quickest'],
    }), { status: 200 }))
    const result = await new OfflineEcdictProvider().lookup('quick')
    expect(result?.meanings[0].senses[0].chinese).toBe('快的；迅速的')
    expect(result?.tags).toEqual(['CET-4', 'CET-6'])
    expect(result?.inflections).toEqual(['quicker', 'quickest'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRestore()
  })
})
