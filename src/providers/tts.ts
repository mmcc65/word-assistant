import type { Accent } from '../domain/types'
import { desktopRequest, isWindowsDesktop } from '../platform/desktopBridge'
import { findOfflineAudio } from '../storage/offlineAudio'

export interface SpeakOptions {
  lang: Accent
  rate: number
  volume?: number
  voiceName?: string
}

function outputVolume(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1
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
  if (rate <= .5) return 1
  if (rate <= .6) return 2
  if (rate <= .7) return 3
  if (rate <= .85) return 4
  if (rate <= 1) return 5
  if (rate <= 1.1) return 6
  return 7
}

export function englishPassageAudioUrl(text: string, rate = 1): string | null {
  const value = text.trim()
  if (value.length > 500 || !/\p{Script=Latin}/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return null
  return `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(value)}&spd=${passageSpeechSpeed(rate)}&source=web`
}

export function fallbackEnglishPassageAudioUrl(text: string): string | null {
  const value = text.trim()
  if (value.length > 200 || !/\p{Script=Latin}/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return null
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(value)}`
}

export function spellingLetters(text: string): string[] {
  return [...text].filter((value) => /[a-z]/i.test(value))
}

export function spellingSpeechText(text: string): string {
  return spellingLetters(text)
    .map((letter) => letter.toLocaleUpperCase('en-US'))
    .join(', ')
}

export class WebSpeechTtsProvider implements TtsProvider {
  readonly name = '词典标准发音 + 系统语音'
  private activeAudio: { element: HTMLAudioElement; finish: () => void } | null = null
  private audioContext: AudioContext | null = null
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
    const fallbackPassageAudio = options.lang === 'en-US' || options.lang === 'en-GB'
      ? fallbackEnglishPassageAudioUrl(text)
      : null
    if (dictionaryAudio || passageAudio) {
      const standardRateAudio = englishPassageAudioUrl(text, 1)
      for (const url of [dictionaryAudio, passageAudio, standardRateAudio, fallbackPassageAudio]) {
        if (!url) continue
        try {
          if (await findOfflineAudio(url)) {
            await this.playAudio(url, url === passageAudio ? 1 : options.rate, outputVolume(options.volume), 1, operation)
            return
          }
        } catch { /* continue with online source */ }
      }
    }
    if (!dictionaryAudio && passageAudio && isWindowsDesktop) {
      try {
        const response = await desktopRequest('fetchEnglishAudio', { text, rate: options.rate })
        if (operation !== this.operation) return
        if (response.audioDataUrl) {
          await this.playAudio(response.audioDataUrl, 1, outputVolume(options.volume), 1, operation)
          return
        }
      } catch { /* Windows 原生代理不可用时继续尝试系统英文声音 */ }
    }
    const candidates = [...new Set([
      dictionaryAudio,
      normalizeAudioUrl(audioUrl ?? ''),
      isWindowsDesktop ? null : passageAudio,
      fallbackPassageAudio,
    ].filter((url): url is string => Boolean(url)))]
    for (const candidate of candidates) {
      if (operation !== this.operation) return
      if (typeof Audio === 'undefined') break
      try {
        await this.playAudio(candidate, candidate === passageAudio ? 1 : options.rate, outputVolume(options.volume), 1, operation)
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
    const letters = spellingLetters(text).map((letter) => letter.toLocaleUpperCase('en-US'))
    if (!letters.length || (options.lang !== 'en-US' && options.lang !== 'en-GB')) {
      throw new Error('没有可播报的英文字母。')
    }
    const operation = ++this.operation
    this.cancelCurrentPlayback()
    for (const letter of letters) {
      if (operation !== this.operation) return
      let recordedLetterPlayed = false
      try {
        const recordedUrl = fallbackEnglishPassageAudioUrl(letter)
        if (recordedUrl && await findOfflineAudio(recordedUrl).catch(() => null)) {
          await this.playAudio(recordedUrl, options.rate, outputVolume(options.volume), 1.6, operation)
          recordedLetterPlayed = true
        }
        if (!recordedLetterPlayed && isWindowsDesktop) {
          const response = await desktopRequest('fetchEnglishAudio', { text: letter, rate: options.rate, spelling: true })
          if (operation !== this.operation) return
          if (response.audioDataUrl) {
            await this.playAudio(response.audioDataUrl, options.rate, outputVolume(options.volume), 1.6, operation)
            recordedLetterPlayed = true
          }
        } else if (!recordedLetterPlayed) {
          if (recordedUrl && typeof Audio !== 'undefined') {
            await this.playAudio(recordedUrl, options.rate, outputVolume(options.volume), 1, operation)
            recordedLetterPlayed = true
          }
        }
      } catch { /* 标准字母录音不可用时回退到系统英文声音 */ }
      if (!recordedLetterPlayed) {
        if (!globalThis.speechSynthesis) throw new Error('当前系统不支持逐字母发音。')
        await this.speakSystemUtterance(letter, options)
      }
      if (operation !== this.operation) return
      await new Promise((resolve) => setTimeout(resolve, 90))
    }
  }
  speak(text: string, options: SpeakOptions): Promise<void> {
    if (!globalThis.speechSynthesis) return Promise.reject(new Error('当前浏览器不支持系统语音。'))
    this.operation += 1
    this.cancelCurrentPlayback()
    return this.speakSystemUtterance(text, options)
  }
  private speakSystemUtterance(text: string, options: SpeakOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = options.lang
      utterance.rate = options.rate
      utterance.pitch = 1
      // SpeechSynthesisUtterance cannot amplify above 1; recorded audio uses Web Audio below.
      utterance.volume = Math.min(1, outputVolume(options.volume))
      utterance.voice = selectVoice(this.voices(), options)
      utterance.onend = () => resolve()
      utterance.onerror = (event) => reject(new Error(event.error === 'canceled' ? '播放已停止' : `语音播放失败：${event.error}`))
      globalThis.speechSynthesis.speak(utterance)
    })
  }
  private async playAudio(url: string, rate: number, volume = 1, gain = 1, operation = this.operation): Promise<void> {
    let playbackUrl = url
    let revokePlaybackUrl = false
    if (/^https:\/\//i.test(url)) {
      try {
        const cached = await findOfflineAudio(url)
        if (cached) {
          playbackUrl = URL.createObjectURL(cached)
          revokePlaybackUrl = true
        }
      } catch { /* 本地存储不可用时仍使用在线音频 */ }
    }
    // Amplification needs same-origin bytes; routing a cross-origin media element through
    // Web Audio can produce silence when the source doesn't allow CORS.
    if (volume > 1 && /^https:\/\//i.test(playbackUrl)) {
      try {
        if (isWindowsDesktop) {
          const response = await desktopRequest('fetchEnglishAudioUrl', { url })
          if (response.audioDataUrl) playbackUrl = response.audioDataUrl
        } else {
          const response = await fetch(url)
          if (response.ok) {
            playbackUrl = URL.createObjectURL(await response.blob())
            revokePlaybackUrl = true
          }
        }
      } catch { /* 无法读取录音时继续以原响度播放，避免静音 */ }
    }
    if (operation !== this.operation) {
      if (revokePlaybackUrl) URL.revokeObjectURL(playbackUrl)
      return
    }
    return new Promise((resolve, reject) => {
      const audio = new Audio(playbackUrl)
      audio.preload = 'auto'
      audio.playbackRate = Math.max(.5, Math.min(2, rate))
      audio.preservesPitch = true
      audio.volume = Math.min(1, outputVolume(volume))
      let sourceNode: MediaElementAudioSourceNode | null = null
      let gainNode: GainNode | null = null
      let compressorNode: DynamicsCompressorNode | null = null
      if (gain * volume > 1 && (playbackUrl.startsWith('data:') || revokePlaybackUrl) && typeof AudioContext !== 'undefined') {
        try {
          this.audioContext ??= new AudioContext()
          void this.audioContext.resume()
          sourceNode = this.audioContext.createMediaElementSource(audio)
          gainNode = this.audioContext.createGain()
          compressorNode = this.audioContext.createDynamicsCompressor()
          gainNode.gain.value = gain * volume
          compressorNode.threshold.value = -10
          compressorNode.knee.value = 12
          compressorNode.ratio.value = 4
          sourceNode.connect(gainNode).connect(compressorNode).connect(this.audioContext.destination)
        } catch {
          sourceNode = null
          gainNode = null
          compressorNode = null
        }
      }
      let settled = false
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        audio.onended = null
        audio.onerror = null
        sourceNode?.disconnect()
        gainNode?.disconnect()
        compressorNode?.disconnect()
        if (revokePlaybackUrl) URL.revokeObjectURL(playbackUrl)
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
