import { BookOpen, Home, Import, Menu, Play, Search, Settings, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { PlayerPage } from './pages/PlayerPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { WordbooksPage } from './pages/WordbooksPage'
import { useAppStore } from './state/useAppStore'

const nav = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'wordbooks', label: '生词本', icon: BookOpen },
  { id: 'search', label: '查询', icon: Search },
  { id: 'player', label: '播放', icon: Play },
  { id: 'import', label: '导入', icon: Import, desktopOnly: true },
  { id: 'settings', label: '设置', icon: Settings },
]

export default function App() {
  const store = useAppStore()
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = (next: string) => { location.hash = next; setRoute(next); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  useEffect(() => { const update = () => setRoute(location.hash.slice(1) || 'home'); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update) }, [])
  useEffect(() => {
    const theme = store.data?.settings.theme
    if (theme) document.documentElement.dataset.theme = theme
  }, [store.data?.settings.theme])
  if (store.error) return <main className="fatal"><h1>无法打开本地数据</h1><p>{store.error}</p><button className="button primary" onClick={() => location.reload()}>重试</button></main>
  if (!store.data) return <main className="loading"><div className="brand-mark">词</div><p>正在安全读取本地生词……</p></main>
  const [page, param] = route.split(':')
  return <div className="app-shell">
    <header className="mobile-header"><button className="icon-button" onClick={() => setSidebarOpen(true)}><Menu /></button><div className="mobile-brand"><span>词</span>生词助手</div></header>
    <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><span className="brand-mark">词</span><div><b>生词助手</b><small>多场景 · 私人生词库</small></div><button className="close-sidebar" onClick={() => setSidebarOpen(false)}><X /></button></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={`${page === item.id ? 'active' : ''} ${item.desktopOnly ? 'desktop-only-nav' : ''}`} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label}</span></button> })}</nav>
      <div className="sidebar-status"><i /><div><b>本地优先</b><small>{store.data.dirty ? '有修改待同步' : '数据已安全保存'}</small></div></div>
    </aside>
    {sidebarOpen && <button className="backdrop" onClick={() => setSidebarOpen(false)} aria-label="关闭导航" />}
    <main className="content">
      {page === 'home' && <HomePage store={store} navigate={navigate} />}
      {page === 'wordbooks' && <WordbooksPage key={param || 'all'} store={store} initialId={param} navigate={navigate} />}
      {page === 'search' && <SearchPage store={store} />}
      {page === 'player' && <PlayerPage key={param || 'default'} store={store} initialBookId={param} />}
      {page === 'import' && <ImportPage store={store} />}
      {page === 'settings' && <SettingsPage store={store} />}
      {!nav.some((item) => item.id === page) && <HomePage store={store} navigate={navigate} />}
    </main>
    <nav className="bottom-nav">{nav.filter((item) => !item.desktopOnly).map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label}</span></button> })}</nav>
  </div>
}
