import { ChevronLeft, ChevronRight, ListMusic, Pause, Pencil, Play, Plus, Repeat2, Shuffle, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPlaybackQueue, resolvePlaybackWordbookId, shuffleWords } from '../domain/player'
import { newId } from '../domain/defaults'
import { collectWordbookWordIds } from '../domain/operations'
import type { PlaybackContentType, PlaybackPreset, QueueItem } from '../domain/types'
import { ttsProvider } from '../providers/tts'
import type { AppStore } from '../state/useAppStore'

const labels: Record<PlaybackContentType, string> = { word: '单词', spelling: '拼写', partOfSpeechMeaning: '词性与中文释义', exampleEnglish: '英文例句', exampleChinese: '例句中文', phraseEnglish: '英文短语/搭配', phraseChinese: '短语中文' }
const gaps = [0, .5, 1, 2, 3, 5]

export function PlayerPage({ store, initialBookId }: { store: AppStore; initialBookId?: string }) {
  const data = store.data!
  const [bookId, setBookId] = useState(() => resolvePlaybackWordbookId(data, initialBookId))
  const [presetId, setPresetId] = useState(data.settings.activePresetId)
  const [mode, setMode] = useState<'sequential' | 'random'>('sequential')
  const [loop, setLoop] = useState(false)
  const [queueIndex, setQueueIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const stopped = useRef(false)
  const preset = data.presets.find((item) => item.id === presetId) ?? data.presets[0]
  const bookCounts = useMemo(() => new Map(data.wordbooks.map((book) => [book.id, collectWordbookWordIds(data, book.id).size])), [data.wordbooks, data.wordbookItems, data.words])
  const words = useMemo(() => {
    const ids = collectWordbookWordIds(data, bookId)
    const values = data.words.filter((word) => ids.has(word.id))
    return mode === 'random' ? shuffleWords(values) : values
  }, [bookId, data.wordbooks, data.wordbookItems, data.words, mode])
  const queue = useMemo(() => preset ? buildPlaybackQueue(words, preset) : [], [words, preset])
  const current: QueueItem | undefined = queue[queueIndex]
  const currentWord = data.words.find((word) => word.id === current?.wordId)
  const wordPosition = currentWord ? words.findIndex((word) => word.id === currentWord.id) + 1 : 0

  useEffect(() => () => { stopped.current = true; ttsProvider.stop() }, [])
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
    stopped.current = false; setPlaying(true); setPaused(false); setError('')
    let index = start
    while (!stopped.current) {
      if (index >= queue.length) { if (loop) index = 0; else break }
      const item = queue[index]; setQueueIndex(index)
      try {
        const voiceName = item.lang === 'zh-CN' ? data.settings.chineseVoice : data.settings.englishVoice
        const lang = item.lang === 'en-US' ? data.settings.englishAccent : item.lang
        const options = { lang, rate: item.rate, voiceName }
        if (item.type === 'spelling') {
          await ttsProvider.speakSpelling(item.text, options)
        } else if (item.lang !== 'zh-CN') {
          const word = data.words.find((entry) => entry.id === item.wordId)
          const audioUrl = item.type === 'word' ? (lang === 'en-GB' ? word?.uk.audioUrl : word?.us.audioUrl) : undefined
          await ttsProvider.speakWord(item.text, options, audioUrl)
        } else {
          await ttsProvider.speak(item.text, options)
        }
        if (item.gapSeconds) await wait(item.gapSeconds * 1000, () => stopped.current)
      } catch (reason) { if (!stopped.current) setError(reason instanceof Error ? reason.message : '播放失败'); break }
      index += 1
    }
    setPlaying(false); setPaused(false)
  }
  const stop = () => { stopped.current = true; ttsProvider.stop(); setPlaying(false); setPaused(false) }
  const selectBook = (nextBookId: string) => {
    stop()
    setBookId(nextBookId)
    setQueueIndex(0)
    setError('')
    store.commit((current) => ({
      ...current,
      playbackPosition: { ...current.playbackPosition, wordbookId: nextBookId, wordIndex: 0, total: collectWordbookWordIds(current, nextBookId).size, updatedAt: new Date().toISOString() },
    }))
  }
  const togglePause = () => {
    if (!playing) { void playFrom(queueIndex); return }
    if (paused) { ttsProvider.resume(); setPaused(false) } else { ttsProvider.pause(); setPaused(true) }
  }
  const moveWord = (direction: -1 | 1) => {
    stop()
    const target = Math.max(0, Math.min(words.length - 1, wordPosition - 1 + direction))
    const index = queue.findIndex((item) => item.wordId === words[target]?.id)
    if (index >= 0) setQueueIndex(index)
  }
  const updatePreset = (next: PlaybackPreset) => store.savePreset(next)
  const selectPreset = (nextId: string) => {
    stop()
    setPresetId(nextId)
    setQueueIndex(0)
    store.commit((current) => ({
      ...current,
      playbackPosition: { ...current.playbackPosition, presetId: nextId, updatedAt: new Date().toISOString() },
      settings: { ...current.settings, activePresetId: nextId },
      dirty: true,
      updatedAt: new Date().toISOString(),
    }))
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
        <div className="player-top"><label>播放来源<select value={bookId} onChange={(event) => selectBook(event.target.value)}>{data.wordbooks.map((book) => <option key={book.id} value={book.id}>{book.name}（{bookCounts.get(book.id) ?? 0}）</option>)}</select></label><span>{wordPosition || 0} / {words.length}</span></div>
        <div className="record"><div className={playing && !paused ? 'record-disc spinning' : 'record-disc'}><ListMusic /></div></div>
        <div className="current-copy"><p>{current ? labels[current.type] : '准备播放'}</p><h2>{currentWord?.word ?? '选择含有单词的生词本'}</h2><div className="current-text">{current?.text ?? `队列共 ${queue.length} 个播报片段`}</div></div>
        <div className="seek"><i style={{ width: `${queue.length ? (queueIndex + 1) / queue.length * 100 : 0}%` }} /></div>
        <div className="transport"><button onClick={() => moveWord(-1)}><ChevronLeft /></button><button className="play-main" onClick={togglePause}>{playing && !paused ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><button onClick={() => moveWord(1)}><ChevronRight /></button><button className="stop-control" onClick={stop}><Square size={18} /></button></div>
        <div className="mode-controls"><button className={mode === 'random' ? 'active' : ''} onClick={() => setMode(mode === 'random' ? 'sequential' : 'random')}><Shuffle size={16} />随机</button><button className={loop ? 'active' : ''} onClick={() => setLoop(!loop)}><Repeat2 size={16} />循环</button></div>
        {error && <div className="notice error">{error}</div>}
        <p className="background-note">Web/PWA 端后台连续性受系统限制；HarmonyOS 原生桥接完成后由长时音频任务接管。</p>
      </section>
      <section className="preset-panel card">
        <div className="section-heading"><div><p className="eyebrow">播放模式</p><h2>{preset?.name}</h2></div><div className="action-row"><select value={presetId} onChange={(event) => selectPreset(event.target.value)}>{data.presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button secondary compact" onClick={createPreset}><Plus size={16} />新建模式</button><button className="button secondary compact" onClick={renamePreset}><Pencil size={15} />重命名</button></div></div>
        {preset && <>
          <div className="scope-row"><span>多义词范围</span>{(['all', 'common', 'favorites'] as const).map((scope) => <button key={scope} className={preset.senseScope === scope ? 'active' : ''} onClick={() => updatePreset({ ...preset, senseScope: scope })}>{scope === 'all' ? '全部义项' : scope === 'common' ? '常用义项' : '仅收藏义项'}</button>)}</div>
          <div className="rules-table"><div className="rule-head"><span>内容</span><span>播放</span><span>次数</span><span>语速</span><span>间隔</span></div>{(Object.keys(labels) as PlaybackContentType[]).map((type) => {
            const rule = preset.rules[type]
            const update = (changes: Partial<typeof rule>) => updatePreset({ ...preset, rules: { ...preset.rules, [type]: { ...rule, ...changes } } })
            return <div className="rule-row" key={type}>
              <b>{labels[type]}</b>
              <label className="rule-control"><span>播放</span><input type="checkbox" checked={rule.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label>
              <label className="rule-control"><span>次数</span><select value={rule.repeats} onChange={(event) => update({ repeats: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="rule-control"><span>语速</span><SpeedInput value={rule.rate} onChange={(rate) => update({ rate })} /></label>
              <label className="rule-control"><span>间隔</span><select value={rule.gapSeconds} onChange={(event) => update({ gapSeconds: Number(event.target.value) })}>{gaps.map((value) => <option key={value} value={value}>{value}秒</option>)}</select></label>
            </div>
          })}</div>
        </>}
      </section>
    </div>
  </div>
}

function wait(ms: number, canceled: () => boolean) { return new Promise<void>((resolve) => { const start = Date.now(); const tick = () => canceled() || Date.now() - start >= ms ? resolve() : setTimeout(tick, 50); tick() }) }

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
