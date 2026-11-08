# 바다꼼꼬미 (Bada-Kkomkkomi) [v1.0]

해양 현장업무 지원 오프라인 우선(Offline-First) PWA 웹 애플리케이션입니다.
백엔드 서버나 외부 유료 DB 없이 **순수 정적 데이터(`GeoJSON`, `JSON`, 로컬 이미지) 교체와 Git Push만으로 무상(Zero-cost) 운영 및 자동 배포**되도록 설계되었습니다.

- **라이브 배포 URL (GitHub Pages)**: https://gunnysis.github.io/bada-kkomkkomi/
- **GitHub 저장소**: https://github.com/gunnysis/bada-kkomkkomi
- **비개발자 운영자 매뉴얼**: [`DEPLOY_GUIDE.md`](./DEPLOY_GUIDE.md)
- **아키텍처·구현 설계·트러블슈팅 정본**: [`docs/ARCHITECTURE_AND_DESIGN.md`](./docs/ARCHITECTURE_AND_DESIGN.md)
- **항포구·소규모 선착장 팩트체크 및 연구 보고서**:
  - [`docs/factcheck_and_data_analysis.md`](./docs/factcheck_and_data_analysis.md) (통영·거제 81개 정규 어항 전수 검증)
  - [`docs/small_berths_factcheck_analysis.md`](./docs/small_berths_factcheck_analysis.md) (통영·거제 50개 소규모 선착장·접안시설 팩트체크)
  - [`docs/architecture_and_algorithm_review.md`](./docs/architecture_and_algorithm_review.md) (해상 변침점 A* 우회 및 초성 검색 알고리즘 설계)
  - [`docs/app_design_ux_research.md`](./docs/app_design_ux_research.md) (해양 전자해도 UX/UI 및 Zero-Clipping 설계 연구)
  - [`docs/ux_qa_troubleshooting_report.md`](./docs/ux_qa_troubleshooting_report.md) (QA/QC 전수 점검 및 트러블슈팅 리포트)

---

## 1. 기술 스택 (Tech Stack)

| 영역 | 기술 및 버전 | 역할 |
| :--- | :--- | :--- |
| **Core** | Vite `8.3` + React `19.3` + TypeScript `7.0` | 초고속 번들링 및 엄격한 정적 타입 시스템 |
| **Styling & Icons** | Tailwind CSS `4.3` + Lucide React `1.70` | 해상 직사광선 대비 고대비 다크/화이트 투톤 HUD |
| **Map Engine** | Leaflet `1.9.4` + `react-leaflet` `5.0` | 오픈소스 타일 + 커스텀 `L.DivIcon` 캐시 + GeoJSON 공간레이어 |
| **PWA / Offline** | `vite-plugin-pwa` `2.0` + Workbox `7.4` | 32개 정적 에셋 프리캐시 + Open-Meteo API/타일 런타임 캐시 |
| **Linter** | Oxlint `1.90` (`react`, `typescript`, `oxc`) | 116개 규칙 기반 정적 분석 (`0 warnings, 0 errors`) |
| **CI/CD & Hosting** | GitHub Actions (`deploy-pages.yml`) / Cloudflare Pages | `main` 브랜치 Push 시 무상 빌드 및 자동 배포 |

---

## 2. 핵심 도메인 기능 (v1.0)

### 2.1. 꼬미의 바다수첩 (`3.1`)
- **A. 갯바위 접안정보 및 소규모 선착장 (`docking_points.geojson` — 55개소)**:
  - 통영·거제 해역 공식 조사선 접안지(5개소) 및 부잔교·슬립웨이·물양장·돌제선착장 등 소규모 접안시설(50개소) 총 **55개소**를 5가지 색상(`red` 위험주의, `amber` 조석주의, `green` 안전접안, `blue` 전용부두, `purple` 비상거점) 전술 마커로 표시합니다.
  - 색상별 실시간 필터링, 하단 슬라이딩 상세 바텀시트(`DockingDetailSheet`), CSS Scroll Snap 기반 현장 사진 좌우 넘기기(`PhotoGallery`), 현재 GPS 위치 추적(실시간/시뮬레이션)을 제공합니다.
- **B. 공간정보 레이어 (`app_config.json` + `public/data/layers/*.geojson`)**:
  - 한려해상국립공원 경계(`national_park.geojson`), 특별보호구역(`protected_area.geojson`), 갯바위 접안 포인트(`docking`)를 체크박스로 개별 표시·숨김 전환합니다.
  - `public/config/app_config.json`의 `layers` 배열에 항목만 추가하면 코드 변경 없이 신규 QGIS 폴리곤 레이어를 확장할 수 있습니다.
- **C. 현장정보 제보 (`FieldReportModal` + `emailReportService`)**:
  - 접안 포인트 상세창 또는 독립 제보 버튼(**`지도에서 위치 선택`** 지원)을 통해 위경도 좌표·현장 사진·자유 메모를 입력합니다.
  - 운영자 수신 이메일(`admin.report_recipient_email`, 앱 내에서도 즉시 변경·저장 가능)로 규격화된 제보 메일(`mailto:`)을 발송하거나 클립보드에 전문을 복사합니다.
- **D. 개인 상괭이 관찰 기록 (`PorpoiseObservationModal` + `usePorpoiseStorage`)**:
  - 지도에서 상괭이 목격 위치를 탭하면 현재 일시와 기본 개체수(`1마리`)가 자동 입력되며, 기기 내부(`localStorage`)에 저장되어 전용 상괭이 표식으로 렌더링됩니다. (기획 명세에 따라 사진·메모·통계 기능 제외, 개별 조회·수정·삭제 및 레이어 표시/숨김 지원)

### 2.2. 바닷길 콕콕 (`3.2`)
- **A/B. 듀얼 모드 상단 탭**:
  - `바닷길 콕콕` 진입 시 상단 탭에서 **`시간계산 (실항로·소규모 선착장)`**과 **`기상상태판정`** 독립 화면을 즉시 전환합니다.
- **C. 바닷길 시간계산기 (`RouteTimeCalculator` + `PortSelectModal` + `routeGeoService`)**:
  - **통영·거제 135개 항포구·소규모 선착장 사전 & 초성·별칭·섬 검색 (`PortSelectModal`)**: 국가·지방·어촌정주·소규모어항(81개소), 소규모 선착장·접안시설(50개소), 공식 조사선 접안지(4개소) 등 총 **135개소**(`public/data/ports.json`)에 대해 한글 초성(`ㅅㄷㅎ`, `ㅈㅅㅍ`), 옛지명·별칭(`원항`, `강구안`), 21개 부속 섬 이름(`욕지도`, `사량도`, `노대도`), 시설 유형(`부잔교`, `슬립웨이`), 최저수심·위험요소 배지 확인 및 원터치 선택을 지원합니다.
  - **해상 변침점(35개소) A* 우회 실항로 계산 (`routeGeoService`)**: 미륵도·거제도·한산도·사량도 등 육지/섬 관통을 방지하기 위해 방파제 외측 진입점(`seaApproach`)과 35개 해상 변침점(`waypoints`)을 경유하는 A* 최단 해상 실항로 폴리라인과 우회 계수(`detourFactor`), 접안 수심·위험 경고를 자동 산출합니다.
  - **지도 마커 드래그 & 500m 스마트 스냅 (`resolveSmartWaypoint`)**: 지도 위 출발·경유·도착 마커를 드래그하거나 지도 위 선착장 마커를 탭하면 Haversine 거리 `500m` 이내의 항구·소규모 선착장으로 자동 스냅되며, 반경 밖 해상은 `해상 좌표`로 실시간 동기화됩니다.
  - **지도 항로 폴리라인 구간 배지**: 각 구간(Leg) 중점에 `14분 · 3.5NM (142°SE)` 형태의 소요시간·해리·방위각(8방위) 캡슐 배지를 표시합니다.
  - **편의 제어**: 선박 속도 입력(기본 `15kn`) 및 원터치 프리셋(`10kn`, `15kn`, `20kn`, `28kn`), `출발↔도착 반전`, 지도 위 `선착장핀` 표시/숨김, 하단 패널 `접기/펼치기` 토글을 지원합니다.
- **D. 해상 기상상태 판정 (`MarineWeatherPanel` + `WeatherThresholdSettings` + `useMarineWeather`)**:
  - Open-Meteo Forecast API(풍속 `knots`) 및 Marine API(파고 `m`)를 병렬 호출하여 선택한 해역의 KST(`Asia/Seoul`) 시간대별 기상 데이터를 제공합니다.
  - 풍속·파고 중 더 나쁜 등급을 기준으로 최종 3단계(`좋음` 초록 / `보통` 노랑 / `나쁨` 빨강)를 판정하며, 연안 격자에서 파고 등 데이터가 결측(`null`)된 경우 허위 안전 판정을 막기 위해 `판정불가 (?)`로 정직하게 표시합니다.

---

## 3. 프로젝트 디렉터리 구조

```text
bada-kkomkkomi/
├── .github/workflows/
│   └── deploy-pages.yml               # GitHub Pages 자동 빌드·배포 워크플로
├── docs/
│   └── ARCHITECTURE_AND_DESIGN.md     # 최종 구현 설계서 · 데이터 사전 · 트러블슈팅 리포트
├── public/
│   ├── _headers                       # Cloudflare Pages / 정적 서버 캐시 무효화 헤더 규칙
│   ├── config/
│   │   └── app_config.json            # 운영자 수신 이메일, 기본 해역, 속력·기상 기본값, 공간레이어 정의
│   ├── data/
│   │   ├── docking_points.geojson     # 갯바위 접안 포인트 (5색 마커 및 현장 정보)
│   │   ├── ports.json                 # 통영·거제 주요 항포구 사전 (500m 자동 스냅 기준점)
│   │   └── layers/
│   │       ├── national_park.geojson  # 한려해상국립공원 경계 폴리곤
│   │       └── protected_area.geojson # 특별보호구역 폴리곤
│   ├── icons/                         # PWA 홈 화면 아이콘 (192x192, 512x512, apple-touch-icon)
│   └── images/docking/                # 현장 접안지 사진/일러스트 에셋
├── src/
│   ├── components/
│   │   ├── MapView.tsx                # Leaflet 지도, 5색 마커, 항로 구간 배지, 컨트롤 독
│   │   ├── DockingDetailSheet.tsx     # 접안 포인트 하단 슬라이딩 상세 시트
│   │   ├── PhotoGallery.tsx           # 현장 사진 전체화면 라이트박스 모달
│   │   ├── notebook/
│   │   │   ├── LayerControlModal.tsx        # 공간정보 레이어 & 5색 필터 드로어
│   │   │   ├── FieldReportModal.tsx         # 현장정보 이메일 제보 & 지도 위치 선택 모달
│   │   │   └── PorpoiseObservationModal.tsx # 개인 상괭이 관찰 기록 추가/수정/삭제 모달
│   │   └── navigation/
│   │       ├── RouteTimeCalculator.tsx      # 바닷길 시간계산기 패널 (접기/펼치기 지원)
│   │       ├── PortSelectModal.tsx          # 항구·접안지 검색 및 선택 모달
│   │       ├── MarineWeatherPanel.tsx       # 해상 기상상태 3단계 판정 패널
│   │       └── WeatherThresholdSettings.tsx # 기상 판정 기준값(풍속·파고) 설정 모달
│   ├── hooks/
│   │   ├── useAppConfig.ts            # app_config.json 로드 및 운영자 이메일/기상 기준 로컬 오버라이드
│   │   ├── useMarineWeather.ts        # Open-Meteo API 병렬 조회, KST 매칭 및 3단계 등급 연산
│   │   └── usePorpoiseStorage.ts      # 상괭이 관찰 기록 localStorage 영속화
│   ├── services/
│   │   ├── emailReportService.ts      # 이메일 제보 전문 포맷팅, mailto URI 생성, 클립보드 복사
│   │   └── routeGeoService.ts         # Haversine 거리(NM), 방위각(°/8방위), 500m 항구 스마트 스냅
│   └── types/                         # 도메인별 TypeScript 엄격 타입 정의 (config, docking, port, route, weather, porpoise, report)
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
