import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

const CHUNK_RELOAD_GUARD_KEY = 'bada_chunk_reload_guard_ts_v1';

// 무중단 배포(Zero-Downtime) 보호 가드:
// 신규 릴리스 배포 직후 구버전 탭에서 lazy() 동적 임포트 청크 해시 불일치(vite:preloadError) 발생 시
// 무한 새로고침 루프를 방지하면서(15초 쿨다운) 최신 번들로 자동 복구합니다.
// (WorkspaceDraftRepository가 항로·선속·필터 상태를 보존하므로 사용자 작업 손실 없음)
window.addEventListener('vite:preloadError', (event) => {
  try {
    const now = Date.now();
    const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || '0');
    if (now - lastReload > 15_000) {
      event.preventDefault();
      window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
      window.location.reload();
    }
  } catch {
    // sessionStorage 접근 제한 환경에서는 기본 동작 유지
  }
});

// 비개발자 운영자가 Git Push로 배포했을 때 백그라운드에서 즉시 최신 서비스 워커를 활성화
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // 30분 주기로 최신 현장 데이터/버전 자동 점검
      window.setInterval(() => {
        void registration.update();
      }, 30 * 60 * 1000);

      // 모바일 백그라운드에서 화면 복귀(visibilitychange) 시 온라인 상태면 즉시 OTA 업데이트 점검
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void registration.update();
        }
      });
    }
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
