import { BookOpen, Cloud, Import, Layers3, Plus, Play, Star } from 'lucide-react'
import type { AppStore } from '../state/useAppStore'
import { SyncButton } from '../components/SyncButton'
import { collectWordbookWordIds } from '../domain/operations'

export function HomePage({ store, navigate }: { store: AppStore; navigate: (page: string) => void }) {
  const data = store.data!
  const today = new Date().toISOString().slice(0, 10)
  const recent = [...data.wordbooks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
  const count = (bookId: string) => collectWordbookWordIds(data, bookId).size
  const position = data.playbackPosition
  const lastBook = data.wordbooks.find((book) => book.id === position.wordbookId)
  return <div className="page home-page">
    <section className="welcome">
      <div><p className="eyebrow">今天也从一个词开始</p><h1>晚上好</h1><p>快速收集，随时听懂自己的生词。</p></div>
      <div className="date-chip">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</div>
    </section>
    <section className="continue-card card">
      <div className="continue-icon"><Play fill="currentColor" /></div>
      <div className="grow"><p className="eyebrow">继续播放</p><h2>{lastBook?.name ?? '还没有播放记录'}</h2><p className="muted">{position.total ? `${Math.min(position.wordIndex + 1, position.total)} / ${position.total}` : '选一个生词本开始'}</p></div>
      <button className="button primary" onClick={() => navigate('player')}><Play size={17} />继续播放</button>
    </section>
    <div className="home-grid">
      <section>
        <div className="section-heading"><div><p className="eyebrow">一步直达</p><h2>快捷功能</h2></div></div>
        <div className="quick-grid">
          <button className="quick-card" onClick={() => navigate('search')}><Plus /><span>添加单词</span><small>查询后加入</small></button>
          <button className="quick-card warm" onClick={() => navigate('import')}><Import /><span>批量导入</span><small>粘贴 / TXT / CSV</small></button>
          <button className="quick-card flashcard-quick" onClick={() => navigate('flashcards')}><Layers3 /><span>单词卡</span><small>翻卡与间隔复习</small></button>
          <div className="quick-card sync-card"><Cloud /><span>云端同步</span><SyncButton store={store} compact /></div>
        </div>
      </section>
      <section>
        <div className="section-heading"><div><p className="eyebrow">最近打开</p><h2>最近生词本</h2></div><button className="text-button" onClick={() => navigate('wordbooks')}>查看全部</button></div>
        <div className="recent-list">{recent.map((book) => <button key={book.id} onClick={() => navigate(`wordbooks:${book.id}`)}><span className="book-icon"><BookOpen size={18} /></span><span className="grow"><b>{book.name}</b><small>{count(book.id)} 个单词</small></span>{book.favorite && <Star size={16} fill="currentColor" />}</button>)}</div>
      </section>
    </div>
    <section className="stats-row">
      <div><span>生词总数</span><strong>{data.words.length}</strong></div>
      <div><span>收藏数量</span><strong>{data.words.filter((word) => word.favorite).length}</strong></div>
      <div><span>今日新增</span><strong>{data.words.filter((word) => word.createdAt.startsWith(today)).length}</strong></div>
    </section>
  </div>
}
