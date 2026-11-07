# 바다꼼꼬미 [Beta 0.1] — 비개발자 운영자용 무료 자동 배포 & 운영 가이드 (`DEPLOY_GUIDE.md`)

이 문서는 코딩이나 서버 지식이 전혀 없는 현장 운영자도 **월 비용 0원(Zero-cost)**으로 **바다꼼꼬미 PWA 앱**을 인터넷에 배포하고, 접안 포인트 데이터(`docking_points.geojson`)와 현장 사진(`public/images/docking/`)만 교체하여 **자동 업데이트**할 수 있도록 안내하는 1~5단계 실전 매뉴얼입니다.

---

## 전체 자동 배포 흐름 한눈에 보기

```
[운영자: 사진 추가 또는 GeoJSON 메모장 수정]
          ↓ (GitHub 웹 화면에서 파일 업로드 / Commit 클릭)
[GitHub 저장소 (무료 코드·데이터 보관소)]
          ↓ (변경 감지 후 약 40초간 자동 빌드)
[Cloudflare Pages (무료 글로벌 CDN & HTTPS 호스팅)]
          ↓ (_headers + Workbox 서비스 워커 자동 갱신)
[현장 작업자 스마트폰 PWA 앱 즉시 업데이트 완료!]
```

---

## [1단계] GitHub 무료 계정 만들기 및 프로젝트 올리기

1. **[GitHub 공식 홈페이지](https://github.com)** 에 접속하여 무료 회원가입 및 로그인을 진행합니다.
2. 우측 상단 **`+`** 아이콘 클릭 ➔ **`New repository`**(새 저장소 만들기)를 클릭합니다.
3. 아래 항목만 입력합니다:
   - **Repository name**: `bada-kkomkkomi`
   - **Public / Private**: `Private`(비공개 권장 — Cloudflare Pages 무료 플랜에서도 비공개 저장소 자동 배포를 완벽히 지원합니다)
4. 하단 초록색 **`Create repository`** 버튼을 클릭합니다.
5. 내 PC의 `bada-kkomkkomi` 폴더에서 아래 명령어를 한 번만 실행하거나 **GitHub Desktop** 프로그램으로 폴더를 업로드합니다:

```bash
git init
git add .
git commit -m "feat: 바다꼼꼬미 Beta 0.1 초기 구축"
git branch -M main
git remote add origin https://github.com/<내-깃허브-아이디>/bada-kkomkkomi.git
git push -u origin main
```

---

## [2단계] Cloudflare Pages에 GitHub 저장소 연결하기 (최초 1회)

1. **[Cloudflare 대시보드](https://dash.cloudflare.com)** 에 무료 가입 후 로그인합니다.
2. 왼쪽 메뉴에서 **`Workers & Pages`** (또는 **`Compute (Workers) > Pages`**)를 클릭합니다.
3. **`Create`** 버튼 클릭 ➔ 상단 탭에서 **`Pages`** 선택 ➔ **`Connect to Git`**(Git에 연결)을 클릭합니다.
4. **`GitHub`** 계정을 연결하고 방금 만든 **`bada-kkomkkomi`** 저장소를 선택한 뒤 **`Begin setup`**을 클릭합니다.

---

## [3단계] 빌드 설정 입력 및 첫 배포 실행하기

Cloudflare Pages의 **Set up builds and deployments** 화면에서 아래 표와 **똑같이** 입력합니다.

| 설정 항목 (항목명) | 입력할 값 (복사해서 붙여넣기) | 설명 |
| :--- | :--- | :--- |
| **Project name** | `bada-kkomkkomi` | 배포 주소가 `https://bada-kkomkkomi.pages.dev`가 됩니다 |
| **Production branch** | `main` | `main` 브랜치에 파일을 올릴 때마다 자동 배포됩니다 |
| **Framework preset** | `Vite` | 선택 시 아래 두 항목이 자동으로 채워집니다 |
| **Build command** | `npm run build` | 앱을 빌드하고 오프라인 서비스 워커(`sw.js`)를 생성합니다 |
| **Build output directory** | `dist` | 최종 생성된 정적 파일 폴더입니다 |

1. 입력을 확인한 후 하단 **`Save and Deploy`** 버튼을 클릭합니다.
2. 약 **40초~1분** 뒤 `Success! Your site is live!` 메시지와 함께 무료 HTTPS 주소(`https://bada-kkomkkomi.pages.dev`)가 발급됩니다.

---

## [4단계] 스마트폰 홈 화면에 '바다꼼꼬미' PWA 앱 설치하기

현장 출항 전 스마트폰에서 아래 방법으로 설치하면, 바다 한가운데(통신 음영지역·오프라인)에서도 앱이 실행됩니다.

### Android (갤럭시 · Chrome 브라우저)
1. Chrome 앱으로 배포 주소(`https://bada-kkomkkomi.pages.dev`)에 접속합니다.
2. 화면 하단 **`홈 화면에 바다꼼꼬미 추가`** 배너를 누르거나, 우측 상단 메뉴(`⋮`) ➔ **`앱 설치`**를 탭합니다.

### iPhone / iPad (Safari 브라우저)
1. Safari 앱으로 배포 주소에 접속합니다.
2. 하단 중앙 **`공유`** 버튼(네모 위 화살표)을 탭합니다.
3. 메뉴를 아래로 내려 **`홈 화면에 추가`** ➔ 우측 상단 **`추가`**를 탭합니다.

---

## [5단계] 비개발자 운영자의 일상 업데이트 방법 (코드 수정 0줄!)

새로운 접안 포인트를 추가하거나 위험 요소·사진을 바꿀 때는 **코드(`.tsx`)를 전혀 건드리지 않고** 아래 2개 폴더만 수정합니다.

### 작업 A. 현장 접안 사진 추가/교체하기
1. GitHub 저장소 웹 화면에서 **`public` ➔ `images` ➔ `docking`** 폴더로 이동합니다.
2. 우측 상단 **`Add file` ➔ `Upload files`**를 클릭해 스마트폰으로 찍은 현장 사진(예: `ty-003-pier.jpg`)을 끌어다 놓습니다.
   - **주의사항 (대소문자 일관성)**: 서버는 대소문자를 엄격히 구분하므로 파일명은 항상 **영문 소문자, 숫자, 하이픈(`-`)** 조합(예: `ty-003-pier.jpg`)으로 통일하세요.

### 작업 B. 접안 포인트 정보(`docking_points.geojson`) 수정하기
1. GitHub 저장소에서 **`public/data/docking_points.geojson`** 파일을 클릭한 뒤 우측 상단 **연필 아이콘(`Edit this file`)**을 클릭합니다.
2. 아래 양식을 복사해 `"features": [ ... ]` 안에 붙여넣고 내용을 수정합니다:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [128.4278, 34.8378]
  },
  "properties": {
    "id": "TY-003",
    "name": "통영 산양읍 삼덕항 물양장",
    "purpose": "연안 어장 환경조사 및 잠수장비 하역",
    "tide_info": "간조 시 수심 1.8m 확보, 남서풍 유입 시 파랑 주의",
    "hazard": "물양장 북측 끝단 수중 콘크리트 블록 돌출 — 선수 접안 금지",
    "color": "amber",
    "verified_date": "2026-11-07",
    "photos": [
      "/images/docking/ty-003-pier.jpg"
    ]
  }
}
```

> **꼭 기억할 3가지 핵심 규칙**
> 1. **위경도 순서**: `"coordinates": [경도(128.xxxx), 위도(34.xxxx)]` 순서입니다. (128로 시작하는 숫자가 항상 앞!)
> 2. **마커 색상(`color`) 5종**: `"red"`(위험주의), `"amber"`(조석주의), `"green"`(안전접안), `"blue"`(전용부두), `"purple"`(비상거점) 중 하나만 입력합니다.
> 3. **저장 및 자동 배포**: 수정 후 우측 상단 초록색 **`Commit changes...`** 버튼을 누르면 **약 40초 뒤 전국 모든 현장 요원의 앱에 자동으로 최신 데이터가 반영**됩니다!
