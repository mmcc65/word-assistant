import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'docs', 'images')
const playerOnly = process.argv.includes('--player-only')
const viewportWidth = playerOnly ? 1600 : 1800
const viewportHeight = playerOnly ? 900 : 1200
const siteUrl = 'http://127.0.0.1:4173'
const debugPort = 9333
const chromeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const chromePath = chromeCandidates.find(existsSync)
if (!chromePath) throw new Error('没有找到 Edge 或 Chrome。')

const now = new Date('2026-09-26T12:00:00.000Z').toISOString()
const vocabulary = [
  ['compelling', '令人信服的；引人入胜的', 'adj.', 'kəmˈpelɪŋ'],
  ['significant', '重要的；显著的', 'adj.', 'sɪɡˈnɪfɪkənt'],
  ['address', '处理；地址；演说', 'v. / n.', 'əˈdres'],
  ['equivalent', '相等的；等价物', 'adj. / n.', 'ɪˈkwɪvələnt'],
  ['controversy', '争议；争论', 'n.', 'ˈkɒntrəvɜːsi'],
  ['approach', '方法；接近', 'n. / v.', 'əˈprəʊtʃ'],
  ['essential', '必不可少的', 'adj.', 'ɪˈsenʃl'],
  ['maintain', '维持；坚持认为', 'v.', 'meɪnˈteɪn'],
  ['potential', '潜在的；潜力', 'adj. / n.', 'pəˈtenʃl'],
  ['establish', '建立；确立', 'v.', 'ɪˈstæblɪʃ'],
  ['consequence', '结果；后果', 'n.', 'ˈkɒnsɪkwəns'],
  ['indicate', '表明；指出', 'v.', 'ˈɪndɪkeɪt'],
  ['individual', '个人；个体的', 'n. / adj.', 'ˌɪndɪˈvɪdʒuəl'],
  ['available', '可获得的；有空的', 'adj.', 'əˈveɪləbl'],
  ['specific', '具体的；特定的', 'adj.', 'spəˈsɪfɪk'],
  ['environment', '环境', 'n.', 'ɪnˈvaɪrənmənt'],
  ['influence', '影响', 'n. / v.', 'ˈɪnfluəns'],
  ['require', '需要；要求', 'v.', 'rɪˈkwaɪə'],
  ['respond', '回应；作出反应', 'v.', 'rɪˈspɒnd'],
  ['benefit', '益处；受益', 'n. / v.', 'ˈbenɪfɪt'],
  ['resource', '资源', 'n.', 'rɪˈsɔːs'],
  ['feature', '特点；以……为特色', 'n. / v.', 'ˈfiːtʃə'],
  ['complex', '复杂的；综合体', 'adj. / n.', 'ˈkɒmpleks'],
  ['achieve', '实现；取得', 'v.', 'əˈtʃiːv'],
  ['assume', '假定；承担', 'v.', 'əˈsjuːm'],
]

function word([text, chinese, partOfSpeech, ipa], index) {
  const detailed = text === 'compelling'
  return {
    id: `word-${index + 1}`,
    word: text,
    normalizedWord: text,
    uk: { ipa },
    us: { ipa },
    inflections: [],
    tags: index < 6 ? ['CET-6', '高频'] : ['CET-6'],
    favorite: index === 0 || index === 2,
    meanings: [{
      partOfSpeech,
      senses: [{
        id: `sense-${index + 1}`,
        chinese,
        english: detailed ? 'convincing and powerful enough to hold attention' : chinese,
        frequency: index < 10 ? 'common' : 'less-common',
        tags: [],
        favorite: detailed,
        examples: detailed ? [{ id: 'example-1', english: 'She presented compelling evidence to support her claim.', chinese: '她提出了令人信服的证据来支持自己的主张。', source: '内置词典', representative: true }] : [],
        phrases: detailed ? [{ id: 'phrase-1', english: 'compelling evidence', chinese: '有力的证据', kind: 'collocation' }, { id: 'phrase-2', english: 'a compelling argument', chinese: '令人信服的论点', kind: 'collocation' }] : [],
      }],
    }],
    note: detailed ? '重点掌握：常用于形容证据、理由和故事。' : '',
    sources: ['内置离线词典'],
    createdAt: now,
    updatedAt: now,
  }
}

const rules = Object.fromEntries(['word', 'spelling', 'partOfSpeechMeaning', 'exampleEnglish', 'exampleChinese', 'phraseEnglish', 'phraseChinese'].map((type) => [type, { enabled: true, repeats: 1, rate: type === 'spelling' ? 0.7 : 1, gapSeconds: type.includes('English') ? 0.5 : 1 }]))
const words = vocabulary.map(word)
const fixture = {
  schemaVersion: 4,
  words,
  wordbooks: [
    { id: 'wb-main', name: '我的生词', parentId: null, favorite: false, createdAt: now, updatedAt: now },
    { id: 'wb-focus', name: '今日重点', parentId: 'wb-main', favorite: true, createdAt: now, updatedAt: now },
    { id: 'wb-reading', name: '阅读积累', parentId: 'wb-main', favorite: false, createdAt: now, updatedAt: now },
    { id: 'wb-errors', name: '易错词', parentId: 'wb-main', favorite: false, createdAt: now, updatedAt: now },
  ],
  wordbookItems: words.map((entry, index) => ({ id: `item-${index + 1}`, wordbookId: index < 5 ? 'wb-focus' : index % 3 === 0 ? 'wb-errors' : 'wb-reading', wordId: entry.id, createdAt: now, updatedAt: now })),
  presets: [{ id: 'preset-cycling', name: '骑车模式', builtIn: true, senseScope: 'all', rules, updatedAt: now }],
  playbackPosition: { wordbookId: 'wb-main', wordIndex: 0, total: words.length, presetId: 'preset-cycling', updatedAt: now },
  audioCache: [],
  flashcardProgress: [{ wordId: 'word-2', level: 3, streak: 3, reviewCount: 5, lastRating: 'known', lastReviewedAt: now, nextReviewAt: '2026-10-03T12:00:00.000Z', updatedAt: now }],
  settings: { theme: 'light', englishVoice: '', chineseVoice: '', englishAccent: 'en-US', activePresetId: 'preset-cycling', autoSync: false },
  tombstones: [],
  dirty: false,
  updatedAt: now,
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
  }
  async open() {
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const request = this.pending.get(message.id)
      if (!request) return
      this.pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
  }
  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
async function waitForUrl(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response }
    catch { /* server is still starting */ }
    await wait(250)
  }
  throw new Error(`等待服务超时：${url}`)
}

const profile = join(tmpdir(), `word-assistant-readme-${Date.now()}`)
await mkdir(output, { recursive: true })
const preview = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4173'], { cwd: root, stdio: 'ignore' })
let chrome
let cdp
try {
  await waitForUrl(siteUrl)
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--window-size=${viewportWidth},${viewportHeight}`, 'about:blank'], { stdio: 'ignore' })
  await waitForUrl(`http://127.0.0.1:${debugPort}/json/version`)
  // Start on a static file so the app cannot write its empty initial state over
  // the screenshot fixture before it is seeded.
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${siteUrl}/manifest.webmanifest`)}`, { method: 'PUT' })
  const target = await targetResponse.json()
  cdp = new CdpClient(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false })
  await wait(1200)

  const seedExpression = `new Promise((resolve, reject) => { const request = indexedDB.open('cet6-word-assistant', 2); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('app-state')) request.result.createObjectStore('app-state'); if (!request.result.objectStoreNames.contains('offline-audio')) { const audio = request.result.createObjectStore('offline-audio', { keyPath: 'url' }); audio.createIndex('wordbookIds', 'wordbookIds', { multiEntry: true }) } }; request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const transaction = db.transaction('app-state', 'readwrite'); transaction.objectStore('app-state').put(${JSON.stringify(fixture)}, 'current'); transaction.oncomplete = () => { db.close(); resolve(true) }; transaction.onerror = () => reject(transaction.error) } })`
  await cdp.send('Runtime.evaluate', { expression: seedExpression, awaitPromise: true, returnByValue: true })
  await cdp.send('Page.navigate', { url: siteUrl })
  await wait(1200)

  const evaluate = (expression) => cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const navigate = async (hash) => {
    await cdp.send('Page.navigate', { url: `${siteUrl}/#${hash}` })
    await wait(1100)
    await evaluate("window.scrollTo(0, 0); document.documentElement.dataset.theme='light'; document.body.style.zoom='0.92'; true")
    await wait(250)
  }
  const capture = async (name) => {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
    await writeFile(join(output, name), Buffer.from(result.data, 'base64'))
  }

  if (!playerOnly) {
    await navigate('home')
    await capture('home.png')

    await navigate('flashcards')
    await evaluate(`(() => { const checks = [...document.querySelectorAll('.flashcard-check input')]; if (checks[2]?.checked) checks[2].click(); const select = document.querySelector('.flashcard-toolbar select'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, 'wb-focus'); select.dispatchEvent(new Event('change', { bubbles: true })); if (checks[1]?.checked) checks[1].click(); return true })()`)
    await wait(500)
    await evaluate("document.querySelector('.study-card')?.click(); true")
    await wait(350)
    await evaluate("document.querySelector('.notice.error')?.remove(); true")
    await capture('flashcards.png')

    await navigate('wordbooks')
    await evaluate("window.scrollTo(0, document.documentElement.scrollHeight); true")
    await wait(500)
    await capture('wordbooks.png')

    await navigate('search')
    await evaluate(`(() => { const input = document.querySelector('.search-form input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'issue'); input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.search-form button')?.click(); return true })()`)
    await wait(1300)
    await capture('search.png')
  }

  await navigate('player')
  await capture('player.png')
} finally {
  try { await cdp?.send('Browser.close') } catch { /* browser may already be closed */ }
  await wait(800)
  cdp?.close()
  chrome?.kill()
  preview.kill()
  await wait(800)
  try { await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 500 }) } catch { /* profile is disposable */ }
}

console.log(`README images generated in ${output}`)
