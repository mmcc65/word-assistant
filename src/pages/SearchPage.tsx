import { Search } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { WordDetail } from '../components/WordDetail'
import { dictionaryProvider } from '../providers/dictionary'
import { ttsProvider } from '../providers/tts'
import type { AppStore } from '../state/useAppStore'
import type { WordEntry } from '../domain/types'

export function SearchPage({ store }: { store: AppStore }) {
  const data = store.data!
  const [term, setTerm] = useState('issue')
  const [result, setResult] = useState<WordEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bookId, setBookId] = useState(data.wordbooks.find((book) => book.id === 'wb-reading')?.id ?? data.wordbooks[0]?.id ?? '')
  const search = async (event?: FormEvent, requestedTerm = term) => {
    event?.preventDefault()
    setLoading(true); setError('')
    const local = data.words.find((word) => word.normalizedWord === requestedTerm.trim().toLocaleLowerCase('en-US'))
    try {
      const entry = local ?? await dictionaryProvider.lookup(requestedTerm)
      if (!entry) setError('没有找到这个词，请检查拼写或稍后重试。')
      setResult(entry)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '查询失败') }
    finally { setLoading(false) }
  }
  const liveResult = result ? data.words.find((word) => word.normalizedWord === result.normalizedWord) ?? result : null
  const alreadyAdded = liveResult ? data.wordbookItems.some((item) => item.wordId === liveResult.id && item.wordbookId === bookId) : false
  const playWord = async (word: WordEntry) => {
    setError('')
    try {
      await ttsProvider.speakWord(word.word, { lang: data.settings.englishAccent, rate: 0.9, voiceName: data.settings.englishVoice }, data.settings.englishAccent === 'en-GB' ? word.uk.audioUrl : word.us.audioUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '标准发音播放失败')
    }
  }
  return <div className="page narrow-page">
    <div className="page-title"><div><p className="eyebrow">结构化词典</p><h1>查询</h1><p>保留完整义项，再选择是否加入生词本。</p></div></div>
    <form className="search-form" onSubmit={(event) => void search(event)}>
      <Search size={21} /><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="输入英文单词或短语" autoCapitalize="none" />
      <button className="button primary" disabled={!term.trim() || loading}>{loading ? '查询中…' : '查询'}</button>
    </form>
    <div className="suggestions"><span>试试：</span>{['issue', 'address', 'significant', 'compelling'].map((word) => <button key={word} onClick={() => { setTerm(word); void search(undefined, word) }}>{word}</button>)}</div>
    {error && <div className="notice error">{error}</div>}
    {liveResult && <>
      <div className="destination-row"><label>加入到</label><select value={bookId} onChange={(event) => setBookId(event.target.value)}>{data.wordbooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></div>
      <WordDetail entry={liveResult} alreadyAdded={alreadyAdded} onFavorite={() => {
        if (!data.words.some((word) => word.id === liveResult.id)) { const added = store.addWord(liveResult, bookId); store.toggleWordFavorite(added.word.id) }
        else store.toggleWordFavorite(liveResult.id)
      }} onSenseFavorite={(senseId) => {
        if (!data.words.some((word) => word.id === liveResult.id)) { const added = store.addWord(liveResult, bookId); store.toggleSenseFavorite(added.word.id, senseId) }
        else store.toggleSenseFavorite(liveResult.id, senseId)
      }} onAdd={() => store.addWord(liveResult, bookId)} onPlay={() => void playWord(liveResult)} />
    </>}
    {!liveResult && !error && <div className="empty-state"><Search size={36} /><h3>查询一个生词</h3><p>验收词 issue 已内置完整多词性资料；其他词会自动调用结构化词典。</p></div>}
  </div>
}
