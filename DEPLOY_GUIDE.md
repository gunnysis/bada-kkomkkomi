# 바다꼼꼬미 [v1.0] — 비개발자 운영자용 무료 자동 배포 & 데이터 운영 가이드 (`DEPLOY_GUIDE.md`)

이 문서는 코딩이나 서버 지식이 전혀 없는 현장 운영자도 **월 비용 0원(Zero-cost)**으로 **바다꼼꼬미 PWA 앱**을 운영하고, 코드는 단 한 줄도 수정하지 않은 채 **정적 데이터 파일(`GeoJSON`, `JSON`, 현장 사진)**만 교체하여 **자동 업데이트**할 수 있도록 안내하는 실전 매뉴얼입니다.

---

## 전체 자동 배포 흐름 한눈에 보기

```text
[운영자: 사진 업로드 또는 GeoJSON / JSON 파일 웹 편집]
          ↓ (GitHub 웹 화면에서 Commit changes 클릭)
[GitHub 저장소 (gunnysis/bada-kkomkkomi)]
          ↓ (GitHub Actions / Cloudflare Pages 자동 빌드 ~30초)
[Workbox 서비스 워커 리비전 해시 갱신 + Cache-Control 헤더 적용]
          ↓ (skipWaiting + clientsClaim + visibilitychange 체크)
[현장 작업자 스마트폰 PWA 앱 즉시 최신 데이터 반영 완료!]
```

---

## [1단계] 배포 주소 및 스마트폰 PWA 앱 설치 방법

- **현재 운영 배포 주소**: `https://gunnysis.github.io/bada-kkomkkomi/`

### 1. 상단 헤더 `앱 설치` 버튼 활용
- Android Chrome, Edge, Samsung Internet 또는 iPhone/iPad Safari로 접속한 뒤, 화면 우측 상단 에메랄드색 **`앱 설치`** 버튼을 누르면 즉시 설치 프롬프트 또는 iOS 설치 안내 화면이 열립니다.

### 2. Android (갤럭시 · Chrome 브라우저)
1. Chrome 앱으로 배포 주소에 접속합니다.
2. 상단 **`앱 설치`** 버튼을 탭하거나 브라우저 우측 상단 메뉴(`⋮`) ➔ **`앱 설치`**를 탭합니다.

### 3. iPhone / iPad (Safari 브라우저)
1. Safari 앱으로 배포 주소에 접속합니다.
2. 하단 중앙 **`공유`** 버튼(네모 위 화살표) ➔ **`홈 화면에 추가`** ➔ 우측 상단 **`추가`**를 탭합니다.

---

## [2단계] 비개발자 운영자의 4대 데이터 일상 관리 방법 (코드 수정 0줄!)

운영자가 관리하는 모든 데이터는 `public/` 폴더 아래에 위치합니다.

| 관리 대상 | 파일 경로 | 용도 |
| :--- | :--- | :--- |
| **1. 접안 포인트 & 소규모 선착장 데이터 (55개소)** | `public/data/docking_points.geojson` | 갯바위 접안 포인트 및 소규모 선착장 좌표, 물때, 위험요소, 5색 표식, 사진 경로 |
| **2. 현장 접안 사진** | `public/images/docking/` | 접안 포인트 상세창에 표시할 현장 사진 파일 |
| **3. 통합 항구·소규모 선착장 사전 (135개소 + 변침점 35개소)** | `public/data/ports.json` | 바닷길 시간계산기에서 초성/별칭/섬 검색, 500m 자동 스냅, A* 해상 실항로 우회 연산에 사용되는 항포구·선착장 목록 |
| **4. 운영자 설정 & 레이어** | `public/config/app_config.json` | 현장 제보 수신 이메일 주소, 공간정보 레이어 목록, 기상 판정 기본 기준값 |

---

### 작업 A. 현장 접안 사진 추가/교체하기 (`public/images/docking/`)
1. GitHub 저장소 웹 화면에서 **`public` ➔ `images` ➔ `docking`** 폴더로 이동합니다.
2. 우측 상단 **`Add file` ➔ `Upload files`**를 클릭해 현장 사진(예: `ty-004-rock.jpg`)을 업로드합니다.
   - **주의사항 (대소문자 일관성)**: 리눅스 서버는 대소문자를 엄격히 구분하므로 파일명은 항상 **영문 소문자, 숫자, 하이픈(`-`)** 조합으로 통일하세요.

---

### 작업 B. 갯바위 접안 포인트 및 소규모 선착장 수정하기 (`public/data/docking_points.geojson`)
1. `public/data/docking_points.geojson` 파일을 열고 우측 상단 **연필 아이콘(`Edit this file`)**을 클릭합니다.
2. 아래 양식을 `"features": [ ... ]` 배열 안에 추가하거나 수정합니다:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [128.4278, 34.8378]
  },
  "properties": {
    "id": "TY-004",
    "name": "통영 산양읍 삼덕항 물양장",
    "purpose": "연안 어장 환경조사 및 잠수장비 하역",
    "tide_info": "간조 시 수심 1.8m 확보, 남서풍 유입 시 파랑 주의",
    "hazard": "물양장 북측 끝단 수중 콘크리트 블록 돌출 — 선수 접안 금지",
    "color": "amber",
    "verified_date": "2026-11-08",
    "photos": [
      "/images/docking/ty-004-rock.jpg"
    ]
  }
}
```

> **꼭 기억할 3가지 핵심 규칙**
> 1. **위경도 순서**: `"coordinates": [경도(128.xxxx), 위도(34.xxxx)]` 순서입니다. (`128`로 시작하는 경도가 항상 앞!)
> 2. **마커 색상(`color`) 5종**: `"red"`(위험·암초 주의), `"amber"`(조석·항로 주의), `"green"`(상시 안전 접안), `"blue"`(관공선·전용부두), `"purple"`(임시·비상 포인트) 중 하나만 입력합니다.
> 3. **사진 경로**: `"photos"` 배열에는 `"/images/docking/파일명"` 형태로 입력하면 배포 환경(서브경로 포함)에 맞춰 자동 변환됩니다.

---

### 작업 C. 바닷길 시간계산기용 항구·소규모 선착장 추가하기 (`public/data/ports.json`)
`public/data/ports.json`의 `"ports"` 배열에 항구 또는 소규모 선착장 정보를 추가하면, **바닷길 시간계산기**의 항구 검색 모달(초성·별칭·섬 이름 검색), 지도 위 **선착장핀 표시**, 그리고 **지도 마커 드래그 500m 자동 스냅** 및 **A* 실항로 우회 계산**에 즉시 반영됩니다:

```json
{
  "id": "KR-GN-TY-BERTH-0031",
  "name": "산양 삼덕 원항 부잔교",
  "region": "통영",
  "category": "docking",
  "subCategory": "small_berth",
  "lat": 34.7968,
  "lng": 128.3842,
  "seaApproachLat": 34.7945,
  "seaApproachLng": 128.3812,
  "description": "소형 조사선 상시 접안 부잔교 · 간조 수심 2.8m",
  "aliases": ["원항선착장", "삼덕부잔교"],
  "eupmyeondong": "산양읍",
  "islandName": null,
  "portClassLabel": "소규모 선착장(부잔교)",
  "facilityType": "FLOATING_PONTOON",
  "facilityLabel": "부잔교(폰툰)",
  "minDepthMeters": 2.8,
  "tidalSensitivity": "LOW",
  "maxVesselTons": 20,
  "hazards": ["여객선 입출항 항주파 주의"],
  "connectedWaypointIds": ["WP-SAMDEOK-APPROACH"]
}
```
- `region`: `"통영"` 또는 `"거제"`
- `category`: `"port"`(정규 어항) 또는 `"docking"`(공식 접안지 및 소규모 선착장)
- `subCategory`: `"port"`, `"small_berth"`, `"official_docking"`
- 최상단의 `"snap_radius_meters": 500` 값을 조정하면 지도 위 마커 드래그 시 항구·선착장으로 자동 흡착되는 반경(미터)을 변경할 수 있습니다.

---

### 작업 D. 제보 수신 이메일 및 QGIS 공간레이어 관리 (`public/config/app_config.json`)
`public/config/app_config.json` 파일에서 운영자 이메일, 기본 해역 좌표, 선박 기본 속력, 기상 판정 기본 기준값, 공간정보 레이어 목록을 관리합니다:

```json
{
  "admin": {
    "report_recipient_email": "marine_admin@knps.or.kr",
    "report_cc_email": "field_safety@knps.or.kr",
    "department_name": "국립공원공단 해양조사팀"
  },
  "default_region": {
    "name": "경상남도 통영·거제 해역",
    "center": [34.8195, 128.552],
    "zoom": 11
  },
  "route_defaults": {
    "default_speed_knots": 15
  },
  "weather_defaults": {
    "wind_threshold_knot": {
      "good": 14,
      "moderate": 20
    },
    "wave_threshold_meter": {
      "good": 1.0,
      "moderate": 1.8
    }
  },
  "layers": [
    {
      "id": "docking",
      "name": "갯바위 접안 포인트",
      "visible": true,
      "color": "#38bdf8",
      "description": "5개 색상별 접안 안전도 및 현장 정보"
    },
    {
      "id": "national_park",
      "name": "한려해상국립공원 경계",
      "visible": true,
      "color": "#10b981",
      "url": "/data/layers/national_park.geojson",
      "description": "국립공원 관할 공원구역 경계선"
    },
    {
      "id": "protected_area",
      "name": "특별보호구역",
      "visible": true,
      "color": "#a855f7",
      "url": "/data/layers/protected_area.geojson",
      "description": "출입통제 및 해양생물 특별보호구역"
    }
  ]
}
```

- **제보 수신 이메일 변경**: `"admin"` 아래의 `"report_recipient_email"` 및 `"report_cc_email"`을 수정하면 모든 직원의 현장 제보 기본 수신처가 업데이트됩니다. (앱 내 현장 제보 창에서도 운영자가 즉시 변경 가능)
- **신규 QGIS 공간정보 레이어 추가**: QGIS에서 `EPSG:4326 (WGS84)` GeoJSON으로 내보낸 파일을 `public/data/layers/`에 업로드한 뒤, `"layers"` 배열에 항목을 한 줄 추가하면 앱 코드 수정 없이 **공간정보 레이어 체크박스**에 자동 등록됩니다.

---

## [3단계] Kakao Map API 키 및 도메인 등록 · 배포 설정 가이드

바다꼼꼬미는 **Kakao Maps SDK v3**를 기본 지도로 사용하며, 도메인 미등록이나 해상 오프라인 상황에서는 **레거시 지도(Leaflet + OpenStreetMap)**로 자동 폴백되도록 설계되어 있습니다.

### A. 카카오 개발자 콘솔 웹 도메인 등록 (필수)
카카오맵이 정상적으로 표시되려면 **카카오 개발자 콘솔(https://developers.kakao.com)**에서 아래 설정이 완료되어야 합니다:
1. 상단 메뉴 **`내 애플리케이션`** ➔ 해당 앱 선택
2. 좌측 메뉴 **`앱 설정` > `플랫폼`** ➔ **`Web 플랫폼 등록`** (또는 수정) 클릭
3. **`사이트 도메인`** 입력란에 아래 주소를 줄바꿈으로 모두 등록하고 저장합니다:
   ```text
   http://localhost:5173
   http://127.0.0.1:5173
   https://gunnysis.github.io
   ```
   *(Cloudflare Pages 등 별도 도메인 사용 시 해당 `https://...` 도메인도 함께 추가)*

### B. 환경변수(`KAKAO_MAP_API_KEY`) 설정 방법
- **로컬 개발 환경 (`.env`)**: 프로젝트 루트의 `.env` 파일에 JavaScript 키를 입력합니다:
  ```env
  KAKAO_MAP_API_KEY=발급받은_카카오_JavaScript_키
  ```
- **GitHub Pages 자동 배포 (`GitHub Actions Secret`)**:
  1. GitHub 저장소 상단 **`Settings`** ➔ 좌측 **`Secrets and variables` > `Actions`** 클릭
  2. **`New repository secret`** 버튼 클릭
  3. **Name**: `KAKAO_MAP_API_KEY` / **Secret**: `발급받은_카카오_JavaScript_키` 입력 후 **`Add secret`** 클릭
  4. `.github/workflows/deploy-pages.yml` 워크플로가 `main` 브랜치 Push마다 자동으로 `KAKAO_MAP_API_KEY`를 주입하여 빌드·배포합니다.

### C. Cloudflare Pages로 이전/병행 배포 시
| 설정 항목 | 입력할 값 | 설명 |
| :--- | :--- | :--- |
| **Production branch** | `main` | `main` 브랜치에 파일을 올릴 때마다 자동 배포 |
| **Framework preset** | `Vite` | Vite 정적 빌드 프리셋 |
| **Build command** | `npm run build` | 타입 검사, 번들링 및 Workbox `sw.js` 생성 |
| **Build output directory** | `dist` | 최종 생성된 정적 파일 폴더 (`public/_headers` 자동 적용) |
| **Environment variables** | `KAKAO_MAP_API_KEY` = `JavaScript 키` | Cloudflare Pages 대시보드 환경변수에 등록 |
