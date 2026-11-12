# 바다꼼꼬미 (Bada-Kkomkkomi) Design Sitemap & Subsystem Contracts (`SITEMAP.md`)

이 문서는 Google **Elephant-Goldfish Model (EGM)** 규격에 따른 `bada-kkomkkomi` 프로젝트의 **설계 문서 인덱스(Design Index)**이자 **컴포넌트 패키지 계약(`Peanuts` Contracts: `Overview`, `Interface`, `Invariants`, `Side Effects`, `Verification`)**의 단일 정본입니다.

---

## 0. 마스터 설계 및 출처 문서 인덱스 (Living Specifications Index)

| 문서 구분 | 문서 링크 | 역할 및 시맨틱 범위 |
| :--- | :--- | :--- |
| **루트 블루프린트 (`Hay`)** | [`AGENTS.md`](../../AGENTS.md) | 전역 불변식(`Global Invariants`), 전역 부수효과(`Global Side Effects`), `.dev/docs` 아티팩트 경로 격리 및 통합 검증 명령 정의 |
| **Elephant 컨텍스트 스킬** | [`_agents/skills/bada-kkomkkomi-elephant/SKILL.md`](../../_agents/skills/bada-kkomkkomi-elephant/SKILL.md) | EGM 설계 세션 시 프로젝트 핵심 맥락 및 Phase Write Boundary 로드 |
| **마스터 아키텍처 & 구현 설계서** | [`docs/ARCHITECTURE_AND_DESIGN.md`](../ARCHITECTURE_AND_DESIGN.md) | **1장(현상태 분석·팩트체크·근본 원인)** + **2장(아키텍처·데이터 흐름·UI/UX·항구 선택 상태 머신·Target Scope & File Boundary)** + **3장(사용자 Action Items)** 통합 정본 |
| **정박지·경유지 UX 및 실항로 곡선 구현 명세서** | [`docs/ROUTE_BERTHING_UX_ANALYSIS_REPORT.md`](../ROUTE_BERTHING_UX_ANALYSIS_REPORT.md) | 비항구 해상·해안 정박지 클릭, 마커 드래그 미세 조정, 선박 GPS 즉시 설정, 찍은 순서대로 자동 연결(`1 ➔ 2 ➔ 3`), `[도착 완료]` 자동 잠금, 옵션 A 우회 곡선(`leg.pathPositions`) 통합 구현 정본 |
| **데이터·API·기술 출처 명세서** | [`docs/DATA_AND_TECH_SOURCES.md`](../DATA_AND_TECH_SOURCES.md) | 6대 데이터·API·알고리즘 출처 및 해상 음영지역(오프라인) 동작 보장 매트릭스 정본 |
| **운영자 무상 배포 매뉴얼** | [`DEPLOY_GUIDE.md`](../../DEPLOY_GUIDE.md) | 비개발자 운영자용 정적 데이터(`ports.json`, `docking_points.geojson`, 사진) 관리 및 자동 배포 가이드 |

---

## 1. UI/UX Workspace & Modals (`src/components` & `src/App.tsx`)

### Overview
국립공원공단 일반 내부 직원이 야외 선박 갑판(직사광선 환경)에서 스마트폰과 PC로 조작하는 화면 계층입니다. 2×2 미니멀 포스터 인트로(`HomeScreen.tsx`), 2단 슬림 HUD 및 원터치 레이어 알약 스위치를 갖춘 메인 오케스트레이터(`App.tsx`), 듀얼 지도 엔진 퍼사드(`MapView.tsx`), 바다수첩 모달군, 바닷길 시간계산기(`RouteTimeCalculator.tsx`) 및 기상 판정 패널(`MarineWeatherPanel.tsx`)로 구성됩니다.

### Interface
- [`src/App.tsx`](../../src/App.tsx): `App()`
- [`src/components/home/HomeScreen.tsx`](../../src/components/home/HomeScreen.tsx): `HomeScreen(props)`
- [`src/components/MapView.tsx`](../../src/components/MapView.tsx): `MapView(props)`
- [`src/components/map/KakaoMapCanvas.tsx`](../../src/components/map/KakaoMapCanvas.tsx): `KakaoMapCanvas(props)`
- [`src/components/map/LegacyLeafletCanvas.tsx`](../../src/components/map/LegacyLeafletCanvas.tsx): `LegacyLeafletCanvas(props)`
- [`src/components/map/Roadview3DModal.tsx`](../../src/components/map/Roadview3DModal.tsx): `Roadview3DModal(props)`
- [`src/components/map/mapMarkerTemplates.ts`](../../src/components/map/mapMarkerTemplates.ts): `buildDockingMarkerSpec()`, `buildNavPortPinSpec()`, `buildPorpoiseSpec()`, `buildRouteWaypointMarkerSpec()`, `buildRouteLegDurationBadgeSpec()`, `buildRouteDirectionArrowSpec()`, `buildWeatherTargetPinSpec()`
- [`src/components/DockingDetailSheet.tsx`](../../src/components/DockingDetailSheet.tsx): `DockingDetailSheet(props)`
- [`src/components/PhotoGallery.tsx`](../../src/components/PhotoGallery.tsx): `PhotoGallery(props)`
- [`src/components/notebook/LayerControlModal.tsx`](../../src/components/notebook/LayerControlModal.tsx): `LayerControlModal(props)`
- [`src/components/notebook/FieldReportModal.tsx`](../../src/components/notebook/FieldReportModal.tsx): `FieldReportModal(props)`
- [`src/components/notebook/PorpoiseObservationModal.tsx`](../../src/components/notebook/PorpoiseObservationModal.tsx): `PorpoiseObservationModal(props)`
- [`src/components/navigation/RouteTimeCalculator.tsx`](../../src/components/navigation/RouteTimeCalculator.tsx): `RouteTimeCalculator(props)`
- [`src/components/navigation/PortSelectModal.tsx`](../../src/components/navigation/PortSelectModal.tsx): `PortSelectModal(props)`
- [`src/components/navigation/MarineWeatherPanel.tsx`](../../src/components/navigation/MarineWeatherPanel.tsx): `MarineWeatherPanel(props)`
- [`src/components/navigation/WeatherThresholdSettings.tsx`](../../src/components/navigation/WeatherThresholdSettings.tsx): `WeatherThresholdSettings(props)`

### Invariants
- `HomeScreen.tsx`의 4대 포스터 카드는 동일한 아이콘 슬롯 높이를 유지하며, 카드 내부 다중 단축 버튼 바를 두지 않습니다(Memo 2).
- `MapView.tsx`는 자체적으로 GeoJSON을 중복 fetch하지 않고 `useAppConfig.ts`가 공급하는 `layers` 및 `geoJsonLayersData` 단일 SSOT만 렌더링합니다.
- `buildNavPortPinSpec()`의 136개 항구 마커와 `buildDockingMarkerSpec()`의 55개 접안지 마커는 모두 `.bada-marker-hit-target`(`52×52px`) 터치 영역을 보장합니다.
- `KakaoMapCanvas.tsx`와 `LegacyLeafletCanvas.tsx`는 항로 작성(`isRouteDrawing`) 중 지도(바다·해안·항구 마커) 클릭 시 찍은 순서대로 순차 연결(`출발 ➔ 도착 ➔ 경유+도착 연장`)하고, 모든 정박지 마커(`routeWaypoints`)의 60fps 드래그 미세 조정(`onUpdateWaypointPos`)을 지원하며, 지도 위에는 378개 해안선 폴리곤을 우회하는 **실제 바닷길 곡선(`leg.pathPositions`, 옵션 A)**과 **실항로 50% 누적 거리 중점 배지(`leg.midLat`, `leg.midLng`)**를 렌더링합니다.
- `RouteTimeCalculator.tsx`는 `[항로 그리기 / 이동만]` 모드 스위치와 `[✅ 도착 완료 / 🔄 새 항로]` 원터치 잠금 제어를 제공하며, `PortSelectModal.tsx`는 `[📍 내 선박 현재 GPS 위치로 설정 — 즉시 적용]` 버튼과 `[거리순 / 항로주변 정렬]`을 함께 제공합니다. `App.tsx`는 페이지 신규 접속 시 `localStorage`의 이전 경로를 자동 복원하지 않고 항상 빈 경로(`routeWaypoints = []`)로 초기화합니다.

### Side Effects
- 브라우저 History API(`window.history.pushState` / `back`), 클립보드 복사(`navigator.clipboard.writeText`), 이메일 클라이언트 호출(`mailto:`), Geolocation API(`navigator.geolocation`), Kakao Maps SDK DOM 마운트 및 Leaflet Canvas 렌더링을 수행합니다.

### Verification
- Run: `npm test && npm run lint && npm run verify`

---

## 2. Core Domain Services (`src/services`)

### Overview
UI 프레임워크에 의존하지 않는 순수 비즈니스 로직 및 외부 어댑터 계층입니다. 해상 실항로 탐색, 등록 항구 선택 상태 머신, QGIS 바이너리 파일 파싱 및 측지계 변환, ECMWF 기상 시계열 정합, 로컬/원격 레이어 영속화를 담당합니다.

### Interface
- [`src/services/routeGeoService.ts`](../../src/services/routeGeoService.ts): `calculateRouteSummary()`, `resolveSmartWaypoint()`, `doesSegmentCrossLand()`, `isPointInAnyLandBarrier()`, `getNearbyMarinePlaceLabel()`, `extractChosung()`, `matchesKoreanSearch()`
- [`src/services/routePortSelectionService.ts`](../../src/services/routePortSelectionService.ts): `appendSequentialRouteWaypoint()`, `applyResolvedWaypointSelection()`, `applyDirectPortSelection()`, `findOptimalWaypointInsertIndex()`, `calculatePortDetourKm()`, `findSiblingPorts()`, `validateCandidatePort()`, `sanitizeCommittedRouteWaypoints()`, `findNearestRegisteredPort()`
- [`src/services/routeLegLabelService.ts`](../../src/services/routeLegLabelService.ts): `getRouteLegLabelParts()`
- [`src/services/spatialFileParser.ts`](../../src/services/spatialFileParser.ts): `parseSpatialFiles()`, `detectCrsFromMetadata()`
- [`src/services/layerStorageService.ts`](../../src/services/layerStorageService.ts): `loadOperationalLayerState()`, `saveOperationalLayerState()`, `listOperationalSnapshots()`, `restoreOperationalSnapshot()`, `hasLegacyDummyFeatures()`
- [`src/services/githubLayerSyncService.ts`](../../src/services/githubLayerSyncService.ts): `pushLayersToGitHubRepo()`, `loadGitHubSyncConfig()`, `saveGitHubSyncConfig()`
- [`src/services/ecmwfWeatherService.ts`](../../src/services/ecmwfWeatherService.ts): `buildEcmwfWeatherUrls()`, `alignEcmwfWindAndWaveSeries()`, `evaluateHourlyWeatherSeries()`, `evaluateCombinedWeatherGrade()`, `resolveEffectiveThresholds()`
- [`src/services/emailReportService.ts`](../../src/services/emailReportService.ts): `buildFieldReportEmailSubject()`, `buildFieldReportEmailBody()`, `buildMailtoUri()`
- [`src/services/kakaoMapLoader.ts`](../../src/services/kakaoMapLoader.ts): `loadKakaoMapSdk()`, `leafletZoomToKakaoLevel()`, `kakaoLevelToLeafletZoom()`, `diagnoseKakaoMapFailure()`
- [`src/services/workspaceDraftRepository.ts`](../../src/services/workspaceDraftRepository.ts): `loadWorkspaceDraft()`, `saveWorkspaceDraft()`, `sanitizeWorkspaceDraft()`, `isValidRouteWaypointsDraft()`, `classifyGpsError()`

### Invariants
- `routeGeoService.ts`: 136개 항구 전 조합(18,360쌍) 계산 시 378개 해안선 폴리곤 교차(`doesSegmentCrossLand`)가 0건이어야 하며, 우회 경로 탐색이 실패해 육지 관통이 남는 경우 직선 구간을 정상 경로처럼 반환하지 않고 `safetyLevel: 'danger'` 및 경로 경고를 명시합니다.
- `routePortSelectionService.ts`: 반경 150m 이내 동일·초근접 항구(0m 동좌표 2쌍 포함)를 `siblingPorts`로 누락 없이 반환하여 136개 전수 선택을 보장합니다. 연속 중복(`A → A` 인접)과 경유지 없는 0거리 직항(`waypoints.length <= 2`에서 `start === end`)을 거부하고, 경유지 삭제·비우기 후 `A → A`가 남으면 도착지를 해제해 `select_end` 대기 상태로 안전 복귀시킵니다.
- `spatialFileParser.ts`: `.prj` WKT의 `False_Northing` 파라미터(`500000` vs `600000`)를 구분하여 `EPSG:5181`(구 중부원점)을 `EPSG:5186`으로 오판하지 않습니다.
- `ecmwfWeatherService.ts`: `ecmwf_ifs`와 `ecmwf_wam` 외 타 기상 모델로 폴백하지 않으며, 결측 시 `unknown`을 반환합니다.

### Side Effects
- `layerStorageService.ts` 및 `workspaceDraftRepository.ts`는 `IndexedDB`와 `localStorage`를 읽고 씁니다.
- `kakaoMapLoader.ts`는 `<script>` 태그를 주입하며, `githubLayerSyncService.ts`는 GitHub REST API를 호출합니다. 나머지 서비스 모듈은 부수효과 없는 순수 함수입니다.

### Verification
- Run: `npm test`

---

## 3. State & SSOT Hooks (`src/hooks` & `src/utils`)

### Overview
React 컴포넌트에 라우팅, 공간레이어 설정, 실시간 해상기상, 상괭이 관찰 기록을 공급하는 커스텀 훅 및 경량 유틸리티 계층입니다.

### Interface
- [`src/hooks/useAppRoute.ts`](../../src/hooks/useAppRoute.ts): `useAppRoute()`, `parseRouteFromUrl()`
- [`src/hooks/useAppConfig.ts`](../../src/hooks/useAppConfig.ts): `useAppConfig()`
- [`src/hooks/useMarineWeather.ts`](../../src/hooks/useMarineWeather.ts): `useMarineWeather()`
- [`src/hooks/usePorpoiseStorage.ts`](../../src/hooks/usePorpoiseStorage.ts): `usePorpoiseStorage()`
- [`src/utils/geojsonMeta.ts`](../../src/utils/geojsonMeta.ts): `extractGeoJsonMeta()`

### Invariants
- `useAppConfig.ts`는 공식 시스템 레이어(`national_park`, `protected_area`, `docking`)에 대해 로컬 캐시보다 최신 정적 GeoJSON을 우선 반영하며, 구버전 더미 피처가 감지되면 즉시 퍼지합니다.
- `useAppRoute.ts`는 인앱 네비게이션 깊이(`navDepthRef`)를 추적하여 홈 복귀 시 히스토리 루프(Back-Button Trap)를 방지합니다.

### Side Effects
- `fetch()`를 통한 정적 JSON/GeoJSON 및 Open-Meteo API 호출, `window.location` / `popstate` 이벤트 구독, `localStorage` 읽기/쓰기를 수행합니다.

### Verification
- Run: `npm test && npm run build`

---

## 4. Configuration, Types & Static Geodata (`src/config`, `src/data`, `src/types`, `public/data`)

### Overview
앱 버전, 출처 레지스트리, 타입 정의, 그리고 오프라인 내장 공간데이터 원장입니다.

### Interface
- [`src/config/appVersion.ts`](../../src/config/appVersion.ts): `APP_VERSION`, `APP_VERSION_DISPLAY`, `APP_RELEASE_DATE`, `DATA_BASELINE_LABEL`, `DATA_SOURCE_SHORT_BADGE`
- [`src/config/dataSources.ts`](../../src/config/dataSources.ts): `OFFLINE_CAPABILITY_MATRIX`, `DATA_SOURCE_REGISTRY`, `classifyDockingPhotoAsset()`, `summarizePhotoCollection()`, `resolveLayerProvenance()`, `buildSourceCitationCopyText()`
- [`src/data/coastlinePolygons.ts`](../../src/data/coastlinePolygons.ts): `REAL_COASTLINE_POLYGONS` (378 polygons, 12,794 vertices)
- `src/types/*.ts`: [`config.ts`](../../src/types/config.ts), [`docking.ts`](../../src/types/docking.ts), [`kakao.ts`](../../src/types/kakao.ts), [`porpoise.ts`](../../src/types/porpoise.ts), [`port.ts`](../../src/types/port.ts), [`report.ts`](../../src/types/report.ts), [`route.ts`](../../src/types/route.ts), [`spatialLayer.ts`](../../src/types/spatialLayer.ts), [`weather.ts`](../../src/types/weather.ts)
- `public/data/`: [`ports.json`](../../public/data/ports.json), [`docking_points.geojson`](../../public/data/docking_points.geojson), [`layers/protected_area.geojson`](../../public/data/layers/protected_area.geojson), [`layers/national_park.geojson`](../../public/data/layers/national_park.geojson)

### Invariants
- `protected_area.geojson`은 정확히 20개 피처(한동 9·한려 11)를 포함해야 합니다.
- `ports.json`(136개 항구·300개 변침점)의 모든 변침점 간선(`neighbors`)은 양방향 대칭(Symmetric)이어야 합니다.

### Side Effects
- 순수 정적 데이터 및 상수 모듈로 런타임 부수효과가 없습니다.

### Verification
- Run: `npm run verify`

---

## 5. Build & Integrity Pipeline (`scripts` & `src/tests`)

### Overview
빌드 타임 공간데이터 컴파일러 및 CI/로컬 무결성·드리프트 검증 파이프라인입니다.

### Interface
- [`scripts/verify-integrity.mjs`](../../scripts/verify-integrity.mjs): 버전 SSOT, 공간데이터 패리티, 레거시 더미 차단, SW 프리캐시 중복 차단, **EGM 계약·모듈 목록·마크다운 링크 무결성(Section 7)** 검증
- [`scripts/sync-qgis-protected-areas.mjs`](../../scripts/sync-qgis-protected-areas.mjs): 공단 QGIS 특별보호구역 Shapefile(`EPSG:5181`) → `protected_area.geojson`(`EPSG:4326`) 변환기
- [`scripts/build-coastline-polygons.mjs`](../../scripts/build-coastline-polygons.mjs): OSM 해안선 폴리곤 추출·경량화 빌더
- [`src/tests/coreServices.test.ts`](../../src/tests/coreServices.test.ts): 핵심 서비스·알고리즘·항구 선택 상태 머신·EGM 무드리프트 단위 테스트 스위트

### Invariants
- `npm run verify`는 단 1건의 버전 불일치, 미등재 서비스/훅 모듈, 깨진 마크다운 상대 경로 링크가 존재해도 즉시 실패(Exit Code 1)해야 합니다.

### Side Effects
- 파일시스템 읽기 및 빌드/동기화 스크립트 실행 시 대상 정적 데이터 파일을 생성합니다.

### Verification
- Run: `npm test && npm run verify`
