import { describe, expect, it } from 'vitest'
import { builtInPresets } from '../domain/defaults'
import { importRowToEntry } from '../domain/importer'
import { buildPlaybackQueue, partOfSpeechForSpeech, resolvePlaybackWordbookId } from '../domain/player'
import { createEmptyData } from '../domain/defaults'

describe('播放队列', () => {
  const word = importRowToEntry({ rowNumber: 1, word: 'issue', partOfSpeech: 'n.', meaning: '问题', example: 'This is an issue.', exampleTranslation: '这是一个问题。', phrase: 'address an issue', phraseTranslation: '处理问题' })

  it('骑车模式按指定顺序与次数生成', () => {
    const queue = buildPlaybackQueue([word], builtInPresets[0])
    expect(queue.slice(0, 3).map((item) => item.type)).toEqual(['word', 'word', 'spelling'])
    expect(queue.map((item) => item.type)).toEqual(['word', 'word', 'spelling', 'partOfSpeechMeaning', 'phraseEnglish', 'phraseChinese', 'exampleEnglish', 'exampleChinese'])
    expect(queue.find((item) => item.type === 'word')?.rate).toBe(.85)
    expect(queue.find((item) => item.type === 'spelling')?.text).toBe('i s s u e')
    expect(queue.find((item) => item.type === 'partOfSpeechMeaning')?.text).toBe('名词，问题')
  })

  it('每个短语和例句后面立即播放对应的中文', () => {
    const sense = word.meanings[0].senses[0]
    sense.phrases.push({ id: 'phrase-2', english: 'a difficult issue', chinese: '一个棘手的问题', kind: 'phrase' })
    sense.examples.push({ id: 'example-2', english: 'We discussed the issue.', chinese: '我们讨论了这个问题。', source: 'test', representative: true })

    const queue = buildPlaybackQueue([word], builtInPresets[0])
    expect(queue.filter((item) => item.type.startsWith('phrase')).map((item) => [item.type, item.text])).toEqual([
      ['phraseEnglish', 'address an issue'],
      ['phraseChinese', '处理问题'],
      ['phraseEnglish', 'a difficult issue'],
      ['phraseChinese', '一个棘手的问题'],
    ])
    expect(queue.filter((item) => item.type.startsWith('example')).map((item) => [item.type, item.text])).toEqual([
      ['exampleEnglish', 'This is an issue.'],
      ['exampleChinese', '这是一个问题。'],
      ['exampleEnglish', 'We discussed the issue.'],
      ['exampleChinese', '我们讨论了这个问题。'],
    ])
  })

  it('常见英文词性缩写会转换成中文名称播报', () => {
    expect(partOfSpeechForSpeech('n.')).toBe('名词')
    expect(partOfSpeechForSpeech('vt.')).toBe('及物动词')
    expect(partOfSpeechForSpeech('adjective')).toBe('形容词')
  })

  it('仅收藏义项时排除未收藏义项', () => {
    const preset = { ...builtInPresets[0], senseScope: 'favorites' as const }
    expect(buildPlaybackQueue([word], preset)).toHaveLength(3)
    word.meanings[0].senses[0].favorite = true
    expect(buildPlaybackQueue([word], preset).some((item) => item.type === 'partOfSpeechMeaning')).toBe(true)
  })

  it('启动时不会继续使用已删除的播放文件夹', () => {
    const data = createEmptyData()
    data.playbackPosition.wordbookId = 'deleted-book'
    expect(resolvePlaybackWordbookId(data)).toBe('wb-cet6')
    expect(resolvePlaybackWordbookId(data, 'wb-high-frequency')).toBe('wb-high-frequency')
  })
})
