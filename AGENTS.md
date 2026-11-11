# 바다꼼꼬미 (Bada-Kkomkkomi) Blueprint

EGM artifact directory: .dev/docs

## System Overview
바다꼼꼬미(`bada-kkomkkomi`)는 국립공원공단 한려해상국립공원동부사무소 내부 직원(현장 해상순찰대원, 해양자원·상괭이 조사원, 공원시설 관리담당자, 행정실무자)을 위한 무서버 해양공간 통합 지원 PWA 웹 애플리케이션입니다.
정적 공간데이터(`public/data/*.json`, `*.geojson`), 자체 2계층 하이브리드 해상 항로 탐색 엔진(`src/services/routeGeoService.ts`), 무변환 QGIS 공간파일 파서(`src/services/spatialFileParser.ts`), ECMWF 전용 해상 기상 판정기(`src/services/ecmwfWeatherService.ts`), 그리고 브라우저 영속 저장소(`IndexedDB` / `localStorage`)를 결합하여 백엔드 서버 비용 0원으로 동작합니다.

## Subdirectories & System Boundaries
- `src/components`: [시스템 계약](./docs/designs/SITEMAP.md#1-uiux-workspace--modals-srccomponents) - 인트로 미션 런치패드(`HomeScreen`), 통합 지도 퍼사드(`MapView`), 카카오/Leaflet 듀얼 캔버스, 바다수첩 상세/제보/레이어/상괭이 모달, 바닷길 시간계산기(`RouteTimeCalculator`) 및 기상 판정 패널(`MarineWeatherPanel`)을 제공합니다.
- `src/services`: [시스템 계약](./docs/designs/SITEMAP.md#2-core-domain-services-srcservices) - 해상 실항로 계산(`routeGeoService`), 등록 항구 후보 선택·불변식 검증(`routePortSelectionService`), 구간 배지 포맷팅(`routeLegLabelService`), QGIS 파일 파싱·좌표 변환(`spatialFileParser`), 레이어 영속화(`layerStorageService`), 드래프트 저장(`workspaceDraftRepository`), ECMWF 기상 결합(`ecmwfWeatherService`)을 담당합니다.
- `src/hooks`: [시스템 계약](./docs/designs/SITEMAP.md#3-state--ssot-hooks-srchooks) - URL 딥링크·히스토리 라우터(`useAppRoute`), Always-Fresh 공간레이어 단일 진실 공급원(`useAppConfig`), 실시간 해상기상 조회(`useMarineWeather`), 상괭이 기록 스토리지(`usePorpoiseStorage`)를 관리합니다.
- `src/config` & `src/data`: [시스템 계약](./docs/designs/SITEMAP.md#4-configuration--static-geodata-srcconfig--srcdata--publicdata) - 앱 버전(`appVersion.ts`), 6대 데이터·기술 출처 SSOT(`dataSources.ts`), OSM 378개 실측 해안선 폴리곤(`coastlinePolygons.ts`) 및 `public/data/` 정적 원장을 보유합니다.
- `scripts` & `src/tests`: [시스템 계약](./docs/designs/SITEMAP.md#5-build--integrity-pipeline-scripts--srctests) - QGIS 특별보호구역 동기화(`sync-qgis-protected-areas.mjs`), 해안선 폴리곤 컴파일(`build-coastline-polygons.mjs`), 전사 무결성·드리프트 검증(`verify-integrity.mjs`), 핵심 도메인 단위 테스트(`coreServices.test.ts`)를 수행합니다.
- `docs`: [설계 인덱스](./docs/designs/SITEMAP.md) - 마스터 아키텍처 정본([`docs/ARCHITECTURE_AND_DESIGN.md`](./docs/ARCHITECTURE_AND_DESIGN.md))과 데이터·기술 출처 명세서([`docs/DATA_AND_TECH_SOURCES.md`](./docs/DATA_AND_TECH_SOURCES.md))를 관리합니다.
- `_agents/skills/bada-kkomkkomi-elephant`: [Elephant 스킬](./_agents/skills/bada-kkomkkomi-elephant/SKILL.md) - Google EGM 워크플로에서 프로젝트 컨텍스트와 불변식을 로드합니다.

## Global Invariants
- **좌표계 및 공간데이터 정합 불변식**: 모든 런타임/정적 GeoJSON은 `EPSG:4326`(`WGS84`) `[lng, lat]` 순서를 따릅니다. QGIS 구 중부원점(`EPSG:5181`, `False_Northing=500,000m`)과 신 중부원점(`EPSG:5186`, `False_Northing=600,000m`)의 100km 위도 차이를 `.prj` WKT 파라미터로 구분합니다. `public/data/ports.json`(136개 항구·300개 변침점)과 `public/data/docking_points.geojson`(55개 접안지)은 동일 ID 간 좌표 오차 `1e-5` 이내를 유지하며, 378개 해안선 폴리곤(`src/data/coastlinePolygons.ts`) 내부 육지를 침범하지 않습니다.
- **해상 실항로 비관통 및 등록 항구 선택 불변식**: `routeGeoService.ts`는 136개 항포구 전 조합(18,360쌍)에서 육지 폴리곤 관통 0건을 보장하며, 우회 탐색 실패 시 육지를 관통하는 직선 좌표를 성공처럼 반환하지 않습니다. `routePortSelectionService.ts`는 등록된 136개 항구 `portId`만 후보 확인 카드를 거쳐 경로에 반영하며, 연속 동일 항구 중복과 경유지 없는 0거리 직항(`A → A`)을 차단하되 중간 경유지가 있는 왕복(`A → B → A`)은 허용합니다.
- **ECMWF 단일 모델 및 안전 실패(Fail-Safe) 불변식**: `ecmwfWeatherService.ts`는 `ecmwf_ifs`(풍속)와 `ecmwf_wam`(파고) 단일 모델만 고정 호출하고 동일 KST(`Asia/Seoul`) 타임스탬프 기준으로 결합합니다. 결측치(`null`/`NaN`)나 네트워크/오프라인 오류 발생 시 과거 캐시를 재사용하지 않고 즉시 `unknown`(`미확인(?)`) 등급을 반환합니다.
- **Always-Fresh PWA 및 단일 레이어 SSOT 불변식**: `useAppConfig.ts`는 앱 전체 공간레이어의 유일한 SSOT로서 공식 기준 레이어(`national_park`, `protected_area`, `docking`)에 대해 항상 최신 정적 GeoJSON을 우선 로드하며, 구버전 가짜 직사각형 더미 피처(`NP-TY-01`, `NP-GJ-02`, `SPA-01`, `SPA-02`)는 영구 차단합니다.
- **버전·출처·문서 무드리프트(Zero-Drift) 불변식**: `src/config/appVersion.ts`의 버전(`APP_VERSION`, `APP_VERSION_DISPLAY`)은 `package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `README.md`, `DEPLOY_GUIDE.md`, `docs/DATA_AND_TECH_SOURCES.md`와 100% 일치해야 하며, 모든 마크다운 상대 경로 링크는 실제 파일로 해석되어야 합니다.

## Global Side Effects
- **브라우저 내부 저장소**: `IndexedDB`(`bada_kkomkkomi_spatial_db`) 및 `localStorage`(`bada_operational_*`, `bada_workspace_draft_v1`, `bada_porpoise_records_v1`, `bada_weather_thresholds_v1`, `bada_last_reporter_name_v1`)에 사용자 레이어 스냅샷, 완성된 항로 드래프트(`waypoints.length === 0 || waypoints.length >= 2`), 상괭이 관찰 기록, 기상 임계치를 저장합니다.
- **외부 네트워크 통신**: Open-Meteo Forecast/Marine API(실시간 기상 읽기 전용), Kakao Maps SDK v3 및 OpenStreetMap 타일 서버(지도 렌더링), GitHub REST API(`githubLayerSyncService.ts`, 운영자가 직접 토큰을 입력하고 저장을 실행한 경우에만 호출)와 통신합니다.

## System Verification
- Run: `npm test && npm run lint && npm run build && npm run verify`
