import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: '生词助手',
        short_name: '生词助手',
        description: '快速收集、查询并连续播报生词，适用于四六级、考研、雅思、托福和日常阅读',
        theme_color: '#f7f8f5',
        background_color: '#f7f8f5',
        display: 'standalone',
        start_url: '/',
        lang: 'zh-CN',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,json,txt}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.dictionaryapi\.dev\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'dictionary-temporary', expiration: { maxEntries: 100, maxAgeSeconds: 604800 } }
          },
          {
            urlPattern: /^https:\/\/dict\.youdao\.com\/dictvoice/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pronunciation-audio',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 1000, maxAgeSeconds: 15552000 }
            }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
})
