import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_ACTIONS === 'true' ? '/bada-kkomkkomi/' : '/';

export default defineConfig({
  base,
  envPrefix: ['VITE_', 'KAKAO_'],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'vendor-leaflet';
            }
            if (id.includes('proj4') || id.includes('fflate')) {
              return 'vendor-gis';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.ico',
        'icons/favicon-32x32.png',
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
        name: '바다꼼꼬미 — 국립공원공단 해양 현장업무 접안·항해 지원 PWA',
        short_name: '바다꼼꼬미',
        description:
          '국립공원공단 한려해상(통영·거제 해역) 해양 현장업무 지원 (꼬미의 바다수첩 55개소 & 바닷길 콕콕 136개 항포구·선착장) 오프라인 PWA [v1.8]',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#061c24',
        theme_color: '#061c24',
        categories: ['navigation', 'utilities', 'productivity'],
        icons: [
          {
            src: 'icons/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
            purpose: 'any',
          },
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
        globIgnores: ['**/dev/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
            // 3-A. Kakao Maps SDK 스크립트 및 지도/스카이뷰(위성) 타일 CDN:
            // 한 번 열람한 해역의 카카오 일반지도 및 위성 타일은 해상 오프라인에서도 즉시 렌더링
            urlPattern:
              /^https:\/\/(dapi\.kakao\.com|(t\d|mts|map\d?|ctt-image|ssl)\.(kakaocdn|daumcdn)\.net)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bada-kakao-map-tiles-v1',
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 3-B. 오픈소스 지도 타일(OpenStreetMap - 레거시 폴백 엔진용): 한 번 열람한 해역은 해상 오프라인에서도 열람 가능
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
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
