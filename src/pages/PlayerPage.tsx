import { ChevronLeft, ChevronRight, ListMusic, Pause, Pencil, Play, Plus, Repeat2, Shuffle, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPlaybackQueue, playbackVolume, resolvePlaybackQueueIndex, resolvePlaybackWordbookId, shuffleWords } from '../domain/player'
import { newId } from '../domain/defaults'
import { collectWordbookWordIds } from '../domain/operations'
import type { PlaybackContentType, PlaybackPreset, QueueItem } from '../domain/types'
import { englishPassageAudioUrl, fallbackEnglishPassageAudioUrl, pronunciationAudioUrl, spellingLetters, ttsProvider } from '../providers/tts'
import { desktopRequest, isWindowsDesktop } from '../platform/desktopBridge'
import { deleteOfflineAudioForWordbook, findOfflineAudio, offlineAudioForWordbook, saveOfflineAudio } from '../storage/offlineAudio'
import type { AppStore } from '../state/useAppStore'

const labels: Record<PlaybackContentType, string> = { word: '单词', spelling: '拼写', partOfSpeechMeaning: '词性与中文释义', exampleEnglish: '英文例句', exampleChinese: '例句中文', phraseEnglish: '英文短语/搭配', phraseChinese: '短语中文' }
const gaps = [0, .5, 1, 2, 3, 5]

export function PlayerPage({ store, initialBookId }: { store: AppStore; initialBookId?: string }) {
  const data = store.data!
  const [bookId, setBookId] = useState(() => resolvePlaybackWordbookId(data, initialBookId))
  const [presetId, setPresetId] = useState(() => initialBookId ? data.settings.activePresetId : data.playbackPosition.presetId || data.settings.activePresetId)
  const [mode, setMode] = useState<'sequential' | 'random'>(() => !initialBookId && data.playbackPosition.randomOrder ? 'random' : 'sequential')
  const [loop, setLoop] = useState(false)
  const [queueIndex, setQueueIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [offlineCount, setOfflineCount] = useState(0)
  const [offlineBytes, setOfflineBytes] = useState(0)
  const [offlineProgress, setOfflineProgress] = useState<{ current: number; total: number } | null>(null)
  const [offlineMessage, setOfflineMessage] = useState('')
  const [resumeInitialized, setResumeInitialized] = useState(false)
  const stopped = useRef(false)
  const pauseRequested = useRef(false)
  const playbackRun = useRef(0)
  const preset = data.presets.find((item) => item.id === presetId) ?? data.presets[0]
  const latestPreset = useRef(preset)
  latestPreset.current = preset
  const bookCounts = useMemo(() => new Map(data.wordbooks.map((book) => [book.id, collectWordbookWordIds(data, book.id).size])), [data.wordbooks, data.wordbookItems, data.words])
  const words = useMemo(() => {
    const ids = collectWordbookWordIds(data, bookId)
    const values = data.words.filter((word) => ids.has(word.id))
    if (mode !== 'random') return values
    const savedOrder = data.playbackPosition.wordbookId === bookId ? data.playbackPosition.wordOrder ?? [] : []
    const byId = new Map(values.map((word) => [word.id, word]))
    const ordered = savedOrder.map((id) => byId.get(id)).filter((word): word is typeof values[number] => Boolean(word))
    const orderedIds = new Set(ordered.map((word) => word.id))
    return [...ordered, ...shuffleWords(values.filter((word) => !orderedIds.has(word.id)))]
  }, [bookId, data.wordbooks, data.wordbookItems, data.words, data.playbackPosition.wordbookId, data.playbackPosition.wordOrder, mode])
  const queue = useMemo(() => preset ? buildPlaybackQueue(words, preset) : [], [words, preset])
  const current: QueueItem | undefined = queue[queueIndex]
  const currentWord = data.words.find((word) => word.id === current?.wordId)
  const wordPosition = currentWord ? words.findIndex((word) => word.id === currentWord.id) + 1 : 0

  useEffect(() => () => { stopped.current = true; pauseRequested.current = false; playbackRun.current += 1; ttsProvider.stop(); window.WordAssistantAndroid?.stopBackgroundPlayback?.() }, [])
  useEffect(() => {
    if (resumeInitialized || !queue.length) return
    const position = data.playbackPosition
    if (!initialBookId && position.wordbookId === bookId) {
      if (position.presetId && data.presets.some((item) => item.id === position.presetId) && position.presetId !== presetId) {
        setPresetId(position.presetId)
        return
      }
      setQueueIndex(resolvePlaybackQueueIndex(words.map((word) => word.id), queue, position.wordIndex, position.wordId))
    }
    setResumeInitialized(true)
  }, [bookId, data.playbackPosition, data.presets, initialBookId, presetId, queue, resumeInitialized, words])
  useEffect(() => {
    let active = true
    void offlineAudioForWordbook(bookId).then((records) => {
      if (!active) return
      setOfflineCount(records.length)
      setOfflineBytes(records.reduce((sum, item) => sum + item.bytes, 0))
    }).catch(() => undefined)
    return () => { active = false }
  }, [bookId])
  useEffect(() => {
    if (data.wordbooks.some((book) => book.id === bookId)) return
    const fallbackId = resolvePlaybackWordbookId(data)
    stopped.current = true
    ttsProvider.stop()
    setBookId(fallbackId)
    setQueueIndex(0)
    setPlaying(false)
    setPaused(false)
    setError('')
  }, [bookId, data.wordbooks, data])

  const playFrom = async (start: number) => {
    if (!queue.length) return
    const run = ++playbackRun.current
    window.WordAssistantAndroid?.startBackgroundPlayback?.()
    pauseRequested.current = false
    stopped.current = false; setPlaying(true); setPaused(false); setError('')
    let index = start
    let lastSavedWordIndex = -1
    while (!stopped.current && playbackRun.current === run) {
      while (pauseRequested.current && !stopped.current && playbackRun.current === run) await new Promise((resolve) => window.setTimeout(resolve, 50))
      if (stopped.current || playbackRun.current !== run) break
      if (index >= queue.length) { if (loop) index = 0; else break }
      const item = queue[index]; setQueueIndex(index)
      try {
        const wordIndex = words.findIndex((word) => word.id === item.wordId)
        if (wordIndex >= 0 && wordIndex !== lastSavedWordIndex) {
          lastSavedWordIndex = wordIndex
          store.commit((current) => {
            const position = current.playbackPosition
            const sameRandomOrder = mode === 'random' && position.wordbookId === bookId && position.randomOrder && position.wordOrder?.length === words.length
            const wordOrder = mode === 'random'
              ? (sameRandomOrder ? position.wordOrder : words.map((word) => word.id))
              : (position.wordOrder?.length === 0 ? position.wordOrder : [])
            const updatedAt = new Date().toISOString()
            return { ...current, playbackPosition: { ...position, wordbookId: bookId, wordId: item.wordId, wordIndex, total: words.length, presetId, randomOrder: mode === 'random', wordOrder, updatedAt }, dirty: true, updatedAt }
          })
        }
        const voiceName = item.lang === 'zh-CN' ? data.settings.chineseVoice : data.settings.englishVoice
        const lang = item.lang === 'en-US' ? data.settings.englishAccent : item.lang
        const currentVolume = latestPreset.current?.rules[item.type].volume ?? item.volume
        const options = { lang, rate: item.rate, volume: playbackVolume(currentVolume) / 100, voiceName }
        if (item.type === 'spelling') {
          await ttsProvider.speakSpelling(item.text, options)
        } else if (item.lang !== 'zh-CN') {
          const word = data.words.find((entry) => entry.id === item.wordId)
          const audioUrl = item.type === 'word' ? (lang === 'en-GB' ? word?.uk.audioUrl : word?.us.audioUrl) : undefined
          await ttsProvider.speakWord(item.text, options, audioUrl)
        } else {
          await ttsProvider.speak(item.text, options)
        }
        if (item.gapSeconds) await wait(item.gapSeconds * 1000, () => stopped.current || playbackRun.current !== run, () => pauseRequested.current)
      } catch (reason) { if (!stopped.current && playbackRun.current === run) setError(reason instanceof Error ? reason.message : '播放失败'); break }
      if (playbackRun.current !== run) return
      index += 1
    }
    if (playbackRun.current !== run) return
    window.WordAssistantAndroid?.stopBackgroundPlayback?.()
    setPlaying(false); setPaused(false)
  }
  const stop = () => { stopped.current = true; pauseRequested.current = false; playbackRun.current += 1; ttsProvider.stop(); window.WordAssistantAndroid?.stopBackgroundPlayback?.(); setPlaying(false); setPaused(false) }
  const selectBook = (nextBookId: string) => {
    stop()
    setBookId(nextBookId)
    setQueueIndex(0)
    setError('')
    setOfflineMessage('')
    store.commit((current) => ({
      ...current,
      playbackPosition: { ...current.playbackPosition, wordbookId: nextBookId, wordId: undefined, wordIndex: 0, total: collectWordbookWordIds(current, nextBookId).size, randomOrder: false, wordOrder: [], updatedAt: new Date().toISOString() },
      dirty: true,
      updatedAt: new Date().toISOString(),
    }))
    setMode('sequential')
    setResumeInitialized(true)
  }
  const togglePause = () => {
    if (!playing) { void playFrom(queueIndex); return }
    if (paused) { pauseRequested.current = false; window.WordAssistantAndroid?.startBackgroundPlayback?.(); ttsProvider.resume(); setPaused(false) }
    else { pauseRequested.current = true; ttsProvider.pause(); window.WordAssistantAndroid?.stopBackgroundPlayback?.(); setPaused(true) }
  }
  const moveWord = (direction: -1 | 1) => {
    stop()
    const target = Math.max(0, Math.min(words.length - 1, wordPosition - 1 + direction))
    const index = queue.findIndex((item) => item.wordId === words[target]?.id)
    if (index >= 0) {
      setQueueIndex(index)
      store.commit((current) => ({ ...current, playbackPosition: { ...current.playbackPosition, wordbookId: bookId, wordId: words[target].id, wordIndex: target, total: words.length, presetId, randomOrder: mode === 'random', wordOrder: mode === 'random' ? words.map((word) => word.id) : [], updatedAt: new Date().toISOString() }, dirty: true, updatedAt: new Date().toISOString() }))
    }
  }
  const updatePreset = (next: PlaybackPreset) => { latestPreset.current = next; store.savePreset(next) }
  const selectPreset = (nextId: string) => {
    stop()
    setPresetId(nextId)
    setQueueIndex(0)
    store.commit((current) => ({
      ...current,
      playbackPosition: { ...current.playbackPosition, presetId: nextId, wordId: undefined, wordIndex: 0, updatedAt: new Date().toISOString() },
      settings: { ...current.settings, activePresetId: nextId },
      dirty: true,
      updatedAt: new Date().toISOString(),
    }))
  }
  const toggleMode = () => {
    stop()
    const nextMode = mode === 'random' ? 'sequential' : 'random'
    const selectedIds = collectWordbookWordIds(data, bookId)
    const nextWords = nextMode === 'random' ? shuffleWords([...words]) : data.words.filter((word) => selectedIds.has(word.id))
    setMode(nextMode)
    setQueueIndex(0)
    store.commit((current) => ({ ...current, playbackPosition: { ...current.playbackPosition, wordbookId: bookId, wordId: undefined, wordIndex: 0, total: nextWords.length, presetId, randomOrder: nextMode === 'random', wordOrder: nextMode === 'random' ? nextWords.map((word) => word.id) : [], updatedAt: new Date().toISOString() }, dirty: true, updatedAt: new Date().toISOString() }))
  }
  const downloadOfflinePack = async () => {
    if (!bookId || offlineProgress) return
    const selectedIds = collectWordbookWordIds(data, bookId)
    const bookWords = data.words.filter((word) => selectedIds.has(word.id))
    const accent = data.settings.englishAccent
    const targets = new Map<string, string[]>()
    const addTarget = (text: string, kind: 'word' | 'spelling' | 'passage', rate = 1) => {
      const value = text.trim()
      if (!value) return
      const candidates = kind === 'word'
        ? [pronunciationAudioUrl(value, accent), englishPassageAudioUrl(value, rate), fallbackEnglishPassageAudioUrl(value)]
        : kind === 'spelling'
          ? [fallbackEnglishPassageAudioUrl(value.toLocaleUpperCase('en-US'))]
          : [englishPassageAudioUrl(value, rate), fallbackEnglishPassageAudioUrl(value)]
      const urls = [...new Set(candidates.filter((url): url is string => Boolean(url)))]
      if (urls.length) targets.set(urls[0], urls)
    }
    for (const word of bookWords) {
      addTarget(word.word, 'word', preset?.rules.word.rate ?? 1)
      for (const letter of spellingLetters(word.word)) addTarget(letter, 'spelling', preset?.rules.spelling.rate ?? 1)
      for (const group of word.meanings) for (const sense of group.senses) {
        for (const phrase of sense.phrases) addTarget(phrase.english, 'passage', preset?.rules.phraseEnglish.rate ?? 1)
        for (const example of sense.examples) addTarget(example.english, 'passage', preset?.rules.exampleEnglish.rate ?? 1)
      }
    }
    setOfflineProgress({ current: 0, total: targets.size })
    setOfflineMessage('')
    const existing = new Set((await offlineAudioForWordbook(bookId).catch(() => [])).map((item) => item.url))
    let downloaded = 0
    let bytes = 0
    let failures = 0
    let completed = 0
    for (const urls of targets.values()) {
      setOfflineProgress({ current: ++completed, total: targets.size })
      if (urls.some((url) => existing.has(url))) continue
      let blob: Blob | null = null
      let successfulUrl = ''
      for (const url of urls) {
        try {
          const cached = await findOfflineAudio(url).catch(() => null)
          if (cached) { blob = cached; successfulUrl = url; break }
          let responseBlob: Blob
          if (isWindowsDesktop) {
            const response = await desktopRequest('fetchEnglishAudioUrl', { url })
            if (!response.audioDataUrl) continue
            responseBlob = await (await fetch(response.audioDataUrl)).blob()
          } else if (window.WordAssistantAndroid?.downloadAudio) {
            responseBlob = await downloadAndroidAudio(url)
          } else {
            const response = await fetch(url, { cache: 'no-store' })
            if (!response.ok || !response.headers.get('content-type')?.toLocaleLowerCase().includes('audio')) continue
            responseBlob = await response.blob()
          }
          if (responseBlob.size < 256) continue
          blob = responseBlob
          successfulUrl = url
          break
        } catch { /* try the next pronunciation source */ }
      }
      if (blob && successfulUrl) {
        try { await saveOfflineAudio(successfulUrl, blob, bookId); downloaded += 1; bytes += blob.size }
        catch { failures += 1 }
      } else failures += 1
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    }
    setOfflineProgress(null)
    const records = await offlineAudioForWordbook(bookId).catch(() => [])
    setOfflineCount(records.length)
    setOfflineBytes(records.reduce((sum, item) => sum + item.bytes, 0))
    setOfflineMessage(`离线英文发音包处理完成：本次保存 ${downloaded} 段（${formatBytes(bytes)}），${failures} 段未能下载。中文释义仍使用设备语音。`)
  }
  const deleteOfflinePack = async () => {
    if (!window.confirm('删除此生词本在本机保存的离线英文发音？')) return
    try {
      await deleteOfflineAudioForWordbook(bookId)
      setOfflineCount(0)
      setOfflineBytes(0)
      setOfflineMessage('已删除此生词本的离线包；与其他生词本共享的录音仍保留。')
    } catch {
      setOfflineMessage('删除失败，请检查本机存储后重试。')
    }
  }
  const validatePresetName = (rawName: string, exceptId?: string) => {
    const name = rawName.trim()
    if (!name) { window.alert('模式名称不能为空。'); return null }
    if (data.presets.some((item) => item.id !== exceptId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      window.alert(`已经有名为“${name}”的模式。`)
      return null
    }
    return name
  }
  const createPreset = () => {
    if (!preset) return
    const suggestedBase = '自定义模式'
    let suggested = suggestedBase
    let suffix = 2
    while (data.presets.some((item) => item.name === suggested)) suggested = `${suggestedBase} ${suffix++}`
    const rawName = window.prompt('新建模式：请输入名称', suggested)
    if (rawName === null) return
    const name = validatePresetName(rawName)
    if (!name) return
    const copy = { ...structuredClone(preset), id: newId('preset'), name, builtIn: false }
    store.savePreset(copy)
    selectPreset(copy.id)
  }
  const renamePreset = () => {
    if (!preset) return
    const rawName = window.prompt('重命名模式', preset.name)
    if (rawName === null) return
    const name = validatePresetName(rawName, preset.id)
    if (!name || name === preset.name) return
    updatePreset({ ...preset, name })
  }
  return <div className="page player-page">
    <div className="page-title"><div><p className="eyebrow">连续语音复习</p><h1>播放</h1><p>每一种内容都可以独立控制。</p></div></div>
    <div className="player-layout">
      <section className="now-playing card">
        <div className="player-top"><label>播放来源<select value={bookId} onChange={(event) => selectBook(event.target.value)} disabled={Boolean(offlineProgress)}>{data.wordbooks.map((book) => <option key={book.id} value={book.id}>{book.name}（{bookCounts.get(book.id) ?? 0}）</option>)}</select></label><span>{wordPosition || 0} / {words.length}</span></div>
        <div className="record"><div className={playing && !paused ? 'record-disc spinning' : 'record-disc'}><ListMusic /></div></div>
        <div className="current-copy"><p>{current ? labels[current.type] : '准备播放'}</p><h2>{currentWord?.word ?? '选择含有单词的生词本'}</h2><div className="current-text">{current?.text ?? `队列共 ${queue.length} 个播报片段`}</div></div>
        <div className="seek"><i style={{ width: `${queue.length ? (queueIndex + 1) / queue.length * 100 : 0}%` }} /></div>
        <div className="transport"><button onClick={() => moveWord(-1)}><ChevronLeft /></button><button className="play-main" onClick={togglePause}>{playing && !paused ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><button onClick={() => moveWord(1)}><ChevronRight /></button><button className="stop-control" onClick={stop}><Square size={18} /></button></div>
        <div className="mode-controls"><button className={mode === 'random' ? 'active' : ''} onClick={toggleMode}><Shuffle size={16} />随机</button><button className={loop ? 'active' : ''} onClick={() => setLoop(!loop)}><Repeat2 size={16} />循环</button></div>
        {error && <div className="notice error">{error}</div>}
        <div className="offline-pack"><div><b>离线英文发音</b><small>按当前发音偏好和语速保存单词、字母、短语及例句；设置改变后可再次下载。</small><small>中文释义仍由设备语音朗读。本机已保存 {offlineCount} 段 · {formatBytes(offlineBytes)}</small></div><button className="button secondary compact" onClick={() => void downloadOfflinePack()} disabled={Boolean(offlineProgress) || !words.length}>{offlineProgress ? `下载中 ${offlineProgress.current}/${offlineProgress.total}` : '下载到本机'}</button>{offlineCount > 0 && <button className="button secondary compact" onClick={() => void deleteOfflinePack()} disabled={Boolean(offlineProgress)}>删除</button>}</div>
        {offlineMessage && <div className="notice">{offlineMessage}</div>}
        <p className="background-note">Android 播放时会启动前台媒体服务，锁屏后尽量保持连续播放；其他平台仍受系统后台策略限制。</p>
      </section>
      <section className="preset-panel card">
        <div className="section-heading"><div><p className="eyebrow">播放模式</p><h2>{preset?.name}</h2></div><div className="action-row"><select value={presetId} onChange={(event) => selectPreset(event.target.value)}>{data.presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button secondary compact" onClick={createPreset}><Plus size={16} />新建模式</button><button className="button secondary compact" onClick={renamePreset}><Pencil size={15} />重命名</button></div></div>
        {preset && <>
          <div className="scope-row"><span>多义词范围</span>{(['all', 'common', 'favorites'] as const).map((scope) => <button key={scope} className={preset.senseScope === scope ? 'active' : ''} onClick={() => updatePreset({ ...preset, senseScope: scope })}>{scope === 'all' ? '全部义项' : scope === 'common' ? '常用义项' : '仅收藏义项'}</button>)}</div>
          <p className="volume-hint">音量 50% 是原来的响度；录音可调至约两倍。系统语音受设备上限限制，不能超过原响度。调整从下一段开始生效。</p>
          <div className="rules-table"><div className="rule-head"><span>内容</span><span>播放</span><span>次数</span><span>语速</span><span>间隔</span><span>音量</span></div>{(Object.keys(labels) as PlaybackContentType[]).map((type) => {
            const rule = preset.rules[type]
            const update = (changes: Partial<typeof rule>) => updatePreset({ ...preset, rules: { ...preset.rules, [type]: { ...rule, ...changes } } })
            return <div className="rule-row" key={type}>
              <b>{labels[type]}</b>
              <label className="rule-control"><span>播放</span><input type="checkbox" checked={rule.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label>
              <label className="rule-control"><span>次数</span><select value={rule.repeats} onChange={(event) => update({ repeats: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="rule-control"><span>语速</span><SpeedInput value={rule.rate} onChange={(rate) => update({ rate })} /></label>
              <label className="rule-control"><span>间隔</span><select value={rule.gapSeconds} onChange={(event) => update({ gapSeconds: Number(event.target.value) })}>{gaps.map((value) => <option key={value} value={value}>{value}秒</option>)}</select></label>
              <div className="rule-control volume-rule"><span>音量</span><VolumeInput value={playbackVolume(rule.volume) / 2} onChange={(volume) => update({ volume: volume * 2 })} label={`${labels[type]}音量`} /></div>
            </div>
          })}</div>
        </>}
      </section>
    </div>
  </div>
}

function wait(ms: number, canceled: () => boolean, paused: () => boolean) {
  return new Promise<void>((resolve) => {
    let remaining = ms
    let previous = Date.now()
    const tick = () => {
      const now = Date.now()
      if (!paused()) remaining -= now - previous
      previous = now
      if (canceled() || remaining <= 0) resolve()
      else window.setTimeout(tick, 50)
    }
    tick()
  })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function downloadAndroidAudio(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const bridge = window.WordAssistantAndroid
    if (!bridge?.downloadAudio) { reject(new Error('当前设备不支持下载离线音频')); return }
    const requestId = crypto.randomUUID()
    const finish = (result?: string) => {
      window.clearTimeout(timeout)
      window.removeEventListener('wordAssistantAudioDownloaded', receive)
      if (!result) { reject(new Error('音频下载失败')); return }
      void fetch(result).then((response) => response.blob()).then(resolve, reject)
    }
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; dataUrl: string }>).detail
      if (detail?.requestId === requestId) finish(detail.dataUrl)
    }
    const timeout = window.setTimeout(() => finish(), 35000)
    window.addEventListener('wordAssistantAudioDownloaded', receive)
    try { bridge.downloadAudio(url, requestId) }
    catch { finish() }
  })
}

function VolumeInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const parsed = Number(draft)
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return <div className="volume-input">
    <input type="range" min="0" max="100" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} />
    <input type="number" min="0" max="100" step="1" inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label={`${label}百分比`} />
    <span>%</span>
  </div>
}

function SpeedInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) ? Math.min(2, Math.max(.5, Math.round(parsed * 100) / 100)) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return <div className="speed-input">
    <input
      type="number"
      min="0.5"
      max="2"
      step="0.01"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      aria-label="语速倍数"
    />
    <span>×</span>
  </div>
}
