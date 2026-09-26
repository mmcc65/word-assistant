import { newId, nowIso } from '../domain/defaults'
import { mergeWordEntries } from '../domain/merge'
import { normalizeWord } from '../domain/normalize'
import type { Frequency, MeaningGroup, WordEntry } from '../domain/types'

export interface DictionaryProvider {
  readonly name: string
  lookup(term: string): Promise<WordEntry | null>
}

type SeedSense = {
  zh: string
  en: string
  usage?: string
  frequency?: Frequency
  tags?: string[]
  example: [string, string]
  phrases?: Array<[string, string]>
}

const seedData: Record<string, { uk: string; us: string; tags: string[]; inflections: string[]; groups: Array<{ pos: string; senses: SeedSense[] }> }> = {
  issue: {
    uk: '/ˈɪʃuː/', us: '/ˈɪʃuː/', tags: ['CET-4', 'CET-6', '熟词僻义'], inflections: ['issues', 'issued', 'issuing'],
    groups: [
      { pos: 'n.', senses: [
        { zh: '问题；议题；争议事项', en: 'an important topic or problem for debate or discussion', example: ['We need to address this issue before the meeting.', '我们需要在会议前处理这个问题。'], phrases: [['address an issue', '处理问题'], ['raise an issue', '提出问题']] },
        { zh: '（杂志、报纸等的）一期；号', en: 'a particular edition of a newspaper or magazine', example: ['The article appeared in the latest issue of the journal.', '这篇文章刊登在该期刊的最新一期。'], phrases: [['the latest issue', '最新一期']] },
        { zh: '发行；分发', en: 'the act of supplying or distributing something for use', frequency: 'less-common', example: ['The issue of new identity cards begins next month.', '新身份证将于下月开始发放。'] },
      ]},
      { pos: 'v.', senses: [
        { zh: '发布；公布', en: 'to officially make a statement, order, or warning known', example: ['The agency issued a warning about the storm.', '该机构发布了暴风雨警报。'], phrases: [['issue a statement', '发表声明'], ['issue a warning', '发布警告']] },
        { zh: '发给；配发', en: 'to officially give something to someone', example: ['Each student was issued a library card.', '每位学生都领到了一张借书证。'], phrases: [['issue something to somebody', '把某物发给某人']] },
      ]},
    ],
  },
  significant: {
    uk: '/sɪɡˈnɪfɪkənt/', us: '/sɪɡˈnɪfɪkənt/', tags: ['CET-4', 'CET-6', '高频'], inflections: [],
    groups: [{ pos: 'adj.', senses: [
      { zh: '重要的；意义重大的', en: 'important enough to be noticed or have an effect', example: ['The discovery is significant for future research.', '这项发现对未来研究意义重大。'], phrases: [['a significant change', '重大变化']] },
      { zh: '显著的；相当数量的', en: 'large or noticeable enough to be important', example: ['There was a significant increase in demand.', '需求出现了显著增长。'], phrases: [['significant increase', '显著增加'], ['statistically significant', '具有统计显著性的']] },
    ]}],
  },
  deteriorate: {
    uk: '/dɪˈtɪəriəreɪt/', us: '/dɪˈtɪriəreɪt/', tags: ['CET-6'], inflections: ['deteriorates', 'deteriorated', 'deteriorating'],
    groups: [{ pos: 'v.', senses: [
      { zh: '恶化；变坏；退化', en: 'to become worse in quality, condition, or value', example: ['Air quality may deteriorate during the winter.', '冬季空气质量可能会恶化。'], phrases: [['deteriorate rapidly', '迅速恶化'], ['health deteriorates', '健康状况恶化']] },
    ]}],
  },
  compelling: {
    uk: '/kəmˈpelɪŋ/', us: '/kəmˈpelɪŋ/', tags: ['CET-6'], inflections: [],
    groups: [{ pos: 'adj.', senses: [
      { zh: '令人信服的；有说服力的', en: 'convincing and making you believe something is true', example: ['She presented compelling evidence to support her claim.', '她提出了令人信服的证据来支持自己的主张。'], phrases: [['compelling evidence', '有力的证据'], ['a compelling argument', '令人信服的论点']] },
      { zh: '引人入胜的；不可抗拒的', en: 'so interesting or powerful that it holds your attention', example: ['The novel tells a compelling story.', '这部小说讲述了一个引人入胜的故事。'], phrases: [['a compelling reason', '令人无法拒绝的理由']] },
    ]}],
  },
  controversy: {
    uk: '/ˈkɒntrəvɜːsi/', us: '/ˈkɑːntrəvɜːrsi/', tags: ['CET-6'], inflections: ['controversies'],
    groups: [{ pos: 'n.', senses: [
      { zh: '争议；争论', en: 'public disagreement or discussion about a subject', example: ['The proposal caused considerable controversy.', '这项提议引发了相当大的争议。'], phrases: [['cause controversy', '引发争议'], ['a matter of controversy', '有争议的问题']] },
    ]}],
  },
  equivalent: {
    uk: '/ɪˈkwɪvələnt/', us: '/ɪˈkwɪvələnt/', tags: ['CET-4', 'CET-6'], inflections: ['equivalents'],
    groups: [
      { pos: 'adj.', senses: [{ zh: '相等的；等同的；等值的', en: 'equal in value, amount, meaning, or importance', example: ['One hour of exercise is equivalent to a long walk.', '一小时锻炼相当于一次长距离步行。'], phrases: [['be equivalent to', '等同于；相当于']] }] },
      { pos: 'n.', senses: [{ zh: '等同物；对应物', en: 'something that has the same value, purpose, or meaning as something else', example: ['There is no exact English equivalent for this expression.', '这个表达在英语中没有完全对应的说法。'], phrases: [['the equivalent of', '与……相等的事物']] }] },
    ],
  },
  address: {
    uk: '/əˈdres/', us: '/əˈdres/', tags: ['CET-4', 'CET-6', '熟词僻义'], inflections: ['addresses', 'addressed', 'addressing'],
    groups: [
      { pos: 'n.', senses: [{ zh: '地址；住址', en: 'details of where someone lives or an organization is located', example: ['Please write your address clearly.', '请把你的地址写清楚。'], phrases: [['email address', '电子邮件地址']] }] },
      { pos: 'v.', senses: [{ zh: '处理；设法解决', en: 'to think about and begin to deal with a problem', tags: ['熟词僻义'], example: ['The policy aims to address the housing shortage.', '这项政策旨在解决住房短缺问题。'], phrases: [['address a problem', '处理问题'], ['address concerns', '回应关切']] }, { zh: '向……讲话；致辞', en: 'to speak formally to a person or group', example: ['The president addressed the audience.', '主席向听众发表了讲话。'] }] },
    ],
  },
}

function toEntry(word: string, source: string, value = seedData[word]): WordEntry {
  const now = nowIso()
  const meanings: MeaningGroup[] = value.groups.map((group) => ({
    partOfSpeech: group.pos,
    senses: group.senses.map((sense) => ({
      id: newId('sense'), chinese: sense.zh, english: sense.en, usage: sense.usage,
      frequency: sense.frequency ?? 'common', tags: sense.tags ?? [], favorite: false,
      examples: [{ id: newId('example'), english: sense.example[0], chinese: sense.example[1], source, representative: true }],
      phrases: (sense.phrases ?? []).map(([english, chinese]) => ({ id: newId('phrase'), english, chinese, kind: 'collocation' })),
    })),
  }))
  return {
    id: newId('word'), word, normalizedWord: word, uk: { ipa: value.uk }, us: { ipa: value.us },
    inflections: value.inflections, tags: value.tags, favorite: false, meanings, note: '', sources: [source], createdAt: now, updatedAt: now,
  }
}

export class BuiltInDictionaryProvider implements DictionaryProvider {
  readonly name = '内置校验词典'
  async lookup(term: string): Promise<WordEntry | null> {
    const normalized = normalizeWord(term)
    return seedData[normalized] ? toEntry(normalized, this.name) : null
  }
}

type OfflineDictionaryRecord = [
  phonetic: string,
  definition: string,
  translation: string,
  tags: string,
  exchange: string,
]

const offlineBuckets = new Map<string, Promise<Record<string, OfflineDictionaryRecord>>>()
const partOfSpeechPattern = /^(n|v|vi|vt|adj|adv|prep|conj|pron|num|art|aux|int)\.\s*/i

function offlineBucket(term: string): string {
  const first = term[0]?.toLowerCase() ?? '_'
  return /^[a-z]$/.test(first) ? first : '_'
}

async function loadOfflineBucket(bucket: string): Promise<Record<string, OfflineDictionaryRecord>> {
  let pending = offlineBuckets.get(bucket)
  if (!pending) {
    const url = `${import.meta.env.BASE_URL}dictionaries/ecdict/${bucket}.json`
    pending = fetch(url, { cache: 'force-cache' }).then(async (response) => {
      if (!response.ok) throw new Error(`离线词典资源缺失 (${response.status})`)
      return await response.json() as Record<string, OfflineDictionaryRecord>
    })
    offlineBuckets.set(bucket, pending)
  }
  return await pending
}

function normalizePartOfSpeech(value: string): string {
  const lower = value.toLowerCase()
  if (lower === 'a') return 'adj.'
  return `${lower}.`
}

function parseInflections(exchange: string): string[] {
  const values = exchange.split('/').flatMap((item) => {
    const separator = item.indexOf(':')
    return separator < 0 ? [] : item.slice(separator + 1).split(',')
  })
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function offlineRecordToEntry(word: string, record: OfflineDictionaryRecord): WordEntry {
  const [phonetic, definition, translation, rawTags, exchange] = record
  const englishLines = definition.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const chineseLines = translation.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const grouped = new Map<string, MeaningGroup['senses']>()

  chineseLines.forEach((line, index) => {
    const match = line.match(partOfSpeechPattern)
    const partOfSpeech = match ? normalizePartOfSpeech(match[1]) : '释义'
    const chinese = line.replace(partOfSpeechPattern, '').trim() || line
    const english = englishLines[index] ?? englishLines[0] ?? 'Offline English-Chinese dictionary entry'
    const senses = grouped.get(partOfSpeech) ?? []
    senses.push({
      id: newId('sense'), chinese, english,
      frequency: index < 2 ? 'common' : 'less-common', tags: [], favorite: false,
      phrases: [], examples: [],
    })
    grouped.set(partOfSpeech, senses)
  })

  const now = nowIso()
  const tags = rawTags.split(/\s+/).filter(Boolean).map((tag) => {
    const upper = tag.toUpperCase()
    return upper === 'CET4' ? 'CET-4' : upper === 'CET6' ? 'CET-6' : upper
  })
  return {
    id: newId('word'), word, normalizedWord: word,
    uk: { ipa: phonetic ? `/${phonetic}/` : undefined },
    us: { ipa: phonetic ? `/${phonetic}/` : undefined },
    inflections: parseInflections(exchange), tags, favorite: false, note: '',
    meanings: [...grouped.entries()].map(([partOfSpeech, senses]) => ({ partOfSpeech, senses })),
    sources: ['ECDICT 离线英汉词典'], createdAt: now, updatedAt: now,
  }
}

export class OfflineEcdictProvider implements DictionaryProvider {
  readonly name = 'ECDICT 离线英汉词典'
  async lookup(term: string): Promise<WordEntry | null> {
    const normalized = normalizeWord(term)
    if (!/^[a-z][a-z' -]*$/.test(normalized)) return null
    const bucket = await loadOfflineBucket(offlineBucket(normalized))
    const record = bucket[normalized]
    return record ? offlineRecordToEntry(normalized, record) : null
  }
}

type FreeDictionaryResult = Array<{
  word: string
  phonetic?: string
  phonetics?: Array<{ text?: string; audio?: string }>
  meanings?: Array<{ partOfSpeech: string; definitions: Array<{ definition: string; example?: string }> }>
  sourceUrls?: string[]
}>

export class FreeDictionaryProvider implements DictionaryProvider {
  readonly name = 'Free Dictionary API'
  async lookup(term: string): Promise<WordEntry | null> {
    const normalized = normalizeWord(term)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    let response: Response
    try {
      response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`, { signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('词典服务连接超时，请重试')
      throw error
    } finally {
      clearTimeout(timeout)
    }
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`词典服务响应 ${response.status}`)
    const results = (await response.json()) as FreeDictionaryResult
    const result = results[0]
    if (!result) return null
    const now = nowIso()
    const usAudio = result.phonetics?.find((item) => item.audio?.includes('-us.'))?.audio
    const ukAudio = result.phonetics?.find((item) => item.audio?.includes('-uk.'))?.audio
    return {
      id: newId('word'), word: result.word, normalizedWord: normalized,
      uk: { ipa: result.phonetics?.find((item) => item.text)?.text ?? result.phonetic, audioUrl: ukAudio },
      us: { ipa: result.phonetics?.find((item) => item.text)?.text ?? result.phonetic, audioUrl: usAudio },
      inflections: [], tags: [], favorite: false, note: '', createdAt: now, updatedAt: now,
      sources: result.sourceUrls?.length ? result.sourceUrls : [this.name],
      meanings: (result.meanings ?? []).map((meaning) => ({
        partOfSpeech: meaning.partOfSpeech,
        senses: meaning.definitions.map((definition, index) => ({
          id: newId('sense'), chinese: '待通过已授权的翻译 Provider 补充', english: definition.definition,
          frequency: index < 2 ? 'common' : 'less-common', tags: [], favorite: false, phrases: [],
          examples: definition.example ? [{ id: newId('example'), english: definition.example, chinese: '待补充中文翻译', source: this.name, representative: index === 0 }] : [],
        })),
      })),
    }
  }
}

export class CompositeDictionaryProvider implements DictionaryProvider {
  readonly name = '组合词典'
  constructor(private readonly providers: DictionaryProvider[]) {}
  async lookup(term: string): Promise<WordEntry | null> {
    let merged: WordEntry | null = null
    const errors: string[] = []
    for (const provider of this.providers) {
      try {
        const result = await provider.lookup(term)
        if (result) merged = merged ? mergeWordEntries(merged, result) : result
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : '查询失败'}`)
      }
    }
    if (!merged && errors.length) throw new Error(errors.join('；'))
    return merged
  }
}

export class FallbackDictionaryProvider implements DictionaryProvider {
  readonly name = '分层词典'
  constructor(private readonly providers: DictionaryProvider[]) {}
  async lookup(term: string): Promise<WordEntry | null> {
    const errors: string[] = []
    for (const provider of this.providers) {
      try {
        const result = await provider.lookup(term)
        if (result) return result
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : '查询失败'}`)
      }
    }
    if (errors.length) throw new Error(errors.join('；'))
    return null
  }
}

export class CachedDictionaryProvider implements DictionaryProvider {
  readonly name = '本地缓存词典'
  private readonly memory = new Map<string, WordEntry>()
  constructor(private readonly inner: DictionaryProvider) {}
  async lookup(term: string): Promise<WordEntry | null> {
    const normalized = normalizeWord(term)
    const memoryHit = this.memory.get(normalized)
    if (memoryHit) return structuredClone(memoryHit)
    const diskHit = this.read(normalized)
    if (diskHit) {
      this.memory.set(normalized, diskHit)
      return structuredClone(diskHit)
    }
    const result = await this.inner.lookup(term)
    if (result) {
      this.memory.set(normalized, result)
      this.write(normalized, result)
    }
    return result
  }
  private read(key: string): WordEntry | null {
    try {
      const raw = globalThis.localStorage?.getItem(`dictionary-cache:v1:${key}`)
      return raw ? JSON.parse(raw) as WordEntry : null
    } catch { return null }
  }
  private write(key: string, value: WordEntry): void {
    try { globalThis.localStorage?.setItem(`dictionary-cache:v1:${key}`, JSON.stringify(value)) } catch { /* 存储空间不足时不阻断查询 */ }
  }
}

export const dictionaryProvider = new CachedDictionaryProvider(new FallbackDictionaryProvider([
  new BuiltInDictionaryProvider(),
  new OfflineEcdictProvider(),
  new FreeDictionaryProvider(),
]))
