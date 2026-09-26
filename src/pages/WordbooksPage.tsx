import { ChevronRight, Folder, FolderPlus, Import, MoreHorizontal, MoveRight, Play, Search, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { WordDetail } from '../components/WordDetail'
import { ttsProvider } from '../providers/tts'
import type { WordEntry } from '../domain/types'
import type { AppStore } from '../state/useAppStore'

export function WordbooksPage({ store, initialId, navigate }: { store: AppStore; initialId?: string; navigate: (page: string) => void }) {
  const data = store.data!
  const [selectedId, setSelectedId] = useState(initialId && data.wordbooks.some((book) => book.id === initialId) ? initialId : data.wordbooks[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [expandedWord, setExpandedWord] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState('')
  const selected = data.wordbooks.find((book) => book.id === selectedId)
  const ids = useMemo(() => {
    const result = new Set([selectedId]); let changed = true
    while (changed) { changed = false; data.wordbooks.forEach((book) => { if (book.parentId && result.has(book.parentId) && !result.has(book.id)) { result.add(book.id); changed = true } }) }
    return result
  }, [data.wordbooks, selectedId])
  const wordIds = new Set(data.wordbookItems.filter((item) => ids.has(item.wordbookId)).map((item) => item.wordId))
  const words = data.words.filter((word) => wordIds.has(word.id) && (!query || word.word.includes(query.toLocaleLowerCase()) || word.meanings.some((group) => group.senses.some((sense) => sense.chinese.includes(query)))))
  const count = (bookId: string) => data.wordbookItems.filter((item) => item.wordbookId === bookId).length
  const addFolder = () => { const name = window.prompt('新文件夹名称'); if (name?.trim()) store.createWordbook(name.trim(), selectedId || null) }
  const rename = () => { if (!selected) return; const name = window.prompt('重命名生词本', selected.name); if (name?.trim()) store.updateWordbook(selected.id, { name: name.trim() }) }
  const moveFolder = () => {
    if (!selected) return
    const candidates = data.wordbooks.filter((book) => !ids.has(book.id))
    const name = window.prompt(`移动到哪个文件夹？输入名称，输入“根目录”移到顶层。\n可选：${candidates.map((book) => book.name).join('、')}`, '根目录')
    if (!name) return
    const target = name === '根目录' ? null : candidates.find((book) => book.name === name)?.id
    if (name !== '根目录' && !target) { window.alert('没有找到该文件夹。'); return }
    store.updateWordbook(selected.id, { parentId: target })
  }
  const moveWord = (wordId: string) => {
    if (!selected) return
    const candidates = data.wordbooks.filter((book) => book.id !== selected.id)
    const name = window.prompt(`移动到哪个生词本？\n可选：${candidates.map((book) => book.name).join('、')}`)
    const target = candidates.find((book) => book.name === name)
    if (!target) { if (name) window.alert('没有找到该生词本。'); return }
    store.moveWord(wordId, selected.id, target.id)
  }
  const remove = () => { if (selected && window.confirm(`删除“${selected.name}”及其子文件夹？单词词条不会被删除。`)) { store.deleteWordbook(selected.id); setSelectedId(data.wordbooks.find((book) => book.id !== selected.id)?.id ?? '') } }
  const playWord = async (word: WordEntry) => {
    setPlaybackError('')
    try {
      await ttsProvider.speakWord(word.word, { lang: data.settings.englishAccent, rate: .9, voiceName: data.settings.englishVoice }, data.settings.englishAccent === 'en-GB' ? word.uk.audioUrl : word.us.audioUrl)
    } catch (reason) {
      setPlaybackError(reason instanceof Error ? reason.message : '标准发音播放失败')
    }
  }
  return <div className="page wordbooks-page">
    <div className="page-title"><div><p className="eyebrow">自己的分类方式</p><h1>生词本</h1><p>一个词条可同时出现在多个文件夹中。</p></div><div className="action-row"><button className="button secondary" onClick={() => navigate('import')}><Import size={17} />批量导入</button><button className="button primary" onClick={addFolder}><FolderPlus size={17} />新建文件夹</button></div></div>
    <div className="wordbook-layout">
      <aside className="folder-panel card"><h3>文件夹</h3><FolderTree parentId={null} level={0} data={data} selectedId={selectedId} setSelectedId={setSelectedId} count={count} /></aside>
      <section className="word-list-panel">
        {selected ? <>
          <div className="folder-header"><div><p className="breadcrumb">生词助手 <ChevronRight size={13} /> {selected.name}</p><h2>{selected.name}</h2><p>{words.length} 个单词（含子文件夹）</p></div><div className="action-row"><button className={selected.favorite ? 'icon-button active' : 'icon-button'} onClick={() => store.updateWordbook(selected.id, { favorite: !selected.favorite })} title="收藏整个文件夹"><Star size={18} fill={selected.favorite ? 'currentColor' : 'none'} /></button><button className="button secondary" onClick={() => navigate(`player:${selected.id}`)}><Play size={17} />播放</button><button className="icon-button" onClick={moveFolder} title="移动文件夹"><MoveRight size={18} /></button><button className="icon-button" onClick={rename} title="重命名"><MoreHorizontal size={19} /></button><button className="icon-button danger" onClick={remove} title="删除文件夹"><Trash2 size={18} /></button></div></div>
          {playbackError && <div className="notice error">{playbackError}</div>}
          <div className="list-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前文件夹" /></div>
          <div className="word-list">{words.map((word) => <div className="word-row-wrap" key={word.id}>
            <div className="word-row"><button className={word.favorite ? 'sense-star active' : 'sense-star'} onClick={() => store.toggleWordFavorite(word.id)}><Star size={17} fill={word.favorite ? 'currentColor' : 'none'} /></button><button className="word-main" onClick={() => setExpandedWord(expandedWord === word.id ? null : word.id)}><b>{word.word}</b><span>{word.us.ipa || word.uk.ipa || '暂无音标'}</span></button><span className="pos">{word.meanings.map((group) => group.partOfSpeech).join(' / ') || '待补全'}</span><span className="meaning-summary">{word.meanings.flatMap((group) => group.senses).slice(0, 2).map((sense) => sense.chinese).join('；') || '等待词典补全'}</span><button className="icon-button" onClick={() => void playWord(word)} title="播放"><Play size={16} /></button><button className="icon-button" onClick={() => moveWord(word.id)} title="移动"><MoveRight size={16} /></button><button className="icon-button danger" onClick={() => store.removeWordFromBook(word.id, selected.id)} title="从当前生词本移除"><Trash2 size={16} /></button></div>
            {expandedWord === word.id && <WordDetail entry={word} onFavorite={() => store.toggleWordFavorite(word.id)} onSenseFavorite={(senseId) => store.toggleSenseFavorite(word.id, senseId)} onPlay={() => void playWord(word)} onSaveNote={(note) => store.saveNote(word.id, note)} />}
          </div>)}</div>
          {words.length === 0 && <div className="empty-state"><Folder size={38} /><h3>这里还没有单词</h3><p>从查询页添加，或一次导入一批。</p><button className="button primary" onClick={() => navigate('import')}>批量导入</button></div>}
        </> : <div className="empty-state">请选择一个文件夹</div>}
      </section>
    </div>
  </div>
}

function FolderTree({ parentId, level, data, selectedId, setSelectedId, count }: { parentId: string | null; level: number; data: NonNullable<AppStore['data']>; selectedId: string; setSelectedId: (id: string) => void; count: (id: string) => number }) {
  return <>{data.wordbooks.filter((book) => book.parentId === parentId).map((book) => <div key={book.id}>
    <button className={selectedId === book.id ? 'folder-row active' : 'folder-row'} style={{ paddingLeft: `${12 + level * 18}px` }} onClick={() => setSelectedId(book.id)}><Folder size={17} fill={book.favorite ? 'currentColor' : 'none'} /><span>{book.name}</span><small>{count(book.id)}</small></button>
    <FolderTree parentId={book.id} level={level + 1} data={data} selectedId={selectedId} setSelectedId={setSelectedId} count={count} />
  </div>)}</>
}
