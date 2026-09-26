import { Bookmark, BookPlus, Play, Star } from 'lucide-react'
import { useState } from 'react'
import type { WordEntry } from '../domain/types'

interface Props {
  entry: WordEntry
  onFavorite: () => void
  onSenseFavorite: (senseId: string) => void
  onAdd?: () => void
  onPlay: () => void
  onSaveNote?: (note: string) => void
  alreadyAdded?: boolean
}

export function WordDetail({ entry, onFavorite, onSenseFavorite, onAdd, onPlay, onSaveNote, alreadyAdded }: Props) {
  const [showOther, setShowOther] = useState(false)
  const [note, setNote] = useState(entry.note)
  return <article className="word-detail card">
    <header className="word-hero">
      <div>
        <div className="eyebrow">{entry.tags.join(' · ') || '词典条目'}</div>
        <h2>{entry.word}</h2>
        <div className="phonetics"><span>英 {entry.uk.ipa || '—'}</span><span>美 {entry.us.ipa || '—'}</span></div>
      </div>
      <div className="action-row">
        <button className={entry.favorite ? 'icon-button active' : 'icon-button'} onClick={onFavorite} title="收藏单词"><Star size={19} fill={entry.favorite ? 'currentColor' : 'none'} /></button>
        {onAdd && <button className="button secondary" onClick={onAdd} disabled={alreadyAdded}><BookPlus size={18} />{alreadyAdded ? '已在生词本' : '加入生词本'}</button>}
        <button className="button primary" onClick={onPlay}><Play size={17} />播放</button>
      </div>
    </header>
    {entry.meanings.map((group) => <section className="meaning-group" key={group.partOfSpeech}>
      <h3>{group.partOfSpeech}</h3>
      {group.senses.filter((sense) => showOther || sense.frequency === 'common').map((sense, index) => <div className="sense" key={sense.id}>
        <button className={sense.favorite ? 'sense-star active' : 'sense-star'} onClick={() => onSenseFavorite(sense.id)} title="收藏该义项"><Bookmark size={16} fill={sense.favorite ? 'currentColor' : 'none'} /></button>
        <div className="sense-body">
          <div className="sense-title"><span className="sense-index">{index + 1}</span><strong>{sense.chinese}</strong>{sense.frequency !== 'common' && <span className="tag">{frequencyLabel[sense.frequency]}</span>}{sense.tags.map((tag) => <span className="tag accent" key={tag}>{tag}</span>)}</div>
          <p className="english-definition">{sense.english}</p>
          {sense.usage && <p className="muted">用法：{sense.usage}</p>}
          {sense.phrases.length > 0 && <div className="phrase-grid">{sense.phrases.map((phrase) => <div key={phrase.id}><b>{phrase.english}</b><span>{phrase.chinese}</span></div>)}</div>}
          {sense.examples.map((example) => <blockquote key={example.id}><p>{example.english}</p><p>{example.chinese}</p><small>{example.representative ? '代表例句' : '例句'} · {example.source}</small></blockquote>)}
        </div>
      </div>)}
    </section>)}
    {entry.meanings.some((group) => group.senses.some((sense) => sense.frequency !== 'common')) && <button className="text-button" onClick={() => setShowOther((value) => !value)}>{showOther ? '收起其他义项' : '展开其他义项（不会丢失）'}</button>}
    {onSaveNote && <section className="note-box">
      <label htmlFor={`note-${entry.id}`}>个人备注</label>
      <textarea id={`note-${entry.id}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：9月25日阅读遇到" />
      <button className="button secondary compact" onClick={() => onSaveNote(note)}>保存备注</button>
    </section>}
    <footer className="sources">来源：{entry.sources.join('；')}</footer>
  </article>
}

const frequencyLabel = { common: '常用', 'less-common': '较少见', formal: '正式', technical: '专业', archaic: '旧式' }
