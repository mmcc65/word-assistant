import { Cloud, Database, Download, FolderOpen, HardDrive, LogIn, LogOut, Play, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { nowIso } from '../domain/defaults'
import { ttsProvider } from '../providers/tts'
import { estimateStorage, exportData } from '../storage/repository'
import { migrateData } from '../storage/migrations'
import { currentUser, isSyncConfigured, signIn, signOut, signUp } from '../sync/supabase'
import type { AppStore } from '../state/useAppStore'
import { SyncButton } from '../components/SyncButton'
import { desktopRequest, isWindowsDesktop } from '../platform/desktopBridge'
import { updateManifests } from '../platform/releaseConfig'

const APP_VERSION = '1.1.2'
const bytes = (value: number) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`

export function SettingsPage({ store }: { store: AppStore }) {
  const data = store.data!
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [storage, setStorage] = useState({ textBytes: 0, persistentAudio: 0, temporaryAudio: 0, totalUsage: 0, quota: 0 })
  const [update, setUpdate] = useState('')
  const [desktopCachePath, setDesktopCachePath] = useState('正在读取……')
  const [desktopCacheMessage, setDesktopCacheMessage] = useState('')
  const [desktopRestartRequired, setDesktopRestartRequired] = useState(false)
  const englishVoices = useMemo(() => voices.filter((voice) => voice.lang.toLowerCase().startsWith('en')), [voices])
  const matchingEnglishVoices = useMemo(() => {
    const locale = data.settings.englishAccent.toLowerCase()
    const exact = englishVoices.filter((voice) => voice.lang.replaceAll('_', '-').toLowerCase() === locale)
    return exact.length ? exact : englishVoices
  }, [data.settings.englishAccent, englishVoices])
  const chineseVoices = useMemo(() => voices.filter((voice) => voice.lang.toLowerCase().startsWith('zh')), [voices])
  useEffect(() => {
    void currentUser().then(setUser)
    void estimateStorage(data).then(setStorage)
    const refresh = () => setVoices(ttsProvider.voices())
    refresh(); globalThis.speechSynthesis?.addEventListener?.('voiceschanged', refresh)
    return () => globalThis.speechSynthesis?.removeEventListener?.('voiceschanged', refresh)
  }, [data])
  useEffect(() => {
    if (!isWindowsDesktop) return
    void desktopRequest('getCachePath').then((result) => {
      if (result.cachePath) setDesktopCachePath(result.cachePath)
    }).catch((error) => setDesktopCacheMessage(error instanceof Error ? error.message : '无法读取缓存位置'))
  }, [])
  const setSetting = <K extends keyof typeof data.settings>(key: K, value: (typeof data.settings)[K]) => store.commit((current) => ({ ...current, settings: { ...current.settings, [key]: value }, dirty: true, updatedAt: nowIso() }))
  const setEnglishAccent = (englishAccent: 'en-US' | 'en-GB') => store.commit((current) => ({
    ...current,
    settings: { ...current.settings, englishAccent, englishVoice: '' },
    dirty: true,
    updatedAt: nowIso(),
  }))
  const authenticate = async (mode: 'login' | 'signup') => {
    setAuthMessage('处理中……')
    try { if (mode === 'login') await signIn(email, password); else await signUp(email, password); setUser(await currentUser()); setAuthMessage(mode === 'login' ? '登录成功' : '注册请求已提交；若启用了邮箱确认，请查收邮件。') }
    catch (error) { setAuthMessage(error instanceof Error ? error.message : '认证失败') }
  }
  const checkUpdate = async () => {
    setUpdate('正在检查更新……')
    try {
      if (isWindowsDesktop) {
        const result = await desktopRequest('checkUpdate', { manifestUrls: updateManifests('desktop'), userInitiated: true })
        if (result.updateStatus === 'current') setUpdate(`已是最新版本 ${result.version || APP_VERSION}`)
        else if (result.updateStatus === 'cancelled') setUpdate('已暂缓本次更新')
        else if (result.updateStatus === 'installing') setUpdate('更新包已校验，正在重启安装……')
        return
      }
      if (window.WordAssistantAndroid?.checkForUpdate) {
        window.WordAssistantAndroid.checkForUpdate(JSON.stringify(updateManifests('mobile')), true)
        setUpdate('已交给手机更新器检查；结果会在弹窗中显示。')
        return
      }
      const path = (import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined) || '/version.json'
      const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`更新服务响应 ${response.status}`)
      const manifest = await response.json() as { version: string; notes?: string[]; downloadUrl?: string }
      if (manifest.version === APP_VERSION) setUpdate(`已是最新版本 ${APP_VERSION}`)
      else setUpdate(`发现版本 ${manifest.version}：${manifest.notes?.join('；') || '有可用更新'}${manifest.downloadUrl ? `。下载地址：${manifest.downloadUrl}` : '。PWA 将在重新打开时更新。'}`)
    } catch (error) { setUpdate(`检查失败：${error instanceof Error ? error.message : '未知错误'}。旧版本仍可继续使用。`) }
  }
  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !window.confirm('从备份恢复会替换当前本地数据。确认继续？')) return
    try { const parsed = JSON.parse(await file.text()) as { data?: unknown }; store.replaceData(migrateData((parsed.data ?? parsed) as Parameters<typeof migrateData>[0])); setAuthMessage('备份恢复成功') }
    catch (error) { setAuthMessage(`恢复失败：${error instanceof Error ? error.message : '文件格式错误'}`) }
  }
  return <div className="page settings-page">
    <div className="page-title"><div><p className="eyebrow">设备与数据</p><h1>设置</h1><p>本地数据始终优先保存，云端功能可以稍后配置。</p></div></div>
    <div className="settings-grid">
      <section className="settings-section card">
        <div className="settings-title"><Cloud /><div><h2>账户与同步</h2><p>{user ? `已登录：${user.email}` : isSyncConfigured ? '尚未登录' : '本机尚未配置云服务'}</p></div></div>
        {!user && <div className="auth-form"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码（至少 6 位）" /><div className="action-row"><button className="button primary" onClick={() => void authenticate('login')} disabled={!isSyncConfigured}><LogIn size={17} />登录</button><button className="button secondary" onClick={() => void authenticate('signup')} disabled={!isSyncConfigured}>注册</button></div></div>}
        {user && <div className="action-row"><SyncButton store={store} /><button className="button secondary" onClick={() => void signOut().then(() => setUser(null))}><LogOut size={17} />退出</button></div>}
        <dl className="info-list"><div><dt>自动同步</dt><dd><input type="checkbox" checked={data.settings.autoSync} onChange={(event) => setSetting('autoSync', event.target.checked)} /></dd></div><div><dt>上次同步</dt><dd>{data.settings.lastSyncAt ? new Date(data.settings.lastSyncAt).toLocaleString('zh-CN') : '尚未同步'}</dd></div><div><dt>状态</dt><dd>{data.dirty ? '有本地修改待同步' : '本地与云端已对齐'}</dd></div></dl>
        {authMessage && <div className="notice">{authMessage}</div>}
        {!isSyncConfigured && <p className="hint">复制 `.env.example` 为 `.env.local` 并填写 Supabase URL 与 Publishable Key 后启用。不要填写 service_role。</p>}
      </section>
      <section className="settings-section card">
        <div className="settings-title"><Play /><div><h2>语音</h2><p>{ttsProvider.name}，中英文分开选择</p></div></div>
        <label className="field">英文口音<select value={data.settings.englishAccent} onChange={(event) => setEnglishAccent(event.target.value as 'en-US' | 'en-GB')}><option value="en-US">美式英语</option><option value="en-GB">英式英语</option></select></label>
        <label className="field">英文声音<select value={data.settings.englishVoice} onChange={(event) => setSetting('englishVoice', event.target.value)}><option value="">自动选择当前口音的最佳声音</option>{matchingEnglishVoices.map((voice) => <option value={voice.name} key={voice.name}>{voice.name} · {voice.lang}</option>)}</select></label>
        <label className="field">中文声音<select value={data.settings.chineseVoice} onChange={(event) => setSetting('chineseVoice', event.target.value)}><option value="">跟随系统</option>{chineseVoices.map((voice) => <option value={voice.name} key={voice.name}>{voice.name} · {voice.lang}</option>)}</select></label>
        <div className="action-row"><button className="button secondary" onClick={() => void ttsProvider.speakWord('significant', { lang: data.settings.englishAccent, rate: 1, voiceName: data.settings.englishVoice }).catch((reason) => setAuthMessage(reason instanceof Error ? reason.message : '标准发音播放失败'))}>试听标准单词发音</button><button className="button secondary" onClick={() => void ttsProvider.speak('这是中文语音试听。', { lang: 'zh-CN', rate: 1, voiceName: data.settings.chineseVoice })}>试听中文</button></div>
        <p className="hint">单词使用词典标准英式/美式录音；拼写使用这里选择的系统英文声音逐字母播放；短语和例句使用完整英文语音。</p>
      </section>
      <section className="settings-section card">
        <div className="settings-title"><HardDrive /><div><h2>存储与空间</h2><p>取消收藏只清理音频，不删除文字词条</p></div></div>
        <dl className="info-list"><div><dt>文字 / 词典数据</dt><dd>{bytes(storage.textBytes)}</dd></div><div><dt>收藏音频</dt><dd>{bytes(storage.persistentAudio)}</dd></div><div><dt>临时音频缓存</dt><dd>{bytes(storage.temporaryAudio)}</dd></div><div><dt>浏览器报告总占用</dt><dd>{bytes(storage.totalUsage)}</dd></div></dl>
        <button className="button secondary" onClick={store.cleanTemporaryCache}>清除临时缓存</button>
      </section>
      {isWindowsDesktop && <section className="settings-section card">
        <div className="settings-title"><FolderOpen /><div><h2>电脑版缓存位置</h2><p>只影响网页资源和临时文件，不会移动或删除生词数据</p></div></div>
        <div className="desktop-cache-path">{desktopCachePath}</div>
        <div className="action-row">
          <button className="button secondary" onClick={() => {
            setDesktopCacheMessage('请选择新的缓存文件夹……')
            void desktopRequest('chooseCachePath').then((result) => {
              if (result.cancelled) { setDesktopCacheMessage('已取消更改'); return }
              if (result.cachePath) setDesktopCachePath(result.cachePath)
              setDesktopRestartRequired(Boolean(result.restartRequired))
              setDesktopCacheMessage(result.restartRequired ? '新位置已保存，重启应用后生效。' : '缓存位置未改变。')
            }).catch((error) => setDesktopCacheMessage(error instanceof Error ? error.message : '更改失败'))
          }}><FolderOpen size={17} />更改位置</button>
          {desktopRestartRequired && <button className="button primary" onClick={() => void desktopRequest('restart')}><RotateCcw size={17} />立即重启</button>}
        </div>
        {desktopCacheMessage && <div className="notice">{desktopCacheMessage}</div>}
      </section>}
      <section className="settings-section card">
        <div className="settings-title"><Database /><div><h2>备份与恢复</h2><p>导出包含词条、生词本、收藏、备注和设置</p></div></div>
        <div className="action-row"><button className="button primary" onClick={() => exportData(data)}><Download size={17} />导出我的数据</button><label className="button secondary"><Upload size={17} />恢复备份<input hidden type="file" accept="application/json,.json" onChange={(event) => void restore(event)} /></label></div>
      </section>
      <section className="settings-section card wide">
        <div className="settings-title"><RefreshCw /><div><h2>检查更新</h2><p>当前版本 {APP_VERSION}</p></div></div>
        <button className="button primary" onClick={() => void checkUpdate()}><RefreshCw size={17} />检查更新</button>
        {update && <div className="notice">{update}</div>}
        <p className="hint">Windows 版会自动下载、校验并重启安装；Android 版下载后会打开系统安装确认页。网页与 HarmonyOS 版仍按各自平台方式更新。</p>
      </section>
    </div>
  </div>
}
