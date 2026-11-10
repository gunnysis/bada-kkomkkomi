# 바다꼼꼬미 (Bada-Kkomkkomi) [v2.2]

국립공원공단 해양국립공원(한려해상·통영·거제) 직원의 해상·도서 현장업무 지원을 위한 오프라인 우선(Offline-First) PWA 웹 애플리케이션입니다.
백엔드 서버나 외부 유료 DB 없이 **순수 정적 데이터(`GeoJSON`, `JSON`, 로컬 이미지) + 인앱 공간정보 운영 저장소(`IndexedDB` / GitHub 자동 커밋)만으로 무상(Zero-cost) 운영 및 자동 배포**되도록 설계되었습니다.

- **라이브 배포 URL (GitHub Pages)**: https://gunnysis.github.io/bada-kkomkkomi/
- **GitHub 저장소**: https://github.com/gunnysis/bada-kkomkkomi
- **비개발자 운영자 매뉴얼**: [`DEPLOY_GUIDE.md`](./DEPLOY_GUIDE.md)
- **외부 데이터·API·지도·기술 출처 안내서 (일반인·운영자용)**: [`docs/DATA_AND_TECH_SOURCES.md`](./docs/DATA_AND_TECH_SOURCES.md)
- **아키텍처·구현 설계·트러블슈팅 단일 정본**: [`docs/ARCHITECTURE_AND_DESIGN.md`](./docs/ARCHITECTURE_AND_DESIGN.md)

---

## 1. 기술 스택 (Tech Stack)

| 영역 | 기술 및 버전 | 역할 |
| :--- | :--- | :--- |
| **Core** | Vite `8.3` + React `19.3` + TypeScript `7.0` | 초고속 번들링 및 엄격한 정적 타입 시스템 |
| **Styling & Brand Design** | Tailwind CSS `4.3` + Lucide React `1.70` + KNPS & NPIP (`AS 920~923`) Tokens | 국립공원공단(KNPS) 공식 CI · 한려해상 깃대종 팔색조('알로', `AS 920`) 10색 정품 팔레트 및 **한려해상 데이라이트 브리즈(Daylight Breeze)** 라이트 테마 기반 야외 직사광선 고대비 HUD |
| **Map & GIS Engine** | Kakao Maps SDK `v3` (Primary) + Leaflet `1.9.4` (Fallback) + `proj4` + `fflate` | 카카오 일반/순수위성/하이브리드 + 5종 오버레이 + 360° 3D 로드뷰 + QGIS `.gpkg`/`.zip(shp)`/`.kml`/`.geojson` 인앱 파서 & 한국 좌표계(`EPSG:5179`/`5186` 등) 자동 변환 |
| **PWA / Offline** | `vite-plugin-pwa` `2.0` + Workbox `7.4` | 정적 에셋 프리캐시(중복 0건 보장) + 현장 이미지·GeoJSON 런타임 캐시 (기상 API는 실시간 안전을 위해 캐시 배제) |
| **Linter & Integrity** | Oxlint `1.90` + `scripts/verify-integrity.mjs` | 116개 규칙 기반 정적 분석(`0 warnings, 0 errors`) 및 버전·데이터·항로 그래프·SW 프리캐시 자동 무결성 검증 |
| **CI/CD & Hosting** | GitHub Actions (`deploy-pages.yml`) / Cloudflare Pages | `main` 브랜치 Push 시 무상 빌드 및 자동 배포 |

---

## 2. 핵심 도메인 기능 (v2.2)

### 2.0. 국립공원공단(KNPS) 브랜드 디자인 시스템 & 인트로 미션 런치패드 (`HomeScreen` + `useAppRoute`)
- **국립공원공단(KNPS) 한려해상 비오필릭 디자인 시스템**: 국립공원공단 공식 상징 3원색(생태보전 그린 `#00854a`·`#10b981`, 청정 해양 블루 `#0066b3`·`#0ea5e9`, 생명력 태양 앰버 `#f59e0b`)과 한려해상 다도해 파노라마 일러스트, 국립공원 레인저(Ranger) 복장 마스코트, `accent-color` 브랜드 폼 컨트롤 및 `contrast-color()`/`oklch` 폴백 배지를 전 화면에 일관되게 적용했습니다.
- **원터치 직행 미션 런치패드**: 초기 접속 시 무거운 지도 SDK 로드 없이 2×2 기능 그리드를 즉시 표시하며, 세부 작업 직행 칩(`[🚨위험주의 9곳]`, `[🗺️전체 55곳]`, `[📦공간 레이어]`, `[⏱️실항로 시간계산]`, `[🌊해상기상 판정]`)으로 1탭 진입을 지원합니다.
- **2단 슬림 HUD & 깊이 인식 히스토리 라우터**: 모바일 화면 상단 고정 바 점유율을 12% 미만(`~92px`)으로 압축하고, 인앱 진입 시 `[< 홈]` 클릭이 `window.history.back()`으로 동작하여 뒤로가기 무한 루프(Back-Button Trap)를 방지합니다.

### 2.1. 꼬미의 바다수첩 (`3.1`)
- **A. 갯바위 접안정보 및 소규모 선착장 (`docking_points.geojson` — 55개소 · '위험주의' 우선 노출 UX)**:
  - 통영·거제 해역 공식 조사선 접안지(5개소) 및 부잔교·슬립웨이·물양장·돌제선착장 등 소규모 접안시설(50개소) 총 **55개소**를 5가지 색상(`red` 위험주의 9, `amber` 조석주의 14, `green` 안전접안 13, `blue` 전용부두 12, `purple` 비상거점 7) 전술 마커로 표시합니다.
  - **Hazard-First 다중 등급 · 권역(`전체/통영/거제`) · 검색어 필터**: 초기 진입 시 **`red`(위험·암초 주의 9개소)만 단독 기본 표시**하며, 상단 `[+등급·권역 ▾]` 팝오버에서 5개 등급 복수 선택(Multi-Select), 권역 필터, 명칭·코드 검색을 제공합니다.
  - 하단 슬라이딩 상세 바텀시트(`DockingDetailSheet`), CSS Scroll Snap 현장 사진 스와이프(`PhotoGallery`), 360° 3D 현장 로드뷰(`Roadview3DModal`), **`[🧭 이 접안지를 목적지로 바닷길 시간·기상 계산하기]` 도메인 간 브릿지**를 제공합니다.
- **B. 직원용 QGIS 멀티포맷 공간정보 레이어 운영 관리 (`LayerControlModal` + `spatialFileParser` + `layerStorageService`)**:
  - **QGIS 실무 파일 무변환 직접 업로드**: `.gpkg` (OGC GeoPackage SQLite3 바이너리), `.zip` / `.shp+.dbf+.prj+.cpg` (ESRI Shapefile), `.geojson`/`.json`, `.kml`/`.kmz` 파일을 브라우저에서 직접 파싱하며, 복수 레이어 포함 시 선택·일괄 반입을 지원합니다.
  - **한국 공공측량 좌표계(`EPSG:5179`, `5186`, `5187`, `5185`, `5181`, `5174`, `3857`) & `CP949`(`EUC-KR`) 인앱 자동 변환**: `proj4`와 `TextDecoder('euc-kr')`를 내장하여 별도의 QGIS 재투영이나 인코딩 변환 없이도 `EPSG:4326`(WGS 84) 및 정상 한글 속성으로 즉시 자동 복원합니다.
  - **전 도형(`Polygon`, `LineString`, `Point`) & 동적 스타일/피처 편집**: 선/면 색상, 두께, 실선/점선, 채우기 투명도, 지도 라벨 표시 속성(`labelField`), 피처 속성값 편집 및 Douglas-Peucker 모바일 경량화를 Kakao Map과 Legacy Leaflet 양쪽에서 동일하게 렌더링합니다.
  - **`[저장 (운영 반영)]` = 즉시 운영 반영**: 관리 화면에서 **`[저장 (운영 반영)]`** 버튼을 누르면 즉시 활성 지도와 기기 영속 저장소(`IndexedDB` + `localStorage`, 최대 12개 버전 스냅샷 및 즉시 롤백 지원)에 운영 본으로 반영되며, 원격 GitHub 토큰 설정 시 `main` 브랜치 원자적 자동 커밋 및 GitHub Pages 배포까지 원클릭으로 수행합니다.
- **C. 현장정보 제보 (`FieldReportModal` + `emailReportService`)**:
  - 접안 포인트 상세창 또는 독립 제보 버튼(**`지도에서 위치 선택`** 지원)을 통해 위경도 좌표·현장 사진·자유 메모를 입력합니다.
  - 운영자 수신 이메일(`admin.report_recipient_email`, 앱 내에서도 즉시 변경·저장 가능)로 규격화된 제보 메일(`mailto:`)을 발송하거나 클립보드에 전문을 복사합니다.
- **D. 개인 상괭이 관찰 기록 (`PorpoiseObservationModal` + `usePorpoiseStorage`)**:
  - 지도에서 상괭이 목격 위치를 탭하면 현재 일시와 기본 개체수(`1마리`)가 자동 입력되며, 기기 내부(`localStorage`)에 저장되어 전용 상괭이 표식으로 렌더링됩니다. (기획 명세에 따라 사진·메모·통계 기능 제외, 개별 조회·수정·삭제 및 레이어 표시/숨김 지원)

### 2.2. 바닷길 콕콕 (`3.2`)
- **A/B. 듀얼 모드 상단 탭**:
  - `바닷길 콕콕` 진입 시 상단 탭에서 **`시간계산 (실항로·소규모 선착장)`**과 **`기상상태판정`** 독립 화면을 즉시 전환합니다.
- **C. 바닷길 시간계산기 (`RouteTimeCalculator` + `PortSelectModal` + `routeGeoService`)**:
  - **통영·거제 136개 항포구·소규모 선착장 사전 & 초성·별칭·섬 검색 (`PortSelectModal`)**: 국가·지방·어촌정주·소규모어항(81개소), 소규모 선착장·접안시설(50개소), 공식 조사선 접안지(5개소) 등 총 **136개소**(`public/data/ports.json`, `docking_points.geojson` 55개소와 100% ID 정합)에 대해 한글 초성(`ㅅㄷㅎ`, `ㅈㅅㅍ`), 읍면동·옛지명·별칭(`원항`, `강구안`), 21개 부속 섬 이름(`욕지도`, `사량도`, `노대도`), 시설 유형(`부잔교`, `슬립웨이`), 최저수심·위험요소 배지 확인 및 원터치 선택을 지원합니다.
  - **해상 변침점(35개소) A* 우회 실항로 계산 (`routeGeoService`)**: 미륵도·거제도·한산도·사량도 등 육지/섬 관통을 방지하기 위해 방파제 외측 진입점(`seaApproach`)과 35개 해상 변침점(`waypoints`)을 경유하는 A* 최단 해상 실항로 폴리라인과 우회 계수(`detourFactor`), 접안 수심·위험 경고를 자동 산출합니다.
  - **경유지 직관적 취소·순서 변경·일괄 비우기·Undo 히스토리 & 브리핑 복사**: 지도 탭 모드 4종(`[✋이동만]`, `[+경유추가]`, `[출발지정]`, `[도착지정]`), 지도 마커 인라인 `[✕]` 취소 버튼, 패널 행 `[✕ 취소]`·`[▲/▼]` 순서 변경, `[경유지 비우기 (N)]`, 최대 10단계 `[↩ 실행취소]`, **KST 예상 도착시각(`HH:MM 도착예정`)**, **`[📋 브리핑복사]`(무전·단톡방 공유)**, 구간별 **`[🌊 기상]` 원터치 기상 확인**을 지원합니다.
  - **지도 마커 드래그 & 500m 스마트 스냅 (`resolveSmartWaypoint`)**: 지도 위 출발·경유·도착 마커를 드래그하거나 지도 위 선착장 마커를 탭하면 Haversine 거리 `500m` 이내의 항구·소규모 선착장으로 자동 스냅되며, 반경 밖 해상은 `해상 좌표`로 실시간 동기화됩니다.
  - **지도 항로 폴리라인 구간 배지**: 각 구간(Leg) 중점에 `14분 · 3.5NM (142°SE)` 형태의 소요시간·해리·방위각(8방위) 캡슐 배지를 표시합니다.
  - **편의 제어**: 선박 속도 입력(기본 `15kn`) 및 원터치 프리셋(`10kn`, `15kn`, `20kn`, `28kn`), `출발↔도착 반전`, 지도 위 `선착장핀` 표시/숨김, 하단 패널 `접기/펼치기` 토글을 지원합니다.
- **D. ECMWF 전용 해상 기상상태 판정 (`MarineWeatherPanel` + `ecmwfWeatherService` + `useMarineWeather`)**:
  - **ECMWF 단일 모델 고정 (`ecmwf_ifs` + `ecmwf_wam`)**: Open-Meteo Forecast API(`models=ecmwf_ifs`, 9km 해상도 10m 풍속 `kn`)와 Marine API(`models=ecmwf_wam`, 9km 해상도 유의파고 `m`)를 명시적으로 고정 호출하며, 타 모델이나 Best Match로 임의 폴백하지 않습니다.
  - **타임스탬프(`Map`) 정합 결합 및 안전 실패(`unknown`) 원칙**: 단순 배열 인덱스가 아닌 동일 KST(`Asia/Seoul`) 타임스탬프 기준으로 풍속·파고를 결합하며, 두 값 중 하나라도 결측(`null`/`NaN`)이거나 오프라인/네트워크 오류 시 과거 캐시를 재사용하지 않고 상단 서브탭 배지와 패널 모두 즉시 `미확인(?)` / `판정불가 (?)`로 정직하게 표시합니다.
  - **양방향 항로 브릿지 & 활성 판정 기준치 상시 표기**: 현재 적용 중인 주의/보류 풍속·파고 기준치 요약 바, 48시간 타임라인 `[현재시각으로]` 원터치 복귀, `[+이 해역 경유지 추가]` 역방향 브릿지를 제공합니다.
  - **출처 및 연안 격자 한계 고지**: 화면 하단에 `예보 모델: ECMWF IFS HRES 9 km · ECMWF WAM 9 km / API 제공: Open-Meteo` 출처와 9km 연안 격자 해상도 한계 및 안전 안내를 상시 표기합니다.

---

## 3. 프로젝트 디렉터리 구조

```text
bada-kkomkkomi/
├── .github/workflows/
│   └── deploy-pages.yml               # GitHub Pages 자동 빌드·배포 워크플로 (정적 설정·GeoJSON 무결성 검증 포함)
├── docs/
│   ├── ARCHITECTURE_AND_DESIGN.md     # 최종 구현 설계서 · 데이터 사전 · 트러블슈팅 단일 정본
│   └── DATA_AND_TECH_SOURCES.md       # 외부 데이터 · API · 지도 · 기술 및 에셋 출처 안내서
├── public/
│   ├── _headers                       # Cloudflare Pages / 정적 서버 캐시 무효화 헤더 규칙
│   ├── config/
│   │   └── app_config.json            # 운영자 수신 이메일, 기본 해역, 속력·기상 기본값, 공간레이어 정의
│   ├── data/
│   │   ├── docking_points.geojson     # 갯바위 접안 포인트 및 소규모 선착장 (55개소, 5색 안전 등급)
│   │   ├── ports.json                 # 통영·거제 136개 항포구·선착장 사전 및 35개 해상 변침점 그래프
│   │   └── layers/
│   │       ├── national_park.geojson  # 한려해상국립공원 경계 폴리곤
│   │       └── protected_area.geojson # 특별보호구역 폴리곤
│   ├── icons/                         # PWA 홈 화면 아이콘 (192x192, 512x512, apple-touch-icon)
│   └── images/docking/                # 현장 접안지 사진/일러스트 에셋
├── .env.example                       # Kakao Map JavaScript API 키(KAKAO_MAP_API_KEY) 환경변수 예시
├── src/
│   ├── App.tsx                        # 메인 워크스페이스 오케스트레이터 (2단 슬림 HUD, 도메인 브릿지, 다중 필터)
│   ├── components/
│   │   ├── home/
│   │   │   └── HomeScreen.tsx         # 초기 접속 2×2 인트로 미션 런치패드 & 세부 기능 원터치 직행 칩
│   │   ├── MapView.tsx                # 통합 GIS 퍼사드 (Kakao Primary ↔ Legacy Leaflet 전환, 다중 배경지도·3D 독)
│   │   ├── map/
│   │   │   ├── KakaoMapCanvas.tsx     # Kakao Maps SDK v3 렌더링 엔진 (MapTypeId 10종, CustomOverlay 드래그, 폴리곤/항로)
│   │   │   ├── LegacyLeafletCanvas.tsx# 레거시 Leaflet + OpenStreetMap 폴백 엔진 (무중단 가용성 보장)
│   │   │   ├── Roadview3DModal.tsx    # 360° 3D 구면 현장 로드뷰 모달 (80m→200m 확장 탐색 및 위성+지형도 폴백)
│   │   │   └── mapMarkerTemplates.ts  # 5색 접안 마커(Hazard Halo)·선착장핀·상괭이·항로배지·기상핀 HTML 팩토리
│   │   ├── DockingDetailSheet.tsx     # 접안 포인트 하단 슬라이딩 상세 시트 (3D 현장뷰 & 바닷길 계산 브릿지)
│   │   ├── PhotoGallery.tsx           # 현장 사진 전체화면 라이트박스 모달
│   │   ├── notebook/
│   │   │   ├── LayerControlModal.tsx        # 직원용 QGIS 멀티포맷 공간정보 레이어 운영 관리 워크스페이스
│   │   │   ├── FieldReportModal.tsx         # 현장정보 이메일 제보 & 지도 위치 선택 모달
│   │   │   └── PorpoiseObservationModal.tsx # 개인 상괭이 관찰 기록 추가/수정/삭제 모달
│   │   └── navigation/
│   │       ├── RouteTimeCalculator.tsx      # 바닷길 시간계산기 패널 (A* 실항로·경유지 제어·KST 도착예정·브리핑복사)
│   │       ├── PortSelectModal.tsx          # 136개 항구·선착장 초성/별칭/섬 검색 모달
│   │       ├── MarineWeatherPanel.tsx       # ECMWF 전용 해상 기상상태 3단계 판정 패널 (항로 해역 칩 연동)
│   │       └── WeatherThresholdSettings.tsx # 기상 판정 기준값(풍속·파고) 설정 모달
│   ├── config/
│   │   └── appVersion.ts              # 앱 릴리즈 버전(APP_VERSION) 및 데이터셋 버전 단일 정본
│   ├── hooks/
│   │   ├── useAppRoute.ts             # URL Query 딥링크, Depth-Aware 히스토리 라우터(navigateHome), 프리셋 관리
│   │   ├── useAppConfig.ts            # app_config.json + IndexedDB 레이어 통합 로더 및 즉시 운영 반영
│   │   ├── useMarineWeather.ts        # ECMWF API 병렬 조회, KST 타임스탬프 매칭 및 3단계 등급 연산
│   │   └── usePorpoiseStorage.ts      # 상괭이 관찰 기록 localStorage 영속화
│   ├── utils/
│   │   └── geojsonMeta.ts             # 초기 부팅용 무의존성 WGS84 GeoJSON 메타데이터·BBox 정규화 유틸리티
│   ├── services/
│   │   ├── kakaoMapLoader.ts          # KAKAO_MAP_API_KEY 기반 SDK 동적 로더, 줌 레벨 변환기, 도메인 검증 진단기
│   │   ├── spatialFileParser.ts       # .gpkg, .zip(.shp/.dbf/.prj/.cpg), .geojson, .kml 인앱 파서 & EPSG:5179/CP949 자동 변환
│   │   ├── layerStorageService.ts     # IndexedDB + localStorage 레이어 영속 저장소 및 12개 버전 스냅샷 롤백
│   │   ├── githubLayerSyncService.ts  # [저장] 시 GitHub Git Data API 기반 원격 main 브랜치 원자적 자동 커밋
│   │   ├── ecmwfWeatherService.ts     # ECMWF IFS(풍속) + WAM(파고) 전용 URL 생성 및 KST 타임스탬프 결합기
│   │   ├── emailReportService.ts      # 이메일 제보 전문 포맷팅, mailto URI 생성, 클립보드 복사
│   │   └── routeGeoService.ts         # Haversine 거리(NM), 출항 침로(°/8방위), 초성 검색, 35개 변침점 A* 우회, 500m 스냅
│   └── types/                         # 도메인별 TypeScript 엄격 타입 정의 (kakao, config, spatialLayer, docking, port, route, weather, porpoise, report)
├── DEPLOY_GUIDE.md                    # 비개발자 운영자용 데이터 교체 및 무상 배포 가이드
├── README.md                          # 프로젝트 개요 문서
└── vite.config.ts                     # Vite + Tailwind v4 + Workbox PWA 설정
```

---

## 4. 로컬 개발 및 검증 명령

```bash
# 의존성 설치
npm install

# 정적 린트 검사 (oxlint 116개 규칙)
npm run lint

# 프로덕션 빌드 (TypeScript 타입 검증 + Vite 번들링 + Workbox 서비스 워커 생성)
npm run build

# 로컬 개발 서버 실행
npm run dev
```
