import type { Accent } from '../domain/types'
import { desktopRequest, isWindowsDesktop } from '../platform/desktopBridge'

export interface SpeakOptions {
  lang: Accent
  rate: number
  voiceName?: string
}

export interface TtsProvider {
  readonly name: string
  speak(text: string, options: SpeakOptions): Promise<void>
  speakWord(text: string, options: SpeakOptions, audioUrl?: string): Promise<void>
  speakSpelling(text: string, options: SpeakOptions): Promise<void>
  pause(): void
  resume(): void
  stop(): void
  voices(): SpeechSynthesisVoice[]
}

const normalizeLocale = (value: string) => value.trim().replaceAll('_', '-').toLocaleLowerCase()

const naturalVoicePattern = /\b(natural|neural|online)\b/i

export function selectVoice(voices: SpeechSynthesisVoice[], options: SpeakOptions): SpeechSynthesisVoice | null {
  const requestedName = options.voiceName?.trim()
  if (requestedName) {
    const named = voices.find((voice) => voice.name === requestedName)
    if (named) return named
  }

  const requestedLocale = normalizeLocale(options.lang)
  const requestedLanguage = requestedLocale.split('-')[0]
  const candidates = voices.filter((voice) => normalizeLocale(voice.lang).split('-')[0] === requestedLanguage)
  candidates.sort((left, right) => scoreVoice(right, requestedLocale) - scoreVoice(left, requestedLocale))
  return candidates[0] ?? null
}

function scoreVoice(voice: SpeechSynthesisVoice, requestedLocale: string): number {
  const locale = normalizeLocale(voice.lang)
  return (locale === requestedLocale ? 100 : 0)
    + (naturalVoicePattern.test(voice.name) ? 20 : 0)
    + (voice.default ? 2 : 0)
}

function normalizeAudioUrl(value: string): string | null {
  if (!value.trim()) return null
  try {
    const parsed = new URL(value, 'https://api.dictionaryapi.dev')
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch { return null }
}

export function pronunciationAudioUrl(text: string, accent: 'en-US' | 'en-GB'): string | null {
  const word = text.trim().toLocaleLowerCase('en-US')
  if (!/^[\p{Script=Latin}][\p{Script=Latin}\p{M}'’\-]*$/u.test(word)) return null
  const type = accent === 'en-GB' ? 1 : 2
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`
}

export function passageSpeechSpeed(rate: number): number {
  if (rate <= .6) return 2
  if (rate <= .7) return 3
  if (rate <= .85) return 4
  if (rate <= 1) return 5
  if (rate <= 1.1) return 6
  if (rate <= 1.25) return 7
  if (rate <= 1.5) return 8
  return 9
}

export function englishPassageAudioUrl(text: string, rate = 1): string | null {
  const value = text.trim()
  if (value.length > 500 || !/\p{Script=Latin}/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return null
  return `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(value)}&spd=${passageSpeechSpeed(rate)}&source=web`
}

export function spellingLetters(text: string): string[] {
  return [...text].filter((value) => /[a-z]/i.test(value))
}

export class WebSpeechTtsProvider implements TtsProvider {
  readonly name = '词典标准发音 + 系统语音'
  private activeAudio: { element: HTMLAudioElement; finish: () => void } | null = null
  private operation = 0
  voices() { return globalThis.speechSynthesis?.getVoices?.() ?? [] }
  pause() {
    globalThis.speechSynthesis?.pause()
    this.activeAudio?.element.pause()
  }
  resume() {
    globalThis.speechSynthesis?.resume()
    if (this.activeAudio) void this.activeAudio.element.play().catch(() => undefined)
  }
  stop() {
    this.operation += 1
    this.cancelCurrentPlayback()
  }
  private cancelCurrentPlayback() {
    globalThis.speechSynthesis?.cancel()
    if (this.activeAudio) {
      this.activeAudio.element.pause()
      this.activeAudio.element.currentTime = 0
      this.activeAudio.finish()
      this.activeAudio = null
    }
  }
  async speakWord(text: string, options: SpeakOptions, audioUrl?: string): Promise<void> {
    const operation = ++this.operation
    this.cancelCurrentPlayback()
    const dictionaryAudio = options.lang === 'en-US' || options.lang === 'en-GB'
      ? pronunciationAudioUrl(text, options.lang)
      : null
    const passageAudio = options.lang === 'en-US' || options.lang === 'en-GB'
      ? englishPassageAudioUrl(text, options.rate)
      : null
    if (!dictionaryAudio && passageAudio && isWindowsDesktop) {
      try {
        const response = await desktopRequest('fetchEnglishAudio', { text, rate: options.rate })
        if (operation !== this.operation) return
        if (response.audioDataUrl) {
          await this.playAudio(response.audioDataUrl, 1)
          return
        }
      } catch { /* Windows 原生代理不可用时继续尝试系统英文声音 */ }
    }
    const candidates = [...new Set([
      dictionaryAudio,
      normalizeAudioUrl(audioUrl ?? ''),
      isWindowsDesktop ? null : passageAudio,
    ].filter((url): url is string => Boolean(url)))]
    for (const candidate of candidates) {
      if (operation !== this.operation) return
      if (typeof Audio === 'undefined') break
      try {
        await this.playAudio(candidate, candidate === passageAudio ? 1 : options.rate)
        return
      } catch { /* 当前音频源不可用时尝试下一个标准发音源 */ }
    }
    const selectedVoice = selectVoice(this.voices(), options)
    if (selectedVoice) {
      await this.speak(text, options)
      return
    }
    throw new Error('标准英文发音加载失败，请检查网络后重试。为避免怪异语调，未使用旧式系统合成音。')
  }
  async speakSpelling(text: string, options: SpeakOptions): Promise<void> {
    const letters = spellingLetters(text)
    if (!letters.length || (options.lang !== 'en-US' && options.lang !== 'en-GB')) {
      throw new Error('没有可播报的英文字母。')
    }
    const operation = ++this.operation
    this.cancelCurrentPlayback()
    for (const letter of letters) {
      if (operation !== this.operation) return
      const url = pronunciationAudioUrl(letter, options.lang)
      if (!url) continue
      try {
        // Keep each recorded letter at its native speed; slowing a very short
        // MP3 creates the same metallic artifacts as sentence time-stretching.
        await this.playAudio(url, 1)
      } catch {
        throw new Error(`字母 ${letter.toLocaleUpperCase('en-US')} 的标准发音加载失败，请检查网络后重试。`)
      }
    }
  }
  speak(text: string, options: SpeakOptions): Promise<void> {
    if (!globalThis.speechSynthesis) return Promise.reject(new Error('当前浏览器不支持系统语音。'))
    this.operation += 1
    this.cancelCurrentPlayback()
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = options.lang
      utterance.rate = options.rate
      utterance.pitch = 1
      utterance.volume = 1
      utterance.voice = selectVoice(this.voices(), options)
      utterance.onend = () => resolve()
      utterance.onerror = (event) => reject(new Error(event.error === 'canceled' ? '播放已停止' : `语音播放失败：${event.error}`))
      globalThis.speechSynthesis.speak(utterance)
    })
  }
  private playAudio(url: string, rate: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.playbackRate = Math.max(.5, Math.min(2, rate))
      audio.preservesPitch = true
      let settled = false
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        audio.onended = null
        audio.onerror = null
        if (this.activeAudio?.element === audio) this.activeAudio = null
        if (error) reject(error); else resolve()
      }
      this.activeAudio = { element: audio, finish: () => finish() }
      audio.onended = () => finish()
      audio.onerror = () => finish(new Error('词典发音音频加载失败'))
      void audio.play().catch((error) => finish(error))
    })
  }
}

export const ttsProvider = new WebSpeechTtsProvider()
