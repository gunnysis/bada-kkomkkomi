# 초기 접속 인트로 허브 & Kakao Map 이중 엔진 — 최종 구현 및 운영 검증 정본

**문서 상태:** `IMPLEMENTED & VERIFIED (v1.1) — 코드·빌드·E2E·카카오 도메인·GitHub Secret 검증 완료`  
**최종 갱신일:** 2026-11-09  
**대상:** `public/dev/intro_design.png` 및 `public/dev/functions_app_design.png` 시안 기반 초기 접속 인트로 허브(`HomeScreen`), URL Query/History 계약(`useAppRoute`), Kakao Maps SDK v3(`v4.5.31`) + Legacy Leaflet 이중 엔진 전환 아키텍처

> **구현 및 검증 요약:**
> 1. **P0 빌드 차단 해소 완료:** `public/dev/intro_design.png`(2.52MB) 등 개발 참고용 시안 이미지가 Workbox 프리캐시에 포함되어 빌드를 차단하던 문제를 `vite.config.ts`의 `globIgnores: ['**/dev/**']`로 격리하여 프로덕션 빌드(32개 엔트리, 842.02 KiB)를 완전히 복구했습니다.
> 2. **시안 정합 2×2 인트로 허브 (`HomeScreen.tsx`) 구현 완료:** 래스터 통짜 이미지 대신 시맨틱 HTML(`<main>`, `<h1>`, `<nav aria-label="주요 기능">`, `<button>`)과 벡터(SVG) 일러스트로 재구성하여 320px~1440px 반응형, 키보드 포커스, 스크린 리더 접근성을 충족했습니다.
> 3. **4대 메뉴 정책 확정 반영:** `꼬미의 바다수첩`과 `바닷길 콕콕`은 즉시 해당 작업공간으로 진입하며, 현재 미개발 기능인 `꼬미의 달력`과 `설정`은 시안과 동일한 2×2 그리드 자리에 배치하되 네이티브 `disabled` 속성 및 `출시 예정` 배지를 적용해 클릭을 무시하고 향후 기능 개발 시 즉시 연결할 수 있도록 구조화했습니다.
> 4. **카카오 개발자 콘솔 웹 도메인 & GitHub Secret 실측 검증 완료:** `http://localhost:5173`, `http://127.0.0.1:5173`, `https://gunnysis.github.io` 3개 도메인 모두 `HTTP 200 OK` (`kakao.maps v4.5.31`) 응답 및 GitHub `github-pages` Environment Secret(`KAKAO_MAP_API_KEY`) 등록을 확인했습니다.

---

## 1장. 제안 항목별(P0 ~ P2) 해결 및 검증 결과 매트릭스

| 우선순위 | 기존 발견 문제 및 근본 원인 | 적용된 코드 및 해결 내역 | 실측 검증 결과 |
| :---: | :--- | :--- | :---: |
| **P0** | `public/dev/intro_design.png`(2.52MB)가 Workbox precache glob에 포함되어 2MiB 한도 초과로 `npm run build` 실패 | [`vite.config.ts`](../vite.config.ts)의 `workbox.globIgnores: ['**/dev/**']`로 개발 참조용 목업 폴더를 프리캐시 대상에서 명시적으로 제외 | **PASS** (`npm run build` 성공, 프리캐시 32개 842KiB) |
| **P1** | 전역 `html, body, #root`가 `100dvh`, `overflow:hidden`이어서 인트로 화면에서 소형 기기/글자 확대 시 카드 잘림 위험 | [`src/components/home/HomeScreen.tsx`](../src/components/home/HomeScreen.tsx)에 독립 스크롤 컨테이너(`fixed inset-0 z-[1200] min-h-dvh overflow-y-auto`, `safe-area` 패딩) 적용 | **PASS** (320px/360px 및 200% 확대 스크롤 정상) |
| **P1** | URL/History 상태 부재로 새로고침·뒤로가기(Back/Forward) 시 화면 불일치 | [`src/hooks/useAppRoute.ts`](../src/hooks/useAppRoute.ts) 신규 구현 (`?screen=notebook`, `?screen=navigation&panel=route|weather`, `pushState`/`replaceState`/`popstate` 동기화) | **PASS** (Chrome DevTools E2E 검증 완료) |
| **P1** | Home 복귀 시 작업공간을 언마운트하면 지도 카메라·항로·필터 상태가 초기화되고 초기 접속 시 불필요한 지도 SDK 로드 발생 | [`src/App.tsx`](../src/App.tsx)에서 새 접속(`screen === 'home'`) 시에는 지도를 마운트하지 않고, 첫 기능 카드 진입 후에는 Workspace를 유지한 채 Home 복귀 시 `inert` + `aria-hidden` 오버레이로 상태 100% 보존 | **PASS** (`mapMountedOnHome: false` → 진입 후 `workspaceStillMountedInBg: true`) |
| **P1** | Kakao ↔ Leaflet 엔진 전환 시 unmount/remount로 인해 중심 좌표와 줌 레벨이 초기화됨 | [`src/components/MapView.tsx`](../src/components/MapView.tsx)에 엔진 중립 `viewport` 상태(`{ lat, lng, zoom }`)를 승격하여 두 Canvas([`KakaoMapCanvas.tsx`](../src/components/map/KakaoMapCanvas.tsx), [`LegacyLeafletCanvas.tsx`](../src/components/map/LegacyLeafletCanvas.tsx)) 간 전환 시 카메라 위치·줌 완벽 복원 | **PASS** |
| **P1** | `mapMarkerTemplates.ts`에서 JSON 문자열을 `innerHTML`로 조합할 때 XSS 경계 취약 | [`src/components/map/mapMarkerTemplates.ts`](../src/components/map/mapMarkerTemplates.ts)에 중앙 `escapeHtml()` 함수를 도입하여 포인트 코드, 항구명, 방위각 등 모든 동적 문자열 이스케이프 적용 | **PASS** |
| **P2** | Home↔Workspace 포커스 복원 및 진단 모달 `Escape` 닫기, GeoJSON 레이어 로드 오류 재시도 UI 부재 | ① Home 복귀 시 마지막 클릭한 카드로 자동 `.focus()` 복원<br>② 진단 모달 `Escape` 키 리스너 추가<br>③ GeoJSON 레이어 로드 실패 시 하단 재시도 배너(`handleRetryGeoJsonLayers`) 제공 | **PASS** (`focusedRestoredToNotebookCard: true`) |

---

## 2장. 확정 구현 아키텍처 및 라우팅 계약

### 2.1 화면 구조 및 상태 보존 흐름

```text
새 브라우저 / PWA 실행 (URL: / 또는 /bada-kkomkkomi/)
  └─ HomeScreen (정적 SVG/HTML UI, 지도 SDK 미호출)
       ├─ [활성 버튼] 꼬미의 바다수첩 → ?screen=notebook (pushState, Workspace 마운트)
       ├─ [활성 버튼] 바닷길 콕콕     → ?screen=navigation&panel=route (pushState, Workspace 마운트)
       │                                 └─ 서브탭 전환: ?screen=navigation&panel=weather (replaceState)
       ├─ [비활성 disabled] 꼬미의 달력 (출시 예정 배지 · 클릭 무시 · 추후 기능 개발 시 활성화)
       └─ [비활성 disabled] 설정       (출시 예정 배지 · 클릭 무시 · 추후 기능 개발 시 활성화)

WorkspaceScreen (첫 진입 후 백그라운드 유지)
  ├─ 상단 헤더 [ < 홈 ] 버튼 → HomeScreen 오버레이 표시 (Workspace는 inert 처리로 항로·지도 카메라 보존)
  └─ MapView (viewport: { lat, lng, zoom } 상위 공유)
       ├─ KakaoMapCanvas (기본 엔진 · 일반지도 ROADMAP / 위성 스카이뷰 HYBRID)
       └─ LegacyLeafletCanvas (SDK 차단/오프라인 시 자동 폴백 & 수동 전환 지원)
```

### 2.2 핵심 모듈별 역할

| 파일 경로 | 역할 및 구현 핵심 |
| :--- | :--- |
| [`src/hooks/useAppRoute.ts`](../src/hooks/useAppRoute.ts) | `window.location.search` 허용 목록 파싱(`parseRouteFromUrl`), `navigateToScreen`(`pushState`), `replaceNavPanel`(`replaceState`), `popstate` 이벤트 양방향 동기화 |
| [`src/components/home/HomeScreen.tsx`](../src/components/home/HomeScreen.tsx) | 국립공원공단 배지, 앱 설치/온라인 상태 표시, 꼬미 마스코트 벡터 일러스트, 2×2 기능 카드 그리드(2개 활성 + 2개 `disabled` 출시 예정), 마지막 실행 카드 포커스 복원 |
| [`src/App.tsx`](../src/App.tsx) | `hasEnteredWorkspace` 지연 마운트 제어, 상단 HUD `[< 홈]` 복귀 버튼, Home 복귀 시 일시적 픽커/모달 자동 정리 및 핵심 상태 보존 |
| [`src/components/MapView.tsx`](../src/components/MapView.tsx) | 엔진 중립 `viewport` 보존, GeoJSON 레이어 에러/재시도 배너, Kakao SDK 진단 모달(`Escape` 지원), 우측 컨트롤 독(`위성뷰`, `카카오↔OSM`) |
| [`src/components/map/mapMarkerTemplates.ts`](../src/components/map/mapMarkerTemplates.ts) | `escapeHtml()` 기반 XSS 안전 마커 HTML 템플릿 팩토리 |

---

## 3장. 완료 판정 체크리스트 (Release Gate Verification)

### 3.1 빌드 · 정적 분석 · 데이터 보안
- [x] `npm run lint` (`oxlint` 33개 파일, 116개 규칙) **`0 warnings, 0 errors`** 통과 (`.oxlintrc.json`에 `dist/**`, `dev-dist/**` 제외 반영)
- [x] `npm run build` (`tsc -b && vite build`) **성공** (`dist/sw.js` 32개 프리캐시 엔트리, `public/dev/**` 제외 완료)
- [x] 마커 템플릿 내 동적 문자열 `escapeHtml()` 적용 완료
- [x] `.env` Git 커밋 차단(`.gitignore`) 및 GitHub Actions `KAKAO_MAP_API_KEY` 시크릿 연동 완료

### 3.2 인트로 허브 · 라우팅 · 지도 E2E 검증 (Chrome DevTools 실측)
- [x] 초기 접속(`/`) 시 지도 SDK를 로드하지 않고(`mapMountedOnHome: false`) `HomeScreen` 4개 카드 즉시 표시
- [x] `꼬미의 바다수첩` 클릭 시 `?screen=notebook` 전환 및 Kakao Map(`v4.5.31`) 정상 마운트(`kakaoMapMounted: true`)
- [x] 상단 `[< 홈]` 버튼 클릭 시 `/` 복귀, 배경 지도 마운트 상태 보존(`workspaceStillMountedInBg: true`), `꼬미의 바다수첩` 카드로 키보드 포커스 자동 복원(`focusedRestoredToNotebookCard: true`)
- [x] `바닷길 콕콕` 클릭 시 `?screen=navigation&panel=route` 진입 및 `기상상태판정` 서브탭 클릭 시 `?screen=navigation&panel=weather`(`replaceState`) 정상 반영
- [x] `꼬미의 달력`, `설정` 카드는 네이티브 `disabled: true` 및 `출시 예정` 배지로 표시되어 클릭/네트워크 요청/오작동을 유발하지 않음
