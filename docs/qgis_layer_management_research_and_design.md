# QGIS 공간정보 레이어 운영 관리 연구·점검·기획·설계

> 문서 상태: `REVIEW REQUESTED`  
> 작성일: 2026-11-09  
> 대상: 바다꼼꼬미 PWA / GitHub Pages  
> 범위: 연구·현황 점검·제품 기획·기술 설계·QA/배포 설계  
> 제외: Azure 및 기타 클라우드 백엔드, 서버 API, 공간 DB, 앱스토어 배포, 이번 단계의 기능 구현·운영 배포

## 1. 결론과 검토 요청

현재 화면의 **공간정보 레이어 관리**는 이름과 달리 등록된 레이어의 표시/숨김만 제어한다. QGIS 파일 업로드, 레이어/피처 생성·조회·수정·삭제(CRUD), 데이터 검증, 저장, 승인, 게시, 이력, 롤백은 구현되어 있지 않다.

GitHub Pages 자체에는 인증된 공유 저장소, 쓰기 API, 서버 측 권한 집행 기능이 없다. 브라우저가 외부 GitHub 인증/API를 호출하는 설계는 기술적으로 가능하지만 public-client token, 권한, 충돌, 피싱 위험 때문에 본 범위에서는 채택하지 않는다. 본 문서는 다음 **Pages-only GitOps 안**을 권고한다.

1. 운영자는 QGIS에서 원본을 관리하고 웹 배포본을 RFC 7946 GeoJSON으로 내보낸다.
2. PWA의 운영자 작업공간에서 파일을 가져와 검증·미리보기하고, 레이어 데이터셋을 로컬 초안으로 생성·조회·교체·폐기한다. 피처 속성 CRUD는 2단계 승인 범위다.
3. 변경 결과를 `게시 패키지`로 내려받는다. 이 단계까지는 IndexedDB에만 저장되며 다른 사용자에게 게시되지 않는다.
4. 운영자는 GitHub feature branch에 패키지를 업로드하고 PR을 만든다.
5. CI가 스키마, CRS, 형상, ID, 크기, 보안, 렌더링, PWA 빌드를 검사한다.
6. 승인된 PR이 `main`에 병합되면 기존 GitHub Pages workflow가 새 정적 릴리스를 배포한다.
7. 문제 발생 시 해당 데이터 커밋을 revert하고 같은 검증·배포 절차로 롤백한다.

이 방식은 운영자가 웹 화면에서 데이터를 편집하는 경험과 GitHub의 인증·승인·감사 이력을 함께 제공한다. 단, **관리 화면의 저장 버튼이 곧 운영 반영을 의미하지는 않는다.** 운영 반영은 PR 승인과 Pages 배포가 끝난 뒤에만 성립한다.

검토자는 우선 다음 결정을 승인하거나 수정해야 한다.

- MVP 입력 포맷을 `GeoJSON만`으로 제한할지 승인한다. 권고안은 GeoJSON만이며 GeoPackage 직접 읽기는 2단계다.
- 피처 속성·geometry 편집을 2단계에 포함할지 결정한다. 권고안은 MVP에서 geometry 정밀 편집을 제외하고 QGIS를 원본 편집 도구로 유지하는 것이다.
- 운영자 GitHub 권한, PR 승인자, 필수 CI check, 긴급 롤백 담당자를 지정한다.
- 실제 국립공원 경계·특별보호구역 데이터의 출처, 이용 허가, 갱신 주기와 책임자를 확정한다.

## 2. 용어와 범위

### 2.1 관리 대상

- **레이어 CRUD**: 레이어 메타데이터의 생성, 목록/상세 조회, 수정, 삭제 초안 작성
- **피처 CRUD**: 한 레이어 안의 공간 객체 및 속성 생성, 조회, 수정, 삭제 초안 작성
- **게시**: 검증된 GeoJSON과 manifest를 GitHub PR로 승인한 뒤 Pages 정적 배포물에 포함
- **로컬 저장**: 현재 브라우저의 IndexedDB에만 초안을 보존
- **운영 데이터**: `main` 병합, Pages deployment 성공, 지정된 배포 후 smoke를 통과한 데이터. 개별 사용자의 실제 수신은 CDN·서비스 워커·오프라인 상태에 따라 지연될 수 있음

### 2.2 명시적 비범위

- 다중 사용자의 실시간 공동 편집 및 잠금
- 브라우저에서 QGIS 프로젝트(`.qgz`) 전체 재현
- WMS/WFS/PostGIS 직접 연결
- PWA 내부 계정·비밀번호·RBAC 서버
- 브라우저에 저장한 장기 GitHub token을 이용한 자동 commit
- 대용량 raster, vector tile 생성, 실시간 공간 질의
- Azure를 포함한 별도 클라우드 구성

## 3. 현재 구현 팩트체크

### 3.1 현재 데이터 흐름

```text
public/config/app_config.json
          │ 앱 시작 시 1회 fetch
          ▼
useAppConfig ── layers 메모리 상태 ── LayerControlModal 표시 토글
          │
          ▼
MapView ── 각 layer.url JSON fetch ── Kakao 또는 Leaflet 렌더
```

| 항목 | 현재 상태 | 근거 | 판정 |
|---|---|---|---|
| 호스팅 | React/Vite 정적 PWA, GitHub Pages | `package.json`, `.github/workflows/deploy-pages.yml` | 확인 |
| 레이어 등록 | `app_config.json`에 3개 등록 | `public/config/app_config.json:25` | 확인 |
| 메타모델 | `id`, `name`, `visible`, `color`, `url?`, `description` | `src/types/config.ts:28` | 확인 |
| 레이어 읽기 | 설정 1회 fetch 후 URL별 JSON fetch | `src/hooks/useAppConfig.ts:56`, `src/components/MapView.tsx:132` | 확인 |
| 레이어 관리 UI | 체크박스 가시성 토글 | `src/components/notebook/LayerControlModal.tsx:59` | 확인 |
| 레이어/피처 CRUD | 업로드·생성·수정·삭제·게시 없음 | 위 UI와 hook 전체 | 미구현 |
| 변경 영속화 | 가시성도 메모리만 변경, 새로고침 시 초기화 | `src/hooks/useAppConfig.ts:101` | 미구현 |
| 인증/권한 | 로그인, 역할, 쓰기 API 없음 | 전체 의존성과 소스 점검 | 미구현 |
| 스키마/CRS 검증 | `response.json()` 이후 그대로 보관 | `src/components/MapView.tsx:142-149` | 미구현 |
| Kakao geometry | Polygon/MultiPolygon만 처리 | `src/components/map/KakaoMapCanvas.tsx:198` | 제한 |
| Leaflet geometry | `GeoJSON` 컴포넌트로 렌더 | `src/components/map/LegacyLeafletCanvas.tsx:401` | 엔진 간 불일치 |
| 스타일 | 색상 외 일부가 특정 layer ID에 하드코딩 | Kakao `:440`, Leaflet `:408` | 확장 곤란 |
| PWA 데이터 캐시 | JSON/GeoJSON에 NetworkFirst를 선언했으나 같은 파일이 precache에도 중복 등록됨 | `vite.config.ts:20-29`, `:58-85` | 실제 요청 경로·갱신 시점 실측 필요 |
| Pages 배포 | `main` push → lint/build → artifact → deploy | `.github/workflows/deploy-pages.yml:3` | 확인 |

`LayerControlModal`의 “파일을 넣고 등록하면 앱 재빌드 없이 자동 연동” 안내는 운영 절차를 충분히 설명하지 못한다. 저장소 파일 변경 후에도 commit/push, Actions build, Pages deploy가 필요하다. 이미 설치된 PWA는 서비스 워커 갱신과 재실행 시점에 따라 이전 캐시를 잠시 사용할 수 있다.

### 3.2 현재 데이터 표본 점검

2026-11-09 로컬 파일을 읽어 확인한 결과다.

| 파일 | 크기 | 피처 | geometry | ID 중복 | 최상위 `crs` |
|---|---:|---:|---|---|---|
| `national_park.geojson` | 1,302 B | 2 | Polygon | 없음 | 있음 |
| `protected_area.geojson` | 1,328 B | 2 | Polygon | 없음 | 있음 |
| `docking_points.geojson` | 46,683 B | 55 | Point | 없음 | 없음 |

두 일반 레이어는 좌표 유한성·범위와 Polygon ring 폐쇄를 통과했다. 다만 `crs` 멤버 값은 CRS84이지만 RFC 7946에서는 최상위 `crs` 멤버가 제거되었고, 두 파일의 외곽 ring 방향도 RFC 7946이 요구하는 right-hand rule과 반대인 clockwise다. 호환 parser는 winding 오류만으로 입력을 거부하지 않을 수 있어 현재 렌더링은 되지만, 게시 정규화에서는 `crs`를 제거하고 외곽 ring은 CCW, 내부 ring은 CW로 맞추며 좌표 자체가 WGS 84 경도/위도 순서인지 검증해야 한다.

현재 표본이 파싱되고 지도에 보인다는 사실은 실제 공원구역 경계의 정확성, 최신성, 법적 효력 또는 출처 허가를 증명하지 않는다. 이 네 항목은 데이터 책임자의 확인이 필요하다.

### 3.3 기준선 검증 결과

현재 사용자의 미커밋 변경을 포함한 작업 트리에서 다음 읽기/빌드 검사를 수행했다.

| 검사 | 결과 | 한계 |
|---|---|---|
| `npm ci` | lockfile 기준 clean install 통과 | npm이 low 2건, moderate 4건 보고 |
| `npm run lint` | 통과 | 데이터 의미/형상은 검사하지 않음 |
| 기본 `npm run build` | 로컬 base(`/`) build 통과 | Pages artifact 증거로 사용하지 않음 |
| `GITHUB_ACTIONS=true npm run build` | Pages base build 통과, manifest `start_url`/`scope` 모두 `/bada-kkomkkomi/` 확인 | 실제 Actions·Pages 배포·실기기는 미검증 |
| `npm audit --omit=dev --audit-level=high` | 운영 의존성 취약점 0건 | 2026-11-09 조회 시점 결과 |
| 전체 `npm audit` | low 2건, moderate 4건, high/critical 0건 | Workbox 계열 전이 의존성. 제안된 자동 수정은 PWA plugin downgrade이므로 미적용 |
| 자동 단위/E2E 테스트 | 실행 불가 | `package.json`에 test 스크립트 없음 |
| 스테이징 통합 테스트 | 증적 없음 | staging 환경/결과 파일 없음 |

따라서 현재 작업 트리는 clean install, lint, Pages-base production build를 통과한 **로컬 빌드 후보**다. 그러나 자동 데이터/E2E/PWA 테스트와 실제 Actions·Pages·실기기 검증이 없으므로 “운영 배포 준비 완료” 또는 “레이어 관리 기능 운영 검증 완료”라고 할 수는 없다. 이번 작업에서는 운영 배포를 수행하지 않았다.

### 3.4 현재 GitHub Pages 운영 상태

2026-11-09에 GitHub API와 공개 URL을 읽기 전용으로 확인했다.

- 공개 URL: `https://gunnysis.github.io/bada-kkomkkomi/`, HTTP 200
- 마지막 성공 workflow: run `42443220032`, commit `a9d300c622611acc69ab54bbddf96b44df9372ed`
- 최근 확인된 Pages workflow 3회는 성공
- 현재 로컬 작업 트리 변경은 위 공개 commit에 포함되지 않은 미배포 상태
- GitHub API 응답상 classic `main` branch protection과 repository ruleset은 없음
- `github-pages` environment는 `main` branch policy만 있고 required reviewer는 없으며 admin bypass가 가능함
- 공개 `index`, `sw.js`, `app_config.json` 응답의 `Cache-Control`은 모두 `max-age=600`
- staging/PR preview, required check, 배포 후 smoke, 승인된 rollback 기준 tag는 없음

따라서 공개 사이트가 응답한다는 사실과 최신 로컬 후보가 운영 준비되었다는 판단은 분리해야 한다. `public/_headers`는 Cloudflare Pages 형식이고 GitHub Pages가 적용하지 않으므로, 현재 문서나 운영 절차에서 no-cache, 즉시 반영, 즉시 롤백 또는 전 사용자 동시 전환을 보장해서는 안 된다.

추가로 PWA precache의 `includeAssets`와 `globPatterns` 범위가 겹쳐 일부 JSON/GeoJSON이 중복 등록되고, `globIgnores`가 `public/dev` 파일의 dist 복사까지 막지는 않아 약 4.4 MiB의 개발용 이미지가 artifact에 포함된다. 이는 기능 구현 전에 정리할 배포 P1 항목이다.

릴리스 버전도 `package.json` 1.0.0, lockfile root 0.0.0, HTML Beta 0.3, manifest v1.0, 마지막 commit 제목 v1.0.1로 일치하지 않는다. 앱 버전, 데이터 schemaVersion, layer releaseId, commit SHA를 서로 다른 필드로 정의하고 한 빌드에서 일관되게 표시해야 한다.

## 4. QGIS와 웹 배포 포맷 정책

### 4.1 권고 포맷

| 용도 | 포맷 | 정책 |
|---|---|---|
| QGIS 원본 편집 | GeoPackage(`.gpkg`) | 권고. 단일 파일, 복수 레이어, 스키마와 트랜잭션에 유리 |
| PWA 입력/게시 | RFC 7946 GeoJSON | MVP 필수. 브라우저에서 직접 검증·렌더 가능 |
| Shapefile | ZIP 묶음만 2단계 후보 | 다중 sidecar, 필드명/인코딩/타입 제약 때문에 MVP 제외 |
| QGIS 프로젝트 | `.qgz` | 심볼·프로젝트 보존용일 뿐 PWA 데이터 입력으로 사용하지 않음 |
| Raster/MBTiles/vector tile | 별도 과제 | 현재 렌더러와 Pages 용량·캐시 설계를 넘어섬 |

GeoPackage는 OGC가 정의한 SQLite 기반 단일 파일·서버리스·트랜잭션 컨테이너이므로 QGIS 원본에 적합하다. 그러나 현재 PWA는 JSON만 읽고, 브라우저에서 GeoPackage를 해석하려면 SQLite/GeoPackage WASM 계열 의존성, 큰 번들, 메모리 상한, 확장 호환성 검증이 추가된다. 사용자가 QGIS에서 GeoJSON을 내보낼 수 있으므로 MVP에는 이 복잡도를 도입하지 않는다.

### 4.2 QGIS 내보내기 계약

운영자는 QGIS에서 각 게시 레이어를 다음 조건으로 내보낸다.

- Format: `GeoJSON`
- Layer creation option: `RFC7946=YES`. 결과 파일에 `crs`가 없고 좌표가 `[longitude, latitude]`인지 다시 확인
- CRS: `RFC7946=YES`가 출력하는 WGS 84/CRS84 경도·위도. 원본 CRS가 다르면 내보내기 중 실제 재투영
- Encoding: `UTF-8`
- Coordinate order: `[longitude, latitude]`
- 좌표 정밀도 운영 정책: 소수점 이하 6자리. GDAL RFC 7946 기본 7자리와 다르므로 내보내기 옵션으로 명시하고 업무상 근거가 있을 때만 상향
- Geometry: MVP 허용 목록 안에서 레이어별 단일 계열 사용
- ID: 모든 feature의 `properties.id`는 레이어 내 고유하고 안정적인 문자열
- Geometry validity: QGIS `Check validity` 통과 후 내보내기
- 민감정보: 개인식별정보, 내부 연락처, 비공개 생태 위치 등 공개 금지 필드 제거

한국 투영 좌표계(EPSG:5179 등) 원본은 QGIS `Reproject layer` 또는 `Save Features As`의 대상 CRS 변환으로 좌표값 자체를 변환한다. `Assign projection`은 기존 좌표에 CRS 설명만 붙이고 좌표값을 바꾸지 않으므로 이 절차에 사용하지 않는다.

QGIS에서 보이는 색상·라벨·심볼은 GeoJSON만으로 완전하게 전달되지 않는다. PWA 스타일은 manifest에 별도로 명시하며, QGIS 스타일을 자동 변환한다고 가정하지 않는다.

## 5. 목표 제품 설계

### 5.1 정보 구조

기존 사용자용 레이어 토글과 운영자 편집을 분리한다.

```text
공간정보 레이어
├─ 사용자 보기 설정
│  ├─ 레이어 표시/숨김
│  └─ 범례와 갱신 버전 확인
└─ 운영자 작업공간
   ├─ 1. 가져오기
   ├─ 2. 검증 결과
   ├─ 3. 레이어/피처 편집
   ├─ 4. 변경 비교
   └─ 5. 게시 패키지 내보내기
```

운영자 작업공간은 숨겨진 URL이나 단순 비밀번호로 보안을 흉내 내지 않는다. Pages에는 서버 인증이 없으므로 누구든 화면 코드를 열 수 있다. 작업공간이 제공하는 것은 **로컬 편집 도구**이며, 실제 쓰기 권한은 GitHub branch/PR 권한이 통제한다.

### 5.2 CRUD 의미

| 기능 | PWA 작업공간 | 운영 반영 |
|---|---|---|
| Create layer | 메타데이터 + 빈 FeatureCollection 초안 | PR merge 후 |
| Read layer | 현재 운영본과 로컬 초안 조회 | 즉시 가능 |
| Update layer | Phase 2: 이름·설명·스타일·피처 속성 초안. Phase 3: geometry 초안 | PR merge 후 |
| Delete layer | 삭제 tombstone 및 참조 영향 표시 | PR merge 후 |
| Import/replace | GeoJSON을 새 버전 초안으로 가져오기 | PR merge 후 |
| Undo/discard | 로컬 change set 단위 되돌리기 | 게시 전만 즉시 |
| Rollback | 결함 commit을 되돌리는 revert 또는 known-good SHA 기반 복구 패키지 | 복구 PR merge 후 |

삭제는 즉시 파일을 없애지 않는다. manifest에서 삭제 대상과 영향받는 화면을 보여 주고, PR diff에서 GeoJSON 삭제와 참조 제거가 함께 확인될 때만 승인한다.

### 5.3 운영 워크플로

```text
QGIS 원본 편집
  → GeoJSON 내보내기
  → PWA 가져오기
  → 1차 구조/보안/CRS 검사
  → 지도 미리보기 및 로컬 CRUD
  → 변경 diff + 게시 패키지 생성
  → GitHub feature branch 업로드
  → Pull Request
  → CI 데이터/앱/PWA 검사
  → 데이터 책임자 + 코드 책임자 승인
  → main merge
  → Pages build/deploy
  → 온라인/오프라인 smoke test
```

GitHub 웹 UI 업로드가 불편한 운영자에게는 GitHub Desktop 또는 저장소 checkout 폴더에 패키지를 덮어쓰는 별도 운영 가이드를 제공할 수 있다. PWA가 저장소 token을 요구하는 방식은 제공하지 않는다.

## 6. 데이터 계약

### 6.1 manifest 분리

현재 `app_config.json`은 일반 앱 설정과 레이어 목록이 섞여 있다. 다음 구조로 레이어 catalog를 분리하는 것을 권고한다.

```text
public/data/layers/
├─ index.json
├─ national_park.v20261109-a1b2c3.geojson
└─ protected_area.v20261109-d4e5f6.geojson
```

예시 계약은 다음과 같다. 필드명은 구현 승인 후 JSON Schema와 함께 동결한다.

```json
{
  "schemaVersion": 1,
  "releaseId": "layers-2026-11-09.1",
  "generatedAt": "2026-11-09T09:00:00Z",
  "layers": [
    {
      "id": "national_park",
      "name": "한려해상국립공원 경계",
      "description": "국립공원 관할 공원구역 경계선",
      "dataUrl": "national_park.v20261109-a1b2c3.geojson",
      "dataSha256": "<64 hex characters>",
      "geometryTypes": ["Polygon", "MultiPolygon"],
      "featureIdProperty": "id",
      "defaultVisible": true,
      "style": {
        "strokeColor": "#10b981",
        "strokeWidth": 2.5,
        "strokeDash": "solid",
        "fillColor": "#10b981",
        "fillOpacity": 0.08,
        "zIndex": 20
      },
      "source": {
        "title": "<데이터셋명>",
        "organization": "<책임기관>",
        "license": "<라이선스 또는 내부 승인번호>",
        "updatedAt": "2026-11-09",
        "contact": "<공개 가능한 담당 부서>"
      }
    }
  ]
}
```

`visible`은 운영 데이터의 사실이 아니라 사용자 선호이므로 `defaultVisible`과 기기별 사용자 설정으로 분리한다. 기존 `docking`은 별도 도메인 모델과 렌더러를 사용하므로 일반 catalog로 즉시 합치지 않고, 마이그레이션 여부를 별도 승인한다.

### 6.2 FeatureCollection 규칙

- 최상위 `type`은 `FeatureCollection`이어야 한다.
- 최상위 `crs`는 허용하지 않는다. 좌표는 WGS 84, 경도/위도 순서다.
- 모든 feature는 `Feature`, `geometry`, object 타입 `properties`를 가진다.
- `properties.id`는 비어 있지 않은 문자열이며 같은 레이어에서 유일하고 버전 간 안정적이다.
- geometry 타입은 manifest 허용 목록과 일치한다.
- null geometry와 `GeometryCollection`은 MVP에서 금지한다.
- Polygon/MultiPolygon의 모든 linear ring은 최소 4개 position이고 첫 position과 마지막 position이 동일해야 한다.
- 외곽 ring은 CCW, 내부 ring은 CW로 정규화한다.
- 모든 숫자는 finite여야 하며 longitude `[-180, 180]`, latitude `[-90, 90]` 범위다.
- 대한민국/통영·거제 업무 레이어에는 별도의 허용 bbox를 설정해 축 순서 오류를 조기 탐지한다.
- 속성 key/value 크기와 깊이를 제한하고 HTML은 데이터로 취급한다.
- 렌더링 시 속성을 `innerHTML`로 삽입하지 않는다.

### 6.3 호환성과 원자성

- `schemaVersion`을 앱이 지원하지 않으면 조용히 그리지 말고 명시적 오류와 마지막 정상 release를 표시한다.
- 데이터 파일명에 release/hash를 포함해 새 파일과 이전 캐시를 구분한다.
- `index.json`은 모든 참조 파일이 CI에서 확인된 뒤 같은 Pages artifact로 배포한다.
- 앱은 manifest와 데이터의 hash를 확인하고, 하나라도 불일치하면 release 전체를 적용하지 않는다.
- 동일 세션에서 같은 layer ID의 URL이 바뀌어도 재조회하도록 `(id, dataUrl, hash)`를 캐시 키로 사용한다.
- 실패 시 레이어 일부를 새 버전으로 섞지 않는다. 마지막 완전한 release 폴백은 별도 runtime cache 또는 IndexedDB에 보존할 버전 수·용량·hash와 storage eviction 동작을 구현·검증한 뒤에만 제공한다. 현재 서비스 워커만으로는 보장되지 않는다.

## 7. 브라우저 운영자 작업공간 설계

### 7.1 가져오기

MVP는 `.geojson`과 `.json`만 받는다. 파일 선택 또는 drag-and-drop 뒤 다음 순서로 처리한다.

1. 확장자만 믿지 않고 JSON parse 가능 여부 확인
2. 파일 크기·피처 수·좌표 수·중첩 깊이 상한 검사
3. JSON Schema 검사
4. 좌표계/범위/축 순서 휴리스틱 검사
5. geometry 유형과 기본 유효성 검사
6. ID 중복 및 필수 속성 검사
7. 기존 운영본과 create/update/delete diff 계산
8. 지도 미리보기 후 운영자가 가져오기 확정

파싱과 무거운 geometry 검사는 Web Worker에서 실행해 모바일 UI 멈춤을 줄인다. 상한 초과 파일은 억지로 열지 않고 QGIS에서 단순화·분할 후 다시 내보내도록 안내한다.

초기 탐색값은 파일 5 MiB, feature 10,000개, 총 position 500,000개다. 5 MiB는 현재 Workbox의 **파일당 precache 한도**이지 안전한 브라우저 import 또는 메모리 상한이 아니다. parse·정규화·diff는 원본의 수배 메모리를 사용할 수 있으므로 지원 기기와 실제 표본으로 더 낮은 입력 상한 및 artifact 전체 크기 예산을 확정해야 한다.

### 7.2 편집 — 단계별 목표

- 레이어 목록: 검색, 상태(운영/초안/삭제 예정/오류), 최종 갱신일, 피처 수
- 레이어 편집: 이름, 설명, 기본 표시, geometry 허용 타입, 스타일, 출처/라이선스
- Phase 2 피처 표: ID 검색, 속성 필터, 추가, 복제, 속성 수정, 삭제
- Phase 3 지도 편집: Point 이동, Line/Polygon vertex 추가·이동·삭제, geometry 전체 교체
- 변경 이력: 현재 세션 command stack 기반 undo/redo
- 비교: 운영본 대비 속성/geometry/피처 수/bbox/파일 크기 변화
- 위험 경고: 대량 삭제, bbox 급변, geometry 타입 변경, 필수 필드 손실

모바일 화면에서는 정밀 vertex 편집이 어렵다. geometry 정밀 편집의 기준 도구는 계속 QGIS로 두고 PWA 편집은 긴급한 소규모 수정에 한정하는 것이 안전하다.

### 7.3 로컬 초안

초안은 IndexedDB에 다음을 저장한다.

- draft ID와 생성 시각
- 기준 운영 `releaseId`와 layer hash
- 원본 파일명 및 원본 hash
- 정규화된 FeatureCollection
- manifest 초안
- change set과 검증 결과

사진, 토큰, GitHub 자격증명은 저장하지 않는다. 게시 패키지 생성 후에도 운영자가 명시적으로 삭제하기 전까지 초안은 현재 기기에만 남으므로, “이 기기 데이터 삭제” 기능과 저장 위치 안내가 필요하다.

### 7.4 게시 패키지

ZIP 패키지 예시는 다음과 같다.

```text
layer-publication-layers-2026-11-09.1.zip
├─ public/data/layers/index.json
├─ public/data/layers/<versioned-file>.geojson
├─ change-summary.md
├─ validation-report.json
└─ upload-instructions.md
```

패키지는 저장소 루트 기준 경로, 기준 commit SHA, 기준 release ID, 파일 SHA-256, 추가/수정/삭제 목록을 포함한다. GitHub에 올린 뒤 CI가 hash와 내용을 다시 계산하므로 브라우저 검증 결과를 신뢰 경계로 사용하지 않는다.

## 8. 보안·권한·감사 설계

### 8.1 신뢰 경계

- QGIS 파일은 운영자가 선택했더라도 신뢰하지 않는 입력으로 취급한다.
- 브라우저 검증은 UX용 1차 검사이고 CI 검증이 게시 게이트다.
- Pages에 내려가는 모든 파일은 공개 정보로 간주한다.
- 목표 운영에서는 GitHub collaborator/team, branch ruleset, CODEOWNERS, PR review가 운영자 권한을 집행해야 한다. 현재는 `main` 보호가 없다.
- 목표 workflow에는 최소 권한을 사용한다. 검증 job은 `contents: read`, deploy job만 Pages 쓰기 권한을 가져야 한다. 현재 workflow는 단일 job과 workflow 전역 Pages 쓰기 권한을 사용한다.

### 8.2 금지 사항

- PAT, GitHub password, OAuth client secret을 소스·환경변수 번들·localStorage에 넣지 않는다.
- device flow를 편의상 기본 도입하지 않는다.
- 업로드 파일의 문자열을 `innerHTML`에 넣지 않는다.
- ZIP 경로를 검증하지 않고 추출하지 않는다.
- 검증 없이 `.gpkg`, `.zip`, 대용량 JSON을 메인 스레드에서 연다.
- `main` 직접 push를 정상 운영 절차로 사용하지 않는다.

### 8.3 감사 증적

최소 증적은 PR에 남긴다.

- 변경 사유와 요청 번호
- 데이터 출처·라이선스·기준일
- QGIS 내보내기 설정
- 브라우저 validation report
- CI validation/build/PWA smoke 결과
- 지도 before/after 캡처
- 데이터 책임자 및 코드 책임자 승인
- Pages workflow run URL과 배포 commit SHA
- 배포 후 온라인/오프라인 smoke 결과

## 9. CI/CD와 GitHub Pages 설계

### 9.1 권장 workflow 분리

```text
PR: layer-data-check
  ├─ install with lockfile
  ├─ manifest JSON Schema
  ├─ GeoJSON structure/CRS/ID/geometry/security
  ├─ change budget and deletion guard
  ├─ lint + typecheck + build
  ├─ map render smoke
  └─ publication report artifact

main: deploy-pages
  ├─ 위 검증 재실행 또는 검증 workflow 성공 확인
  ├─ production build
  ├─ Pages artifact upload
  └─ github-pages environment deploy
```

현재 workflow는 `main`에 push된 뒤에야 lint/build한다. 실패 배포는 막을 수 있지만 잘못된 데이터가 main에 들어오는 것은 막지 못한다. 같은 검사를 PR에서 실행하고 다음 required check를 ruleset에 등록하는 것을 권고한다.

- `layer-data-check / validate-layer-data`
- `layer-data-check / build-and-render-smoke`

실제 job 이름을 구현할 때 위 이름으로 고정한 후 ruleset을 설정해야 한다. 2026-11-09 확인 시 repository ruleset과 classic `main` protection은 없고, `github-pages` environment에는 `main` branch policy만 있으며 reviewer 승인 규칙은 없다.

### 9.2 캐시와 갱신

- 버전 파일은 immutable로 취급하고 content hash가 바뀌면 파일명도 바꾼다.
- catalog는 NetworkFirst를 사용하되 UI에 `releaseId`, 데이터 기준일, 마지막 확인 시각, 온라인/캐시 상태를 표시한다.
- 서비스 워커가 새 release를 준비한 뒤 사용자에게 새 데이터 적용을 알린다.
- 현장 작업 중 강제 reload로 입력 상태를 잃지 않도록 새 worker 활성화 시점을 통제한다.
- 오프라인 사용자는 최신 데이터가 아님을 분명히 볼 수 있어야 한다.
- `public/_headers`는 GitHub Pages에서 적용된다고 가정하지 않는다.

현재 `skipWaiting: true`와 `clientsClaim: true`는 빠른 전환에는 유리하지만 열려 있는 앱의 코드/데이터 버전 혼합 위험을 별도 실기기 시험해야 한다.

### 9.3 무중단과 롤백

GitHub Pages artifact 배포와 PWA 캐시 특성상 서버형 blue/green 배포와 같지는 않다. 여기서 무중단의 목표는 다음과 같이 정의한다.

- 배포 전 검증에 실패하면 deploy step을 실행하지 않아 기존 배포를 유지해야 한다. Pages 전환과 CDN 전파의 원자성은 별도 smoke와 롤백 리허설로 검증한다.
- 구현 후 앱의 release 원자성 검사는 새 release 일부만 보이는 상태를 차단해야 한다.
- 지도 데이터 실패 시 앱 전체가 흰 화면이 되지 않고, 검증된 이전 release가 별도 보존되어 있으면 그것으로 폴백하며 그렇지 않으면 해당 레이어를 비활성화해야 한다.
- 롤백은 결함 commit을 `git revert`한 PR을 병합하거나 승인된 known-good SHA의 내용을 새 복구 commit으로 재배포하고 정상 CI를 거쳐야 한다.
- 서비스 워커가 이전 release를 보유하는지에 의존하지 않는다. Git history와 재배포가 공식 롤백이다.

## 10. 검증 규칙과 QA 계획

### 10.1 자동 검증

| 영역 | 필수 검사 |
|---|---|
| JSON | parse, schemaVersion, 타입, 필수 필드, 예상 외 필드 정책 |
| GeoJSON | RFC 7946 구조, `crs` 금지, 좌표 순서/범위, ring closure |
| Geometry | 허용 타입, null 금지, validity, self-intersection 검사 정책 |
| Identity | layer ID/feature ID 유일성, 안정성, 안전한 파일명 |
| Referential integrity | manifest URL 존재, 삭제 파일의 잔여 참조 없음 |
| Change guard | 대량 삭제·bbox 급변·피처 수 급변 임계치 초과 시 명시 승인 |
| Security | HTML/script 문자열 표시 안전성, prototype key, 파일/깊이/좌표 상한 |
| Performance | 파일 크기, 단순화 필요성, 렌더 시간 예산 |
| App | lint, typecheck, Pages-base clean production build, 두 지도 엔진 smoke |
| PWA | `/bada-kkomkkomi/`의 manifest start_url/scope, navigationFallback, asset/data URL, service worker, online/offline, 이전 release 갱신 |
| Artifact | public allowlist, 개발 자산 제외, 파일별·전체 크기 예산, content type |
| Supply chain | action commit SHA pin, Node `engines`, lockfile/package 버전 정합, 의존성 갱신 정책 |
| Workflow security | PR validate job `contents: read`, deploy job만 Pages write, fork PR에서 secret 없는 대체 smoke |
| Post-deploy | live SHA/releaseId, catalog/hash, 각 GeoJSON parse/schema, PWA scope/SW, 구·신 캐시 전환 |

Geometry validity는 RFC 구조 검사만으로 충분하지 않다. QGIS `Check validity`와 CI의 독립 검사 결과를 모두 남기고, 서로 결과가 다르면 게시를 중단한다.

### 10.2 수동 시나리오

1. 정상 Polygon GeoJSON을 가져와 미리보기하고 패키지를 생성한다.
2. EPSG:5179 좌표를 WGS 84로 오인한 파일을 차단한다.
3. 위도/경도가 뒤집힌 파일을 bbox 규칙으로 차단한다.
4. 중복 feature ID, null geometry, 열린 Polygon ring을 차단한다.
5. Phase 2에서 1개 속성 수정이 diff에 나타나고, Phase 3에서 geometry 수정이 별도 diff로 구분된다.
6. 20% 이상 대량 삭제 시 추가 확인과 PR 경고가 나온다.
7. 동일 layer ID의 새 data URL이 현재 세션에서 다시 로드된다.
8. Kakao와 Leaflet에서 허용 geometry가 모두 렌더되고 색상·선폭·dash·opacity의 의미가 허용 오차 내에서 동등하다. 픽셀 동일성은 요구하지 않는다.
9. 오래된 초안이 새 운영 release를 기준으로 게시되지 않고 충돌을 알린다.
10. 새 Pages 배포 후 온라인 앱이 새 release를 받고, 오프라인 앱은 오래된 상태를 명시한다.
11. 잘못된 release 배포 뒤 결함 commit revert 또는 known-good SHA 기반 복구 PR로 정상 release를 재배포한다.
12. 모바일에서 대용량 입력 거부가 UI 멈춤 없이 안내된다.
13. 열린 탭의 미저장 초안, `skipWaiting`/`clientsClaim`, 갱신 중 오프라인, storage quota/eviction, cache migration을 시험한다.
14. CDN `max-age=600` 지연을 포함해 목표 복구시간 안에 rollback되고 live SHA/releaseId 및 온라인·오프라인 실기기 상태를 확인한다.

### 10.3 완료 수용 기준

- [ ] 레이어 관리 명칭이 사용자 토글과 운영자 작업공간으로 구분된다.
- [ ] 운영자는 GeoJSON을 가져와 오류 위치와 수정 가이드를 볼 수 있다.
- [ ] Phase 2에서 레이어와 피처 속성 C/R/U/D 초안을 만들고 undo/discard할 수 있다.
- [ ] Phase 3 승인 시 geometry 초안을 편집하고 QGIS round-trip 결과를 검증할 수 있다.
- [ ] 새로고침 후 IndexedDB 초안을 복원하거나 명시적으로 삭제할 수 있다.
- [ ] PWA는 GitHub token, password, client secret을 요구하거나 저장하지 않는다.
- [ ] 게시 패키지는 manifest, versioned GeoJSON, hash, diff, 검증 보고서를 포함한다.
- [ ] CI가 브라우저와 독립적으로 모든 게시 규칙을 다시 검사한다.
- [ ] 필수 status check와 PR 승인 없이는 `main`에 병합할 수 없다.
- [ ] validate job은 read-only이고 deploy job만 Pages write 권한을 가진다.
- [ ] 배포된 앱에 release ID, 데이터 기준일, 캐시/온라인 상태가 표시된다.
- [ ] Kakao/Leaflet 간 지원 geometry와 스타일의 차이가 제거되거나 명시적으로 차단된다.
- [ ] 온라인/오프라인/업데이트/롤백 실기기 증적이 남는다.
- [ ] known-good tag/release, 담당자, 목표 복구시간, rollback runbook과 리허설 증적이 남는다.
- [ ] Kakao JavaScript 키는 공개 client 식별자로 취급하고 허용 도메인 제한·회전·live domain smoke를 확인한다.
- [ ] 데이터 출처·라이선스·책임자 승인 증적이 남는다.

## 11. 단계별 구현 제안과 승인 게이트

### Phase 0 — 계약·데이터 거버넌스

- 실제 레이어 목록, schema, geometry, 공개 가능 속성 정의
- GeoJSON 및 manifest JSON Schema 확정
- 출처·라이선스·갱신 책임자 확정
- branch ruleset/CODEOWNERS/PR template 설계

**Gate A:** 제품 책임자, 데이터 책임자, 저장소 관리자가 계약 승인

### Phase 1 — 검증·게시 기반

- Node 기반 layer validation CLI와 PR workflow
- `index.json` catalog와 versioned 파일 도입
- 런타임 schemaVersion/hash/release 원자성 검사
- release/캐시 상태 UI
- 기존 두 레이어 정규화와 회귀 검증

**Gate B:** 기존 화면 회귀 없음, PR 필수 check 설정, 롤백 리허설 통과

### Phase 2 — 운영자 로컬 작업공간

- import, Web Worker validation, preview
- IndexedDB draft
- layer/feature 속성 CRUD와 diff/undo
- 게시 패키지 export와 운영 가이드

**Gate C:** 비개발 운영자 사용성 시험과 악성/대용량 파일 시험 통과

### Phase 3 — geometry 편집과 포맷 확대

- 지도 vertex 편집
- QGIS round-trip 비교
- 필요가 입증된 경우에만 GeoPackage 또는 ZIP Shapefile import 검토

**Gate D:** geometry 정확도, 모바일 성능, Kakao/Leaflet 동등성 승인

각 gate에서 승인받기 전 다음 단계 구현·운영 배포를 진행하지 않는다.

## 12. 대안 평가

| 대안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| A. 로컬 관리 화면 + PR 게시 | Pages-only, 안전한 승인/이력, 운영자 UX 개선 | 저장과 게시가 2단계 | **권고** |
| B. QGIS 편집 + GitHub 파일 업로드만 | 가장 단순, 구현량 적음 | 앱 안 CRUD 요구를 충족하지 못함 | 최소 대안 |
| C. PWA에서 GitHub API 직접 commit | 한 화면에서 게시 가능 | public client token 보안, 권한·피싱·회수·충돌 위험 | 비채택 |
| D. 인증 API + 공간 DB | 진정한 공유 CRUD/동시성 | Pages-only·무클라우드 범위 위반 | 보류 |
| E. GeoPackage를 PWA에서 직접 CRUD | QGIS 원본과 가까움 | WASM/번들/메모리/호환·게시 문제 | 2단계 조사 |

## 13. 구현 시 예상 변경 영역

아래는 설계상 예상이며 아직 구현하지 않았다.

- `src/types/`: layer catalog, manifest, validation, draft 계약
- `src/services/`: import/normalize/hash/diff/export, catalog loader
- `src/workers/`: GeoJSON 검증 worker
- `src/hooks/`: IndexedDB draft와 release 상태
- `src/components/layers/`: 사용자 레이어 설정과 운영자 작업공간 분리
- `public/data/layers/`: catalog와 versioned GeoJSON
- `scripts/`: CI용 독립 validator
- `.github/workflows/`: PR layer-data-check
- `docs/`: QGIS 내보내기, 게시, 장애/롤백 runbook

기존 사용자의 dirty worktree가 있으므로 구현 단계에서는 파일별 충돌을 다시 점검해야 한다.

## 14. 사용자 소유 작업 요청

구현 착수 전에 다음 정보를 사용자에게 요청한다. 인증이나 저장소 설정을 우회하지 않는다.

1. GitHub 저장소 visibility와 plan, 사용자에게 admin 권한이 있는지 알려 달라.
2. `main` ruleset, required reviews, required status checks를 설정할 담당자를 지정해 달라.
3. 운영자 collaborator/team과 최종 데이터 승인자를 지정해 달라.
4. 실제 QGIS 원본 샘플 1개와 목표 GeoJSON 샘플 1개를 제공해 달라. 민감정보는 제거해야 한다.
5. 공원구역/특별보호구역 데이터의 출처 URL 또는 내부 승인 문서, 라이선스, 기준일을 제공해 달라.
6. 지원 기기/브라우저와 오프라인 현장 시험 담당자를 지정해 달라.
7. MVP에 geometry 편집을 포함할지, GeoJSON-only 입력을 승인할지 결정해 달라.

## 15. 공식 근거

- [RFC 7946: The GeoJSON Format](https://www.rfc-editor.org/info/rfc7946/) — WGS 84 경도/위도, geometry 구조, `crs` 제거, 정밀도 고려
- [OGC GeoPackage Encoding Standard](https://www.geopackage.org/spec/) — SQLite 기반 단일 파일·서버리스·트랜잭션 공간 데이터 컨테이너
- [QGIS 3.44 Editing](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_vector/editing_geometry_attributes.html) — vector 편집, undo/redo와 저장 개념
- [QGIS 3.44 Check validity](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/qgis/vectorgeometry.html) — geometry 유효성 검사
- [GDAL GeoJSON driver](https://gdal.org/en/stable/drivers/vector/geojson.html) — RFC 7946 export, 좌표계와 정밀도 옵션
- [GitHub Pages 소개](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) — 정적 사이트 호스팅의 성격
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — Actions artifact와 Pages 배포 흐름
- [GitHub protected deployment checks](https://docs.github.com/en/pull-requests/concepts/deploying-code) — required status checks와 review
- [GitHub ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — PR과 status check 강제
- [GitHub OAuth app security practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app) — public client의 secret/token 보호 한계와 device flow 주의

## 16. 최종 판정

- **현재 구현:** 공간 레이어 읽기·표시·가시성 토글은 존재한다.
- **현재 미구현:** 운영자 업로드, 레이어/피처 CRUD, 영속 초안, 인증된 게시, 스키마/CRS 검증, 감사·승인·롤백 UI.
- **기술적으로 가능한 Pages-only 범위:** 로컬 CRUD 작업공간 + 게시 패키지 + GitHub PR/CI/Pages 배포.
- **Pages 자체만으로 제공할 수 없는 요구:** 별도 쓰기 API·인증 설계 없이 모든 사용자에게 즉시 반영되는 공유 CRUD. GitHub API 직접 쓰기는 기술적으로 가능하지만 본 보안·운영 정책에서는 비채택한다.
- **권고 결정:** 대안 A와 Phase 0부터 승인 후 진행한다.

본 문서는 구현 또는 운영 배포 완료 보고가 아니다. 검토·승인 후 별도 구현 작업과 GitHub 사용자 소유 설정, 실제 데이터 검증, 실기기 PWA 시험이 필요하다.
