import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// 비개발자 운영자가 Git Push로 배포했을 때 백그라운드에서 즉시 최신 서비스 워커를 활성화
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // 30분 주기로 최신 현장 데이터/버전 자동 점검
      window.setInterval(() => {
        void registration.update();
      }, 30 * 60 * 1000);
    }
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
