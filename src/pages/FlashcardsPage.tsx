import { Brain, Eye, RotateCcw, Shuffle, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isFlashcardDue, masteryLabel, reviewFlashcard } from '../domain/flashcards'
import { nowIso } from '../domain/defaults'
import type { FlashcardRating, WordEntry } from '../domain/types'
import { ttsProvider } from '../providers/tts'
import type { AppStore } from '../state/useAppStore'

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function collectBookIds(data: AppStore['data'], selectedId: string): Set<string> {
  const ids = new Set<string>([selectedId])
  let changed = true
  while (changed) {
    changed = false
    data?.wordbooks.forEach((book) => {
      if (book.parentId && ids.has(book.parentId) && !ids.has(book.id)) { ids.add(book.id); changed = true }
    })
  }
  return ids
}

export function FlashcardsPage({ store }: { store: AppStore }) {
  const data = store.data!
  const [sourceId, setSourceId] = useState('all')
  const [dueOnly, setDueOnly] = useState(true)
  const [randomOrder, setRandomOrder] = useState(true)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [queue, setQueue] = useState<string[]>([])
  const [initialTotal, setInitialTotal] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [sessionCounts, setSessionCounts] = useState({ again: 0, hard: 0, known: 0 })
  const [speechError, setSpeechError] = useState('')

  const sourceWords = useMemo(() => {
    if (sourceId === 'all') return data.words
    const bookIds = collectBookIds(data, sourceId)
    const wordIds = new Set(data.wordbookItems.filter((item) => bookIds.has(item.wordbookId)).map((item) => item.wordId))
    return data.words.filter((word) => wordIds.has(word.id))
  }, [data.words, data.wordbooks, data.wordbookItems, sourceId])
  const sourceKey = sourceWords.map((word) => word.id).join('|')

  useEffect(() => {
    const progress = new Map(data.flashcardProgress.map((item) => [item.wordId, item]))
    const candidates = dueOnly ? sourceWords.filter((word) => isFlashcardDue(progress.get(word.id))) : sourceWords
    const ids = (randomOrder ? shuffled(candidates) : candidates).map((word) => word.id)
    setQueue(ids)
    setInitialTotal(ids.length)
    setRevealed(false)
    setSessionCounts({ again: 0, hard: 0, known: 0 })
  // Progress changes during this session must not rebuild the in-memory queue.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, dueOnly, randomOrder, sourceKey, sessionVersion])

  const current = data.words.find((word) => word.id === queue[0])
  const currentProgress = current ? data.flashcardProgress.find((item) => item.wordId === current.id) : undefined
  const reviewed = sessionCounts.again + sessionCounts.hard + sessionCounts.known
  const meanings = current?.meanings.flatMap((group) => group.senses.map((sense) => ({ ...sense, partOfSpeech: group.partOfSpeech }))) ?? []
  const example = meanings.flatMap((sense) => sense.examples).find((item) => item.representative) ?? meanings.flatMap((sense) => sense.examples)[0]
  const phrases = meanings.flatMap((sense) => sense.phrases).slice(0, 3)

  const speak = (word: WordEntry) => {
    setSpeechError('')
    const accent = data.settings.englishAccent
    const pronunciation = accent === 'en-GB' ? word.uk : word.us
    void ttsProvider.speakWord(word.word, { lang: accent, rate: 1, voiceName: data.settings.englishVoice }, pronunciation.audioUrl)
      .catch((reason) => setSpeechError(reason instanceof Error ? reason.message : '发音播放失败'))
  }

  useEffect(() => {
    if (current && autoSpeak) speak(current)
    return () => ttsProvider.stop()
  // Only speak when the active card changes or auto play is toggled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, autoSpeak])

  const rateCard = (rating: FlashcardRating) => {
    if (!current || !revealed) return
    const progress = reviewFlashcard(current.id, currentProgress, rating)
    store.commit((value) => ({
      ...value,
      flashcardProgress: value.flashcardProgress.some((item) => item.wordId === current.id)
        ? value.flashcardProgress.map((item) => item.wordId === current.id ? progress : item)
        : [...value.flashcardProgress, progress],
      dirty: true,
      updatedAt: nowIso(),
    }))
    setSessionCounts((counts) => ({ ...counts, [rating]: counts[rating] + 1 }))
    setQueue((items) => {
      const remaining = items.slice(1)
      if (rating !== 'again') return remaining
      const position = Math.min(3, remaining.length)
      return [...remaining.slice(0, position), current.id, ...remaining.slice(position)]
    })
    setRevealed(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, select, textarea, button')) return
      if (event.code === 'Space') { event.preventDefault(); setRevealed((value) => !value) }
      if (revealed && event.key === '1') rateCard('again')
      if (revealed && event.key === '2') rateCard('hard')
      if (revealed && event.key === '3') rateCard('known')
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  })

  const totalDue = data.words.filter((word) => isFlashcardDue(data.flashcardProgress.find((item) => item.wordId === word.id))).length
  const mastered = data.flashcardProgress.filter((item) => item.level >= 3).length

  return <div className="page flashcards-page">
    <div className="page-title">
      <div><p className="eyebrow">主动回忆 · 间隔复习</p><h1>单词卡</h1><p>先回想答案，再翻面判断掌握程度。</p></div>
      <div className="flashcard-overview"><span>今日待复习 <b>{totalDue}</b></span><span>已掌握 <b>{mastered}</b></span></div>
    </div>

    <section className="flashcard-toolbar card">
      <label>卡片来源<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="all">全部生词（{data.words.length}）</option>{data.wordbooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label>
      <label className="flashcard-check"><input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} />仅复习到期卡片</label>
      <label className="flashcard-check"><input type="checkbox" checked={randomOrder} onChange={(event) => setRandomOrder(event.target.checked)} /><Shuffle size={16} />随机顺序</label>
      <label className="flashcard-check"><input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} /><Volume2 size={16} />自动发音</label>
    </section>

    {!current && <section className="flashcard-empty card"><Brain size={48} /><h2>{sourceWords.length ? '本轮复习完成' : '这个生词本还没有单词'}</h2><p>{sourceWords.length ? `本轮共判断 ${reviewed} 次：认识 ${sessionCounts.known}，模糊 ${sessionCounts.hard}，不认识 ${sessionCounts.again}。` : '先查询或导入一些单词，再回来制作记忆。'}</p><div className="action-row">{dueOnly && sourceWords.length > 0 && <button className="button secondary" onClick={() => setDueOnly(false)}>复习全部单词</button>}<button className="button primary" onClick={() => setSessionVersion((value) => value + 1)}><RotateCcw size={17} />重新开始</button></div></section>}

    {current && <>
      <div className="flashcard-progress"><span>{Math.min(reviewed + 1, initialTotal)} / {initialTotal}</span><i style={{ width: `${initialTotal ? Math.min(100, reviewed / initialTotal * 100) : 0}%` }} /></div>
      <section className={`study-card card ${revealed ? 'revealed' : ''}`} onClick={() => setRevealed(true)}>
        <div className="study-card-top"><span>{masteryLabel(currentProgress?.level ?? 0)} · 已复习 {currentProgress?.reviewCount ?? 0} 次</span><button className="icon-button" title="播放发音" onClick={(event) => { event.stopPropagation(); speak(current) }}><Volume2 /></button></div>
        <div className="study-word"><h2>{current.word}</h2><p>{current.uk.ipa && `英 /${current.uk.ipa}/`}{current.uk.ipa && current.us.ipa && '　'}{current.us.ipa && `美 /${current.us.ipa}/`}</p></div>
        {!revealed && <button className="reveal-button" onClick={() => setRevealed(true)}><Eye size={19} />显示答案 <kbd>Space</kbd></button>}
        {revealed && <div className="study-answer">
          <div className="flashcard-meanings">{meanings.slice(0, 6).map((sense) => <div key={sense.id}><b>{sense.partOfSpeech}</b><span>{sense.chinese || sense.english}</span></div>)}</div>
          {phrases.length > 0 && <div className="flashcard-phrases">{phrases.map((phrase) => <span key={phrase.id}><b>{phrase.english}</b>{phrase.chinese}</span>)}</div>}
          {example && <blockquote><p>{example.english}</p><p>{example.chinese}</p></blockquote>}
          {current.note && <p className="flashcard-note">备注：{current.note}</p>}
        </div>}
      </section>
      {speechError && <div className="notice error">{speechError}</div>}
      <div className="rating-row">
        <button className="rating-again" disabled={!revealed} onClick={() => rateCard('again')}><b>不认识</b><span>10 分钟后 · 1</span></button>
        <button className="rating-hard" disabled={!revealed} onClick={() => rateCard('hard')}><b>有点模糊</b><span>明天 · 2</span></button>
        <button className="rating-known" disabled={!revealed} onClick={() => rateCard('known')}><b>认识</b><span>延长间隔 · 3</span></button>
      </div>
    </>}
  </div>
}
