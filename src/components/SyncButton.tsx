import { Cloud, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { AppStore } from '../state/useAppStore'
import { syncData } from '../sync/supabase'

export function SyncButton({ store, compact = false }: { store: AppStore; compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const run = async () => {
    if (!store.data) return
    setStatus('syncing')
    setMessage('正在同步……')
    try {
      const next = await syncData(store.data)
      store.replaceData(next)
      setStatus('done')
      setMessage('同步完成 · 刚刚')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '同步失败')
    }
  }
  return <div className={compact ? 'sync-control compact' : 'sync-control'}>
    <button className="button secondary" onClick={() => void run()} disabled={status === 'syncing'}>{status === 'syncing' ? <RefreshCw className="spin" size={18} /> : <Cloud size={18} />}{status === 'syncing' ? '正在同步' : status === 'error' ? '重试同步' : '同步'}</button>
    {message && <span className={status === 'error' ? 'status error' : 'status'}>{message}</span>}
  </div>
}
