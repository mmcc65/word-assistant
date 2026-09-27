import { afterEach, describe, expect, it, vi } from 'vitest'
import { englishPassageAudioUrl, fallbackEnglishPassageAudioUrl, passageSpeechSpeed, pronunciationAudioUrl, selectVoice, spellingLetters, spellingSpeechText, WebSpeechTtsProvider } from '../providers/tts'

const voice = (name: string, lang: string, isDefault = false) => ({
  name,
  lang,
  default: isDefault,
  localService: true,
  voiceURI: name,
}) as SpeechSynthesisVoice

describe('英文语音选择', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('精确匹配用户选择的英美口音', () => {
    const voices = [voice('British voice', 'en-GB'), voice('American voice', 'en-US')]
    expect(selectVoice(voices, { lang: 'en-US', rate: 1 })?.name).toBe('American voice')
    expect(selectVoice(voices, { lang: 'en-GB', rate: 1 })?.name).toBe('British voice')
  })

  it('同口音下优先使用 Natural 高质量声音', () => {
    const voices = [voice('Microsoft Standard', 'en-US', true), voice('Microsoft Aria Online (Natural)', 'en-US')]
    expect(selectVoice(voices, { lang: 'en-US', rate: 1 })?.name).toContain('Natural')
  })

  it('尊重用户明确选择的声音', () => {
    const voices = [voice('Voice A', 'en-US'), voice('Voice B', 'en-US')]
    expect(selectVoice(voices, { lang: 'en-US', rate: 1, voiceName: 'Voice B' })?.name).toBe('Voice B')
  })

  it('词典音频精确请求英式或美式发音', () => {
    expect(pronunciationAudioUrl('hello', 'en-US')).toContain('type=2')
    expect(pronunciationAudioUrl('hello', 'en-GB')).toContain('type=1')
    expect(pronunciationAudioUrl('This is an issue.', 'en-US')).toBeNull()
  })

  it('短语、例句和逐字母拼写使用完整英文语音接口', () => {
    expect(englishPassageAudioUrl('a compelling argument', .9)).toContain('a%20compelling%20argument')
    expect(englishPassageAudioUrl('a compelling argument', .9)).toContain('spd=5')
    expect(englishPassageAudioUrl('c, o, m, p, e, l, l, i, n, g')).toContain('fanyi.baidu.com/gettts')
  })

  it('短语和例句由服务端按目标速度生成，避免客户端变速产生金属回音', () => {
    expect(passageSpeechSpeed(.7)).toBe(3)
    expect(passageSpeechSpeed(.9)).toBe(5)
    expect(passageSpeechSpeed(1.1)).toBe(6)
    expect(passageSpeechSpeed(1.37)).toBe(7)
    expect(passageSpeechSpeed(1.8)).toBe(7)
    expect(passageSpeechSpeed(2)).toBe(7)
    expect(fallbackEnglishPassageAudioUrl('C, O, M')).toContain('translate.google.com/translate_tts')
  })

  it('拼写会拆成独立字母而不是重新朗读整个单词', () => {
    expect(spellingLetters('c o m p e l l i n g')).toEqual(['c', 'o', 'm', 'p', 'e', 'l', 'l', 'i', 'n', 'g'])
    expect(spellingSpeechText('c o m p e l l i n g')).toBe('C, O, M, P, E, L, L, I, N, G')
    expect(englishPassageAudioUrl(spellingSpeechText('issue'), .7)).toContain('I%2C%20S%2C%20S%2C%20U%2C%20E')
  })

  it('拼写播放会逐个提交大写字母，不会把字母重新合成单词', async () => {
    const spoken: string[] = []
    class FakeUtterance {
      lang = ''
      rate = 1
      pitch = 1
      volume = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('Audio', class {
      preload = ''
      playbackRate = 1
      preservesPitch = true
      volume = 1
      currentTime = 0
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      pause() {}
      play() { return Promise.reject(new Error('recorded audio unavailable in test')) }
    })
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [],
      cancel: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      speak: (utterance: FakeUtterance) => {
        spoken.push(utterance.text)
        setTimeout(() => utterance.onend?.(), 0)
      },
    })

    await new WebSpeechTtsProvider().speakSpelling('cat', { lang: 'en-US', rate: 1 })
    expect(spoken).toEqual(['C', 'A', 'T'])
  })

  it('系统未提供 speechSynthesis 时不会在启动或控制播放时崩溃', () => {
    const provider = new WebSpeechTtsProvider()
    expect(provider.voices()).toEqual([])
    expect(() => provider.pause()).not.toThrow()
    expect(() => provider.resume()).not.toThrow()
    expect(() => provider.stop()).not.toThrow()
  })
})
