# 生词助手第一版架构

## 决策摘要

第一版采用“响应式 PWA + 本地优先数据层 + 可选云同步 + 原生能力桥接”的结构。这样 Windows、HarmonyOS 4.2 手机和 HarmonyOS 6 平板共享 UI、领域模型、导入、查询与播放队列逻辑，同时把后台音频、系统文件和安装更新等平台差异隔离在桥接层。

当前仓库已验证共享 Web/PWA、Windows 自包含桌面包和 Android APK 构建。HarmonyOS HAP 仍需要 DevEco Studio、HarmonyOS SDK、签名和目标平板完成最终验证。

## 技术栈

- React + TypeScript + Vite：响应式单页应用。
- IndexedDB：浏览器/PWA 的本地持久化，关键写操作先落本地。
- Service Worker：应用壳离线、词典响应临时缓存和可提示更新。
- Web Speech API：零配置 TTS 回退方案；自然度取决于设备可用语音。
- 可选 Neural TTS 代理：`TtsProvider` 可接 Azure Neural TTS 等服务，密钥只保存在服务端。
- Supabase Auth + Postgres：可选的私人账户和三端同步；未配置时完全不影响本地使用。
- Vitest：领域逻辑和迁移自动测试。

## 共享分层

```text
React 响应式 UI
  ├─ 查询 / 生词本 / 导入 / 播放 / 设置
  ├─ 应用服务（合并、收藏、同步、备份）
  ├─ 领域层（WordEntry、Sense、Wordbook、Preset）
  ├─ Provider（Dictionary / TTS / Sync / Update）
  └─ 平台层（IndexedDB / Web Speech / PWA / Harmony Bridge）
```

平台层只暴露能力接口。HarmonyOS 原生宿主以后通过 ArkWeb 消息桥接复用构建产物，后台音频则由 ArkTS 接管。

## 数据模型与去重

- `word_entries`：按规范化后的 `word` 唯一保存完整词条。
- `wordbooks`：树形目录，使用 `parentId` 表示父目录。
- `wordbook_items`：`wordbookId + wordId` 唯一关系；同一个词可属于多个生词本。
- `Sense` 从属于词性组，保存中英文释义、频率、标签、收藏状态、例句和短语。
- `playback_presets`：每种内容分别保存启用、次数、语速和间隔。
- `audio_cache`：区分 `persistent` 和 `temporary`；取消收藏只把长期音频标记为 `pending-delete`，不触碰文字数据。
- `tombstones`：记录离线删除，避免合并同步时被旧数据复活。

规范化规则为 Unicode NFKC、去首尾空格、合并内部空白、英文小写。导入已有词条时合并来源、义项、例句、短语和备注，不覆盖非空个人备注。

## 数据库迁移

本地数据库有显式 `schemaVersion`。启动时按版本顺序运行纯函数迁移，完成后再原子写回；迁移失败保留旧快照并显示错误。Supabase 迁移位于 `supabase/migrations`，所有公开表启用 RLS，只允许 `auth.uid() = user_id` 的已登录用户访问自己的行。

## 词典 Provider

`DictionaryProvider` 返回统一的完整词条：

1. 内置校验词库：覆盖验收词 `issue` 及首批导入示例，含中文、英文释义、例句和搭配。
2. Dictionary API 回退：使用公开结构化 API 获得音标、词性、英文义项与例句，保留来源；它不负责可靠中文翻译。
3. 可配置词典代理：供后续接入已获授权的 Oxford、Merriam-Webster 等正式 API，并在服务端保护 Key。

Provider 合并只去除可证明重复的内容，不删除来源义项。AI 若以后接入，只可补翻译、例句和学习提示，不能覆盖来源事实。

## TTS 与播放

播放队列由纯函数生成，支持顺序/随机/循环、全部/常用/收藏义项，以及每一内容的次数、手动语速和间隔。短语与翻译、例句与翻译按条目交错生成，词性缩写在朗读前转换为中文名称。

单词优先使用词典标准录音；拼写拆成单字母录音；短语和例句使用完整英文在线语音。Windows 壳通过原生网络桥接获取英文音频，避开 WebView 跨域限制；服务不可用时才回退到系统语音。收藏音频标为长期缓存，取消收藏后进入延迟清理队列。

## 三端方案

### Windows

Windows 使用 WPF + WebView2 自包含壳。原生更新器读取 HTTPS 清单，下载 ZIP，验证 SHA-256，安全解压，在应用退出后替换文件并重新启动。用户 IndexedDB 和缓存目录不在更新包中，不会随升级被覆盖。

### Huawei Pura 70 Pro / HarmonyOS 4.2.0

该设备当前指定系统属于 HarmonyOS 5 以下路径。仓库提供 Capacitor Android APK 薄壳并已完成侧载验证；安装和升级会受纯净模式、增强防护和签名限制。当前前台播放复用 Web 音频逻辑，熄屏、系统省电或进程被回收后仍不保证连续播放，可靠后台播报需要进一步接入原生媒体服务。

### Huawei MatePad 11.5S 灵动版 2024 / HarmonyOS 6.0

HarmonyOS 6 使用 ArkTS/HAP 原生路线。共享 PWA 可直接在浏览器运行；完整安装版应由 ArkUI `Web`/ArkWeb 承载同一构建产物，并用 ArkTS 实现 `AVPlayer/AudioRenderer + AVSessionKit + AUDIO_PLAYBACK 长时任务`。横屏宽度达到 900px 时 UI 自动切成双栏/三栏，而不是放大手机版。

两台设备不能假设共用同一个原生包：4.2 的可选 APK 壳与 6.0 的 HAP 壳分别构建，只共享 Web 产物和 TypeScript 领域逻辑。

## 同步与冲突

本地每条记录有 `updatedAt`，删除使用 tombstone。同步步骤：

1. 本地立即保存并标记 dirty。
2. 拉取用户云快照。
3. 逐记录按 `updatedAt` 合并，tombstone 优先于更旧记录。
4. 将合并结果回写本地和云端。
5. 网络失败保留 dirty 状态，允许手动重试。

第一版适合单人账号；云表为每用户一行 JSON 快照，便于可靠备份。数据量明显增大后可平滑拆成规范化云表。

## 更新

- Web/PWA：检查 `version.json` 与 Service Worker；发布新站点后提示刷新，无需寻找安装包。
- Windows 桌面版：通过 GitHub Release 清单和 SHA-256 校验完成下载、替换与重启。
- HarmonyOS 4.2 APK：私人侧载更新仍需系统安装确认，且可能需要关闭增强防护；不能静默安装。
- HarmonyOS 6 HAP：推荐 AppGallery Connect 内测/开放测试分发；私人签名侧载需要开发者工具和设备授权。应用内可检查版本并跳转官方分发流程，系统最终确认不可绕过。

更新不迁移或覆盖 IndexedDB；数据库升级先备份，失败继续运行旧数据版本。

## 安全与隐私

- 前端只允许 Supabase publishable/anon key；严禁 service role key。
- 云表启用 RLS，策略同时限制角色和 `user_id`。
- 付费词典和 TTS Key 只放服务端代理环境变量。
- 数据导出为本地 JSON，不自动上传第三方。
- PWA 仅通过 HTTPS 部署，开发时 localhost 例外。
