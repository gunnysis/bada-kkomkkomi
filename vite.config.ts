import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_ACTIONS === 'true' ? '/bada-kkomkkomi/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'icons/pwa-192x192.png',
        'icons/pwa-512x512.png',
        'icons/apple-touch-icon.png',
        'data/docking_points.geojson',
      ],
      manifest: {
        name: '바다꼼꼬미 — 해양 현장업무 접안 포인트 가이드',
        short_name: '바다꼼꼬미',
        description: '통영·거제 해역 해양 현장업무 지원 및 안전 접안 포인트 오프라인 PWA [Beta 0.1]',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b192c',
        theme_color: '#0b192c',
        categories: ['navigation', 'utilities', 'productivity'],
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,geojson,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/data\//, /\/images\//],
        runtimeCaching: [
          {
            // 1. GeoJSON 데이터: 온라인 시 3초 내 최신 파일 우선 조회(비개발자 Git Push 즉시 반영),
            // 해상 음영지역(오프라인) 시 프리캐시/런타임 캐시 즉시 반환
            urlPattern: ({ url }) => url.pathname.endsWith('.geojson'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bada-geojson-data-v1',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 2. 현장 접안 사진 에셋: 캐시 즉시 표시 후 백그라운드 갱신 (StaleWhileRevalidate)
            urlPattern: ({ url }) => url.pathname.includes('/images/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'bada-field-images-v1',
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60일
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 3. 오픈소스 지도 타일(OpenStreetMap): 한 번 열람한 해역은 해상 오프라인에서도 열람 가능
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bada-osm-tiles-v1',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
