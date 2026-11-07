# 바다꼼꼬미 [Beta 0.3] — 비개발자 운영자용 무료 자동 배포 & 데이터 운영 가이드 (`DEPLOY_GUIDE.md`)

이 문서는 코딩이나 서버 지식이 전혀 없는 현장 운영자도 **월 비용 0원(Zero-cost)**으로 **바다꼼꼬미 PWA 앱**을 운영하고, 코드는 단 한 줄도 수정하지 않은 채 **정적 데이터 파일(`GeoJSON`, `JSON`, 현장 사진)**만 교체하여 **자동 업데이트**할 수 있도록 안내하는 실전 매뉴얼입니다.

---

## 전체 자동 배포 흐름 한눈에 보기

```text
[운영자: 사진 업로드 또는 GeoJSON / JSON 파일 웹 편집]
          ↓ (GitHub 웹 화면에서 Commit changes 클릭)
[GitHub 저장소 (gunnysis/bada-kkomkkomi)]
          ↓ (GitHub Actions / Cloudflare Pages 자동 빌드 ~40초)
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
| **1. 접안 포인트 데이터** | `public/data/docking_points.geojson` | 갯바위 접안 포인트 좌표, 물때, 위험요소, 5색 표식, 사진 경로 |
| **2. 현장 접안 사진** | `public/images/docking/` | 접안 포인트 상세창에 표시할 현장 사진 파일 |
| **3. 주요 항구 사전** | `public/data/ports.json` | 바닷길 시간계산기에서 선택하거나 500m 자동 스냅될 주요 항구 목록 |
| **4. 운영자 설정 & 레이어** | `public/config/app_config.json` | 현장 제보 수신 이메일 주소, 공간정보 레이어 목록, 기상 판정 기본 기준값 |

---

### 작업 A. 현장 접안 사진 추가/교체하기 (`public/images/docking/`)
1. GitHub 저장소 웹 화면에서 **`public` ➔ `images` ➔ `docking`** 폴더로 이동합니다.
2. 우측 상단 **`Add file` ➔ `Upload files`**를 클릭해 현장 사진(예: `ty-004-rock.jpg`)을 업로드합니다.
   - **주의사항**: 파일명은 항상 **영문 소문자, 숫자, 하이픈(`-`)** 조합으로 통일하세요.

### 작업 B. 갯바위 접안 포인트 수정하기 (`public/data/docking_points.geojson`)
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
    "verified_date": "2026-11-07",
    "photos": [
      "/images/docking/ty-004-rock.jpg"
    ]
  }
}
```

> **꼭 기억할 3가지 핵심 규칙**
> 1. **위경도 순서**: `"coordinates": [경도(128.xxxx), 위도(34.xxxx)]` 순서입니다.
> 2. **마커 색상(`color`) 5종**: `"red"`, `"amber"`, `"green"`, `"blue"`, `"purple"` 중 하나만 입력합니다.
> 3. **사진 경로**: `"photos"` 배열에는 `"/images/docking/파일명"` 형태로 입력하면 배포 환경(서브경로 포함)에 맞춰 자동 변환됩니다.

### 작업 C. 바닷길 시간계산기용 항구 추가하기 (`public/data/ports.json`)
`public/data/ports.json`의 `"ports"` 배열에 항구 정보를 추가하면, **바닷길 시간계산기**의 항구 검색 모달과 **지도 마커 드래그 500m 자동 스냅**에 즉시 반영됩니다:

```json
{
  "id": "PORT-TY-007",
  "name": "욕지도 동항 (여객선터미널)",
  "region": "통영",
  "category": "주요항포구",
  "lat": 34.6368,
  "lng": 128.2682,
  "snap_radius_meters": 500,
  "description": "욕지도 본섬 주항 · 연안 여객 및 조사선 계류지"
}
```

### 작업 D. 제보 수신 이메일 및 QGIS 공간레이어 관리 (`public/config/app_config.json`)
- **제보 수신 이메일 변경**: `"field_report"` 아래의 `"admin_email"` 값을 변경하면 모든 직원의 현장 제보 기본 수신처가 즉시 업데이트됩니다. (앱 내 현장 제보 창에서도 운영자가 직접 변경 가능)
- **신규 QGIS 공간정보 레이어 추가**: QGIS에서 `EPSG:4326 (WGS84)` GeoJSON으로 내보낸 파일을 `public/data/layers/`에 업로드한 뒤, `public/config/app_config.json`의 `"spatial_layers"` 배열에 항목을 한 줄 추가하면 앱 코드 수정 없이 **공간정보 레이어 체크박스**에 자동 등록됩니다.
