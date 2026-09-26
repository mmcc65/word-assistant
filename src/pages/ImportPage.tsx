import { Check, FileText, Import, LoaderCircle, Upload, X, AlertTriangle } from 'lucide-react'
import { ChangeEvent, useMemo, useState } from 'react'
import { buildImportPreview, importRowToEntry, parseCsv, parsePlainText } from '../domain/importer'
import { mergeWordEntries } from '../domain/merge'
import type { ImportPreviewRow } from '../domain/types'
import { dictionaryProvider } from '../providers/dictionary'
import type { AppStore } from '../state/useAppStore'

const sample = `significant
deteriorate
compelling
controversy
equivalent`

export function ImportPage({ store }: { store: AppStore }) {
  const data = store.data!
  const [text, setText] = useState(sample)
  const [sourceName, setSourceName] = useState('直接粘贴')
  const [preview, setPreview] = useState<ImportPreviewRow[]>([])
  const [bookId, setBookId] = useState(data.wordbooks.find((book) => book.id === 'wb-reading')?.id ?? data.wordbooks[0]?.id ?? '')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [failures, setFailures] = useState<Array<{ word: string; reason: string }>>([])
  const [done, setDone] = useState('')
  const stats = useMemo(() => ({
    total: preview.length,
    ready: preview.filter((row) => row.status === 'ready').length,
    existing: preview.filter((row) => row.status === 'existing').length,
    invalid: preview.filter((row) => row.status === 'invalid').length,
  }), [preview])
  const analyze = () => {
    const rows = sourceName.toLocaleLowerCase().endsWith('.csv') ? parseCsv(text) : parsePlainText(text)
    setPreview(buildImportPreview(rows, data.words.map((word) => word.word)))
    setDone(''); setFailures([])
  }
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setText(content); setSourceName(file.name); setPreview([]); setDone('')
  }
  const runImport = async () => {
    const selected = preview.filter((row) => row.status === 'ready' || (!skipDuplicates && row.status === 'existing'))
    setProgress({ current: 0, total: selected.length }); setFailures([]); setDone('')
    let succeeded = 0
    const failed: Array<{ word: string; reason: string }> = []
    for (let index = 0; index < selected.length; index += 1) {
      const row = selected[index]
      setProgress({ current: index + 1, total: selected.length })
      try {
        const imported = importRowToEntry(row)
        let complete = imported
        if (!row.meaning) {
          const dictionary = await dictionaryProvider.lookup(row.word)
          if (!dictionary) throw new Error('词典没有返回结果')
          complete = mergeWordEntries(dictionary, imported)
        }
        store.addWord(complete, bookId)
        succeeded += 1
      } catch (error) {
        failed.push({ word: row.word, reason: error instanceof Error ? error.message : '处理失败' })
      }
    }
    setFailures(failed); setProgress(null); setDone(`已完成：成功 ${succeeded} 个，失败 ${failed.length} 个。失败项可稍后重试。`)
  }
  return <div className="page narrow-page">
    <div className="page-title"><div><p className="eyebrow">先预览，再写入</p><h1>批量导入</h1><p>自动清理、去重并补全只有单词的条目。</p></div></div>
    <div className="import-card card">
      <div className="import-tabs"><button className="active"><Import size={17} />粘贴单词</button><label><Upload size={17} />TXT / CSV<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(event) => void readFile(event)} /></label></div>
      <div className="source-label"><FileText size={16} />{sourceName}</div>
      <textarea className="import-textarea" value={text} onChange={(event) => { setText(event.target.value); setSourceName('直接粘贴'); setPreview([]) }} placeholder="每行一个单词，或选择 TXT / CSV 文件" />
      <div className="import-actions"><label>目标生词本<select value={bookId} onChange={(event) => setBookId(event.target.value)}>{data.wordbooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label><button className="button primary" onClick={analyze} disabled={!text.trim()}>生成导入预览</button></div>
    </div>
    {preview.length > 0 && <section className="preview-section">
      <div className="summary-card"><div><span>检测到</span><strong>{stats.total}</strong><small>词</small></div><div className="success"><Check /><span>可导入</span><strong>{stats.ready}</strong></div><div><span>已存在</span><strong>{stats.existing}</strong></div><div className="warning"><AlertTriangle /><span>无法识别</span><strong>{stats.invalid}</strong></div></div>
      <label className="checkbox"><input type="checkbox" checked={skipDuplicates} onChange={(event) => setSkipDuplicates(event.target.checked)} />自动跳过重复项</label>
      <div className="preview-table card"><div className="table-header"><span>状态</span><span>单词</span><span>说明</span></div>{preview.map((row) => <div className="table-row" key={`${row.rowNumber}-${row.word}`}><span className={`import-status ${row.status}`}>{row.status === 'ready' ? <Check /> : row.status === 'existing' ? '○' : <X />}</span><b>{row.word || '空白'}</b><span>{row.reason || (row.meaning ? '使用文件内结构化资料' : '将自动补全完整词条')}</span></div>)}</div>
      {progress && <div className="progress-card card"><LoaderCircle className="spin" /><div className="grow"><b>正在处理 {progress.current} / {progress.total}</b><div className="progress"><i style={{ width: `${progress.total ? progress.current / progress.total * 100 : 0}%` }} /></div><span>正在查询词典并安全合并……</span></div></div>}
      {done && <div className="notice success">{done}</div>}
      {failures.length > 0 && <div className="notice error"><b>失败单词</b>{failures.map((item) => <div key={item.word}>{item.word}：{item.reason}</div>)}</div>}
      <div className="confirm-bar"><span>导入不会覆盖个人备注，也不会删除已有义项。</span><button className="button primary" onClick={() => void runImport()} disabled={Boolean(progress) || stats.ready + (skipDuplicates ? 0 : stats.existing) === 0}>确认导入 {stats.ready + (skipDuplicates ? 0 : stats.existing)} 词</button></div>
    </section>}
  </div>
}
