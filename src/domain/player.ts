import type { PlaybackPreset, QueueItem, Sense, WordEntry } from './types'

function repeatItems(
  word: WordEntry,
  type: QueueItem['type'],
  texts: string[],
  lang: QueueItem['lang'],
  preset: PlaybackPreset,
): QueueItem[] {
  const rule = preset.rules[type]
  if (!rule.enabled || rule.repeats <= 0) return []
  return texts.flatMap((text, textIndex) =>
    Array.from({ length: rule.repeats }, (_, repetition) => ({
      id: `${word.id}:${type}:${textIndex}:${repetition}`,
      wordId: word.id,
      type,
      text,
      lang,
      rate: rule.rate,
      gapSeconds: rule.gapSeconds,
      repetition: repetition + 1,
    })),
  )
}

const spokenPartOfSpeech: Record<string, string> = {
  n: '名词',
  noun: '名词',
  v: '动词',
  verb: '动词',
  vi: '不及物动词',
  vt: '及物动词',
  a: '形容词',
  adj: '形容词',
  adjective: '形容词',
  r: '副词',
  adv: '副词',
  adverb: '副词',
  prep: '介词',
  preposition: '介词',
  conj: '连词',
  conjunction: '连词',
  pron: '代词',
  pronoun: '代词',
  num: '数词',
  numeral: '数词',
  art: '冠词',
  article: '冠词',
  aux: '助动词',
  auxiliary: '助动词',
  int: '感叹词',
  interj: '感叹词',
  interjection: '感叹词',
  modal: '情态动词',
  det: '限定词',
  determiner: '限定词',
  abbr: '缩写',
  abbreviation: '缩写',
}

export function partOfSpeechForSpeech(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('en-US').replaceAll('.', '')
  return spokenPartOfSpeech[normalized] ?? value.trim()
}

function selectedSenses(word: WordEntry, preset: PlaybackPreset): Array<{ partOfSpeech: string; sense: Sense }> {
  return word.meanings.flatMap((group) => group.senses.map((sense) => ({ partOfSpeech: group.partOfSpeech, sense }))).filter(({ sense }) => {
    if (preset.senseScope === 'favorites') return sense.favorite
    if (preset.senseScope === 'common') return sense.frequency === 'common'
    return true
  })
}

export function buildPlaybackQueue(words: WordEntry[], preset: PlaybackPreset): QueueItem[] {
  return words.flatMap((word) => {
    const senses = selectedSenses(word, preset)
    const meanings = senses.map(({ partOfSpeech, sense }) => `${partOfSpeechForSpeech(partOfSpeech)}，${sense.chinese}`)
    const representativeExamples = senses.flatMap(({ sense }) => {
      const representatives = sense.examples.filter((item) => item.representative)
      return representatives.length ? representatives : sense.examples.slice(0, 1)
    })
    const phrases = senses.flatMap(({ sense }) => sense.phrases)
    const spelling = word.word.split('').join(' ')
    return [
      ...repeatItems(word, 'word', [word.word], 'en-US', preset),
      ...repeatItems(word, 'spelling', [spelling], 'en-US', preset),
      ...repeatItems(word, 'partOfSpeechMeaning', meanings, 'zh-CN', preset),
      ...phrases.flatMap((item, index) => [
        ...repeatItems(word, 'phraseEnglish', [item.english], 'en-US', preset).map((queueItem) => ({ ...queueItem, id: `${queueItem.id}:phrase:${index}` })),
        ...repeatItems(word, 'phraseChinese', [item.chinese], 'zh-CN', preset).map((queueItem) => ({ ...queueItem, id: `${queueItem.id}:phrase:${index}` })),
      ]),
      ...representativeExamples.flatMap((item, index) => [
        ...repeatItems(word, 'exampleEnglish', [item.english], 'en-US', preset).map((queueItem) => ({ ...queueItem, id: `${queueItem.id}:example:${index}` })),
        ...repeatItems(word, 'exampleChinese', [item.chinese], 'zh-CN', preset).map((queueItem) => ({ ...queueItem, id: `${queueItem.id}:example:${index}` })),
      ]),
    ].filter((item) => item.text.trim())
  })
}

export function shuffleWords<T>(values: T[], random = Math.random): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
