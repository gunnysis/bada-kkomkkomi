import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_ACTIONS === 'true' ? '/bada-kkomkkomi/' : '/';

export default defineConfig({
  base,
  build: {
    chunkSizeWarningLimit: 700,
  },
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
        'config/app_config.json',
        'data/docking_points.geojson',
        'data/ports.json',
        'data/layers/national_park.geojson',
        'data/layers/protected_area.geojson',
      ],
      manifest: {
        name: '바다꼼꼬미 — 해양 현장업무 접안·항해 지원 PWA',
        short_name: '바다꼼꼬미',
        description:
          '통영·거제 해역 해양 현장업무 지원 (꼬미의 바다수첩 55개소 & 바닷길 콕콕 135개 항포구·선착장) 오프라인 PWA [v1.0]',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,geojson,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/data\//, /\/images\//, /\/config\//],
        runtimeCaching: [
          {
            // 1. GeoJSON 및 JSON 설정 파일: 온라인 시 3초 내 최신 파일 우선 조회(비개발자 Git Push 즉시 반영),
            // 해상 음영지역(오프라인) 시 프리캐시/런타임 캐시 즉시 반환
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.geojson') || url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bada-geojson-and-config-v2',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 40,
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
              cacheName: 'bada-field-images-v2',
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
              cacheName: 'bada-osm-tiles-v2',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 4. Open-Meteo 해상기상 예보 API: 온라인 우선 조회(4초 타임아웃), 해상 음영지역 진입 시 최근 6시간 내 예보 폴백
            urlPattern: /^https:\/\/(marine-)?api\.open-meteo\.com\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bada-open-meteo-v1',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 6, // 6시간
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
