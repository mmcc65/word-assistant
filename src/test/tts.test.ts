import { describe, expect, it } from 'vitest'
import { englishPassageAudioUrl, passageSpeechSpeed, pronunciationAudioUrl, selectVoice, spellingLetters, WebSpeechTtsProvider } from '../providers/tts'

const voice = (name: string, lang: string, isDefault = false) => ({
  name,
  lang,
  default: isDefault,
  localService: true,
  voiceURI: name,
}) as SpeechSynthesisVoice

describe('英文语音选择', () => {
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
    expect(passageSpeechSpeed(1.37)).toBe(8)
    expect(passageSpeechSpeed(1.8)).toBe(9)
  })

  it('拼写会拆成独立字母而不是重新朗读整个单词', () => {
    expect(spellingLetters('c o m p e l l i n g')).toEqual(['c', 'o', 'm', 'p', 'e', 'l', 'l', 'i', 'n', 'g'])
  })

  it('系统未提供 speechSynthesis 时不会在启动或控制播放时崩溃', () => {
    const provider = new WebSpeechTtsProvider()
    expect(provider.voices()).toEqual([])
    expect(() => provider.pause()).not.toThrow()
    expect(() => provider.resume()).not.toThrow()
    expect(() => provider.stop()).not.toThrow()
  })
})
