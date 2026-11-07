# 바다꼼꼬미 (Bada-Kkomkkomi) [Beta 0.3]

해양 현장업무 지원 오프라인 우선(Offline-First) PWA 웹 애플리케이션입니다.
백엔드 서버나 외부 유료 DB 없이 **순수 정적 데이터(`GeoJSON`, `JSON`, 로컬 이미지) 교체와 Git Push만으로 무상(Zero-cost) 운영 및 자동 배포**되도록 설계되었습니다.

- **라이브 배포 URL (GitHub Pages)**: https://gunnysis.github.io/bada-kkomkkomi/
- **저장소**: https://github.com/gunnysis/bada-kkomkkomi

---

## 주요 기능 아키텍처 (Beta 0.3)

### 1. 꼬미의 바다수첩 (`3.1`)
- **A. 갯바위 접안정보**: QGIS에서 제작한 `public/data/docking_points.geojson` 포인트를 5색 전술 마커(`red`, `amber`, `green`, `blue`, `purple`)로 지도 위에 렌더링하고, 색상별 필터·하단 바텀시트·CSS Scroll Snap 현장 사진 캐러셀을 제공합니다.
- **B. 공간정보 레이어**: `public/config/app_config.json`에 등록된 QGIS 폴리곤 레이어(국립공원 경계, 특별보호구역 등)를 동적 로드하고 개별 체크박스로 표시/숨김을 전환합니다.
- **C. 현장정보 제보 (모듈형 이메일 디스패처)**: 접안지 상세 또는 지도 임의 위치 선택을 통해 현장 사진·위경도 좌표·메모를 담은 표준 제보 전문을 생성하고, 운영자 설정 이메일(`admin_email`)로 `mailto:` 발송 및 클립보드 복사를 수행합니다.
- **D. 개인 상괭이 관찰 기록**: 지도 클릭 좌표에 관찰 일시·개체수(기본 1마리)를 기기 내부(`localStorage`)에 저장하고 전용 상괭이 마커로 표시/수정/삭제합니다.

### 2. 바닷길 콕콕 (`3.2`)
- **A/B. 듀얼 모드 상단 탭**: `시간계산`과 `기상상태판정` 독립 모드를 상단 탭으로 즉시 전환합니다.
- **C. 바닷길 시간계산기 (항구 & 좌표 양방향 동기화 + 500m 스마트 스냅)**:
  - **항구·접안지 검색 모달 (`PortSelectModal`)**: 통영·거제 주요 항구(`public/data/ports.json`) 및 공식 접안지(`docking_points.geojson`)를 검색·선택하거나 현재 선박 GPS 위치를 출발/경유/목적지로 1-Tap 지정합니다.
  - **지도 마커 드래그 & 500m 스마트 스냅 (`resolveSmartWaypoint`)**: 지도 위 출발(`출발`)·경유(`경유N`)·도착(`도착`) 마커를 드래그하거나 지도를 탭하면 Haversine 거리 500m 이내의 공식 항구/접안지로 자동 스냅(`⚓ 항구 자동스냅`)되며, 반경 밖 해상은 `해상 지정점 (34.8125°N, 128.4312°E)`으로 양방향 실시간 동기화됩니다.
  - **구간별 소요시간·거리·방위각(Bearing) 배지**: 지도 폴리라인 각 구간 중점에 `14분 · 3.5NM (142°SE)` 형태의 고대비 캡슐 배지를 표시합니다.
  - **선박 속도 프리셋 & 패널 접기/펼치기**: `10kn`, `15kn`, `20kn`, `28kn` 원터치 프리셋과 하단 HUD 접기/펼치기 토글을 지원합니다.
- **D. 해상 기상상태 판정**: Open-Meteo Marine & Forecast API를 연동하여 선택한 해역의 시간대별 풍속(`m/s`)·파고(`m`)를 조회하고 3단계(`좋음`/`보통`/`나쁨` + 데이터 결측 시 `판정불가`) 안전 등급을 판정합니다.

---

## 비개발자 운영자용 데이터 폴더 구조

```text
public/
├── config/
│   └── app_config.json            # 운영자 수신 이메일, QGIS 공간레이어 목록, 기본 기상 임계치
├── data/
│   ├── docking_points.geojson     # 갯바위 접안 포인트 (5색 마커 및 현장 정보)
│   ├── ports.json                 # 통영·거제 주요 항구 사전 (500m 자동 스냅 기준점)
│   └── layers/
│       ├── national_park_boundary.geojson  # 국립공원 경계 폴리곤
│       └── special_protection_zone.geojson # 특별보호구역 폴리곤
└── images/
    └── docking/                   # 현장 접안지 사진 파일 보관 폴더
```

상세한 비개발자 운영 및 배포 절차는 [`DEPLOY_GUIDE.md`](./DEPLOY_GUIDE.md)를 참고하세요.

---

## 로컬 개발 및 빌드 검증

```bash
# 의존성 설치
npm install

# 린트 검사 (oxlint 116 rules)
npm run lint

# 프로덕션 빌드 (TypeScript 타입 검증 + Vite 번들링 + Workbox PWA 프리캐시)
npm run build

# 로컬 개발 서버 실행
npm run dev
```
