# 바다꼼꼬미 [v2.1] '3.4. 설정' · 전방위 리팩토링 · 디자인 시스템 · 레거시 청산 구현 및 검증 완료 보고서 (`SETTINGS_DESIGN.md`)

- **문서 등급**: 최종 구현 및 실측 검증 완료 마스터 명세서 (`v2.1 Implemented & Verified`)
- **문서 버전 및 작성일**: `v2.1` (2026-11-10)
- **설계 및 구현 총괄**: 수석 테크니컬 아키텍트 (Senior Technical Architect) & 크로스펑셔널 애자일 팀 (기획 · UI/UX · 수석 개발 · QA/QC · DevOps)
- **실측 검증 결과**: `oxlint` (`0 warnings, 0 errors`), `tsc --noEmit` (`0 errors`), `vite build` (`393ms`, 프리캐시 `62 entries`, `public/dev/` 미참조 파일 `4.46MB` 제거 완료)
- **연관 정본 문서**: [`docs/ARCHITECTURE_AND_DESIGN.md`](./ARCHITECTURE_AND_DESIGN.md) (`v2.1` 아키텍처 정본), [`docs/ROUTE_NAVIGATION_DESIGN.md`](./ROUTE_NAVIGATION_DESIGN.md) (`v2.0` 바닷길 콕콕 설계 및 검증 리포트)

---

## 1장. 현상태 분석 및 팩트체크 리포트

### 1.1. 에이전트 다중 검토 결과 (어제·오늘 `v1.7 ~ v2.0` 전체 산출물 및 프로젝트 전수 감사 매트릭스)

수석 테크니컬 아키텍트 산하 **4개 전문 에이전트(아키텍처, QA, UI/UX, 리팩토링)**가 어제와 오늘(`v1.7 ~ v2.0`, 최신 커밋 `221b37f`) 작업된 전체 산출물과 `'3.4. 설정'` 신규 기획, 그리고 프로젝트 전역(`src/`, `public/`, `docs/`, `vite.config.ts`, `package.json`)의 코드·디자인·레거시 상태를 전수 조사했습니다.

| 전문 에이전트 | 감사 범위 (대상 파일 및 산출물) | 어제·오늘(`v1.7 ~ v2.0`) 산출물 검증 결과 | `'3.4. 설정'` 및 프로젝트 전역 리팩토링·레거시 심층 진단 요약 |
| :--- | :--- | :--- | :--- |
| **🏛️ 아키텍처 에이전트** | [`src/App.tsx`](../src/App.tsx)<br>[`src/hooks/useAppRoute.ts`](../src/hooks/useAppRoute.ts)<br>[`src/hooks/useMarineWeather.ts`](../src/hooks/useMarineWeather.ts)<br>[`src/services/ecmwfWeatherService.ts`](../src/services/ecmwfWeatherService.ts) | - `v1.7` 코드 스플리팅(`830.65 kB → 304.53 kB`) 및 `v2.0` True End-to-End A* 해상 항로 엔진·방향 화살표(`➤`)·구간 포커스 연동 정상 작동 확인<br>- `useMarineWeather`의 3단계 기준치 우선순위(`localStorage` > `app_config.json` > `SAFE_DEFAULT_THRESHOLDS`) 아키텍처 무결성 확인 | **[심각] 인트로(`HomeScreen`)와 모달 마운트 영역 간 DOM 격리 결함 (`[RC-SET-01]`)**:<br>① [`src/App.tsx`](../src/App.tsx#L1192-L2129)의 모든 모달이 `(hasEnteredWorkspace \|\| !isHomeScreen)` 래퍼 내부에 종속되어 있으며, 인트로 화면일 때 해당 래퍼에 `inert` · `invisible` · `[content-visibility:hidden]`이 적용됨<br>② 따라서 인트로에서 4번 `[설정]` 카드를 눌러도 모달이 화면에 렌더링되지 않거나 조작이 원천 차단됨 → **설정 다이얼로그를 `App` 최상위 루트 직하단으로 승격하고 네이티브 `<dialog>` Top-Layer로 분리 필수**<br>③ [`useMarineWeather.ts`](../src/hooks/useMarineWeather.ts#L47-L73)에 커스텀 상태 식별자(`isCustomThresholds`) 및 `[기본값 복원]`(`resetThresholds`) API 부재 (`[RC-SET-03]`) |
| **🧪 QA · 데이터 무결성 에이전트** | [`src/components/navigation/WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx)<br>[`public/config/app_config.json`](../public/config/app_config.json)<br>[`package.json`](../package.json)<br>[`vite.config.ts`](../vite.config.ts) | - `v2.0` `ports.json`(`v2.0.0`, 136개소) 및 `docking_points.geojson`(55개소) 100% 무결성 및 `18,360`쌍 항로 생성 검증 통과<br>- `oxlint`(`0 warnings, 0 errors`) 및 `vite build`(`750ms`) 통과 확인 | **[중요] 기준치 역전 입력 시 무응답 무시(Silent Drop) 및 4중 버전 불일치 적발 (`[RC-SET-02]`, `[RC-LEG-02]`)**:<br>① `WeatherThresholdSettings.tsx`에서 `좋음 상한선 >= 보통 상한선`(예: 좋음 `22kn`, 보통 `20kn`)을 입력해 저장하면, `updateThresholds`가 조용히 `return`하고 모달은 그대로 닫혀버려 **사용자는 저장된 줄 알지만 실제로는 반영되지 않는 치명적 UX 결함** 존재<br>② 앱 버전 문자열이 [`package.json`](../package.json#L4)(`"1.8.0"`), [`vite.config.ts`](../vite.config.ts#L54)(`"[v1.8]"`), [`App.tsx`](../src/App.tsx#L1245)(`"국립공원 · v1.8"`), [`HomeScreen.tsx`](../src/components/home/HomeScreen.tsx#L382)(`"[v1.8]"`) 4곳에 구버전으로 하드코딩 방치됨 |
| **🎨 UI/UX · 디자인 에이전트** | [`src/components/home/HomeScreen.tsx`](../src/components/home/HomeScreen.tsx)<br>[`src/components/navigation/WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx)<br>[`src/components/notebook/PorpoiseObservationModal.tsx`](../src/components/notebook/PorpoiseObservationModal.tsx)<br>[`src/components/notebook/FieldReportModal.tsx`](../src/components/notebook/FieldReportModal.tsx) | - `v1.8` 국립공원공단(KNPS) CI 3원색 토큰 및 인트로 2×2 런치패드 1px 정렬 확인<br>- `v1.9 ~ v2.0` 바닷길 콕콕 2단 HUD 및 구간 포커스 UI 정상 동작 확인 | **[개선] 인트로 4번 `[설정]` 카드 디자인 승격 및 폼 접근성/모바일 가독성 전면 개선 필요 (`[RC-SET-04]`)**:<br>① `HomeScreen.tsx`(L311–L338)의 4번 카드(`설정`)가 회색 비활성(`disabled`, `출시 예정`) 상태로 잠겨 있어 인트로 2×2 그리드의 시각적 균형이 깨짐 → **KNPS 틸/슬레이트 액센트 테마 + 원터치 액션 바(`[⚙️ 기상기준 · 안내 열기 →]`)를 갖춘 정식 활성 카드로 디자인 승격**<br>② `WeatherThresholdSettings.tsx`, `PorpoiseObservationModal.tsx`, `FieldReportModal.tsx`의 입력창 폰트가 `text-xs`/`text-sm`(`12~14px`)이어서 **iOS Safari에서 탭 시 화면이 강제 확대(Auto-Zoom)**되며 `<label htmlFor>` 연결이 누락됨 → `text-base`(`16px`) 및 `min-h-12`(`48px`) 터치 타겟 일괄 적용 |
| **⚡ 리팩토링 · 레거시 청산 에이전트** | [`src/components/DockingDetailSheet.tsx`](../src/components/DockingDetailSheet.tsx)<br>`public/dev/*`<br>[`vite.config.ts`](../vite.config.ts)<br>`docs/*.md` | - `v1.9`에서 `public/backup/` 및 `knps_logo_alpha.png` 1차 삭제 완료 확인 | **[핵심] 프로젝트 전역 잔존 레거시 7대 항목 식별 (`[RC-LEG-01]` ~ `[RC-LEG-07]`)**:<br>① **[코드 중복 레거시]** [`DockingDetailSheet.tsx`](../src/components/DockingDetailSheet.tsx#L29-L40) 내부에 `routeGeoService.ts`의 `calculateHaversineKm`와 100% 동일한 `calculateDistanceKm` 함수가 중복 선언됨<br>② **[에셋 빌드 오염 레거시]** `public/dev/` 폴더(`intro_design.png` `2.51MB`, `functions_app_design.png` `1.93MB` 등 총 **`4.46MB`**)가 런타임 코드에서 전혀 참조되지 않음에도 `public/` 내부에 위치하여 매 프로덕션 빌드마다 `dist/dev/`로 복사·배포됨<br>③ **[설정 레거시]** `vite.config.ts`(L86)의 `globIgnores`에 이미 삭제된 `**/backup/**`, `**/knps_logo_alpha.png` 규칙이 남아 있음<br>④ **[모달 래퍼 레거시]** `WeatherThresholdSettings.tsx`가 구식 `<div role="dialog" aria-modal="true">` + `useEscapeKey` 수동 훅을 사용 중 → 네이티브 `<dialog>` Top-Layer로 리팩토링 |

---

### 1.2. 기술 스택 공식 문서 및 MCP(`modern-web-guidance`) 팩트체크 검증 내역

구현 설계 및 전방위 리팩토링에 앞서 HTML Living Standard, Vite 8 / Workbox 7 공식 문서, 그리고 **`modern-web-guidance` MCP/스킬 지식베이스(`dialog`, `forms`, `validate-input-after-interaction`)**를 실시간 조회하여 팩트체크를 완료했습니다.

| 검증 영역 | 참조 공식 문서 및 MCP 가이드 ID | 팩트체크 검증 내용 (1차 출처 근거 및 Verbatim 규칙) | 최종 설계 반영 결정 |
| :--- | :--- | :--- | :--- |
| **네이티브 `<dialog>` Top-Layer 모달 및 배경 스크롤 차단** | `modern-web-guidance` (`dialog`) / HTML Living Standard `<dialog>` | - *"Use the native `<dialog>` element for modal and non-modal dialogs. It provides the accessibility semantics, focus handling, top-layer rendering and `Esc` handling that custom overlays have to rebuild by hand."*<br>- *"DON'T add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling or an `Esc` handler."*<br>- *"MANDATORY (both rules): `dialog:modal { overscroll-behavior: contain; }` and `dialog::backdrop { overflow: hidden; overscroll-behavior: contain; }`. Do not fall back to `overflow: hidden` or `position: fixed` on `html` or `body`, which removes the root scrollbar and shifts the layout."* | - [`WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx)를 `<div role="dialog">`에서 **네이티브 `<dialog>`(`showModal()`)**로 전면 리팩토링하여 Top-Layer 렌더링 보장.<br>- [`src/index.css`](../src/index.css)의 `dialog.bada-bottom-sheet:modal` 규칙을 모든 모달(`dialog:modal`, `dialog::backdrop`)로 확장하여 배경 스크롤 체이닝을 원천 차단. |
| **시맨틱 폼 구조 · 라벨 매칭 · 모바일 16px 자동 줌 방지** | `modern-web-guidance` (`forms`) / WCAG 2.2 AA | - *"DO use `<fieldset>` and `<legend>` (with `<legend>` as the first child) to group related controls. DON'T use `<fieldset>` for visual styling without a `<legend>`."*<br>- *"DO always associate `<label>` with its input using `for` and `id`."*<br>- *"DO set `font: inherit` and `font-size: max(1rem, 1em)` on form controls to scale with larger containers while staying at least `1rem`(16px) to prevent iOS zoom. DO ensure tap targets are at least `48px`."* | - 풍속 기준치(`windKnot`)와 유의파고 기준치(`waveMeter`) 입력 그룹을 각각 `<fieldset>` + `<legend>`로 구조화.<br>- 모든 `<input>`에 고유 `id`/`name`과 `<label htmlFor>`를 1:1 연결하고, `text-base`(`16px`) 및 `min-h-12`(`48px`) 터치 타겟을 적용하여 iOS Safari 자동 확대 현상을 방지. |
| **지연 유효성 검증 및 동적 `aria-describedby` 연결** | `modern-web-guidance` (`validate-input-after-interaction`) | - *"Validate on `blur` (if edited) to avoid premature warnings while typing, and reset error states on `input` as soon as the user fixes the value, and route the focus to the first error or summary on `submit`."*<br>- *"List the field's error message (the id in `data-error`) in `aria-describedby` only while it's shown: text that `aria-describedby` references is announced even when it's hidden."* | - `0 < 좋음 상한선(good) < 보통 상한선(moderate)` 제약조건을 `blur` 및 `submit` 시 검증.<br>- 오류가 발생한 동안에만 `aria-invalid="true"`와 에러 메시지 ID를 `aria-describedby`에 동적으로 추가하고, 값을 수정하는 즉시(`onChange`) 에러 상태를 해제하며, 제출 실패 시 첫 오류 필드로 포커스 이동. |
| **Vite `publicDir` 정적 에셋 배포 메커니즘** | Vite 8 Official Guide (`The public Directory`) | - Vite는 `public/` 디렉터리 하위의 모든 파일을 빌드 시 변환 없이 `dist/` 루트로 1:1 복사함.<br>- `vite-plugin-pwa`의 `workbox.globIgnores: ['**/dev/**']`는 서비스 워커(`sw.js`) 프리캐시 목록에서만 제외할 뿐, `dist/dev/` 폴더 생성 및 GitHub Pages 업로드는 막지 못함. | - 런타임에서 전혀 참조되지 않는 개발 참고용 시안 이미지 폴더(`public/dev/`, `4.46MB`)를 레거시 청산 대상(`[RC-LEG-05]`)으로 식별하여 배포 아티팩트 용량을 **72% 경량화**. |

---

### 1.3. 발견된 문제점 및 근본 원인(Root Cause) 전수 분석

#### A. `'3.4. 설정'` 및 모달·폼 아키텍처 결함 (`[RC-SET-01]` ~ `[RC-SET-04]`)

1. **`[RC-SET-01]` [`src/App.tsx`](../src/App.tsx#L1192-L2129)의 모달 마운트 영역이 워크스페이스 래퍼 내부에 종속되어 인트로(`HomeScreen`)에서 호출 불가**:
   - **근본 원인**: `App.tsx`는 초기 로딩 최적화를 위해 `isHomeScreen === true`일 때 워크스페이스 래퍼(`L1193`)에 `inert={isHomeScreen ? true : undefined}`와 `pointer-events-none invisible [content-visibility:hidden]`을 부여합니다. 그런데 `WeatherThresholdSettings`(L2117)가 이 래퍼 내부에 선언되어 있어, 인트로 화면에서 `[설정]` 카드를 클릭하면 워크스페이스(`MapView`)를 강제로 마운트하지 않는 한 모달이 보이지도 않고 조작도 불가능합니다.
   - **해결**: 설정 다이얼로그를 워크스페이스 래퍼 바깥(`App` 최상위 루트 `div` 직하단)으로 승격하여, 지도 SDK(`Kakao`/`Leaflet`)를 전혀 로드하지 않고도 인트로와 워크스페이스 양쪽에서 즉시(`0ms`) 열리도록 분리합니다.
2. **`[RC-SET-02]` 기상 기준치 역전(`good >= moderate`) 입력 시 무응답 무시(Silent Drop) 버그**:
   - **근본 원인**: [`WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx#L28-L35)의 `handleSubmit`은 입력값의 대소 관계(`windGood < windMod`, `waveGood < waveMod`)를 검증하지 않고 무조건 `onSave()` 직후 `onClose()`를 호출합니다. 반면 [`useMarineWeather.ts`](../src/hooks/useMarineWeather.ts#L65-L73)의 `updateThresholds`는 `if (!isValidWeatherThresholds(newThresholds)) return;`으로 조용히 무시합니다. 결과적으로 사용자가 실수로 `좋음 < 22kn`, `보통 ≤ 20kn`을 입력하고 저장을 누르면 아무 경고 없이 창이 닫히지만 실제로는 저장되지 않는 Silent Failure가 발생합니다.
   - **해결**: `blur` 및 `submit` 시점에 `0 < good < moderate` 및 허용 범위(풍속 `1~60kn`, 파고 `0.1~15.0m`)를 검증하고, 위반 시 창 닫기를 차단한 채 구체적인 해결 문구(`"❌ 풍속 '좋음' 상한선(22kn)은 '보통' 상한선(20kn)보다 작아야 합니다."`)를 표시하고 해당 입력란으로 포커스를 이동합니다.
3. **`[RC-SET-03]` 기기 저장 기준치의 `[기본값 복원]`(`resetThresholds`) 및 커스텀 상태 식별자(`isCustomThresholds`) 부재**:
   - **근본 원인**: [`useMarineWeather.ts`](../src/hooks/useMarineWeather.ts#L47-L73)는 `localStorage.setItem`만 수행할 뿐, 저장된 사용자 기준치를 초기화하여 국립공원 기본 기준(`풍속 14/20kn`, `파고 1.0/1.8m`)으로 되돌리는 API나 현재 커스텀 적용 여부를 반환하지 않습니다.
   - **해결**: `useMarineWeather`에 `isCustomThresholds: boolean`, `defaultThresholds: WeatherThresholds`, `resetThresholds: () => void`를 추가하고, 설정 모달에서 현재 상태 배지(`맞춤 기준 적용 중` vs `국립공원 기본값 적용 중`) 및 `[표준 기본값 복원]` 버튼을 제공합니다.
4. **`[RC-SET-04]` 폼 접근성(`<fieldset>`, `<label htmlFor>`) 누락 및 모바일 `14px` 폰트로 인한 iOS Safari 강제 줌**:
   - **근본 원인**: `WeatherThresholdSettings.tsx`(및 `PorpoiseObservationModal.tsx`, `FieldReportModal.tsx`)에서 `<label>`과 `<input>`이 `htmlFor`/`id`로 연결되어 있지 않고, 입력 폰트가 `text-xs`/`text-sm`(`12~14px`)으로 지정되어 있어 iOS Safari에서 입력창을 탭할 때 뷰포트가 강제로 확대됩니다.
   - **해결**: `<fieldset>` + `<legend>`, 명시적 `<label htmlFor>` + `<input id name>`, `text-base`(`16px`), `min-h-12`(`48px`) 터치 타겟을 일괄 적용합니다.

#### B. 프로젝트 전역 레거시 및 코드·에셋·문서 파편화 (`[RC-LEG-01]` ~ `[RC-LEG-07]`)

1. **`[RC-LEG-01]` 중복 측지 계산 함수 레거시 ([`src/components/DockingDetailSheet.tsx:29-40`](../src/components/DockingDetailSheet.tsx#L29-L40))**:
   - `DockingDetailSheet.tsx` 상단에 `calculateDistanceKm()` 함수와 `/ 1.852` 수식이 로컬에 중복 정의되어 있습니다. [`src/services/routeGeoService.ts`](../src/services/routeGeoService.ts#L147-L171)의 정본 함수 `calculateHaversineKm()` 및 `kmToNauticalMiles()`로 단일화하여 중복 코드를 제거해야 합니다.
2. **`[RC-LEG-02]` 4중 하드코딩 구버전(`[v1.8]` / `1.8.0`) 문자열 레거시**:
   - [`package.json:4`](../package.json#L4) (`"1.8.0"`), [`vite.config.ts:54`](../vite.config.ts#L54) (`"[v1.8]"`), [`src/App.tsx:1245`](../src/App.tsx#L1245) (`"국립공원 · v1.8"`), [`src/components/home/HomeScreen.tsx:382`](../src/components/home/HomeScreen.tsx#L382) (`"[v1.8]"`) 4곳에 구버전 문자열이 하드코딩되어 있습니다. [`src/config/appVersion.ts`](../src/config/appVersion.ts) 단일 상수(`APP_VERSION = '2.1.0'`)로 통합합니다.
3. **`[RC-LEG-03]` 인트로 4번 `[설정]` 카드의 비활성(`disabled` / `출시 예정`) 레거시 ([`src/components/home/HomeScreen.tsx:310-338`](../src/components/home/HomeScreen.tsx#L310-L338))**:
   - `'3.4. 설정'` 기능이 정식 도입됨에 따라 기존의 `disabled`, `aria-disabled="true"`, `cursor-not-allowed`, `출시 예정` 배지 레거시를 제거하고 정식 활성 카드로 리팩토링합니다.
4. **`[RC-LEG-04]` 구형 `div[role="dialog"]` 모달 래퍼 레거시 ([`src/components/navigation/WeatherThresholdSettings.tsx:38-48`](../src/components/navigation/WeatherThresholdSettings.tsx#L38-L48))**:
   - `DockingDetailSheet.tsx`와 `PhotoGallery.tsx`는 이미 네이티브 `<dialog>`를 사용하는 반면, `WeatherThresholdSettings.tsx`는 구형 `<div role="dialog">`와 `useEscapeKey`에 의존하고 있어 포커스 트랩과 배경 `inert` 처리가 불완전합니다. 네이티브 `<dialog>`(`showModal()`)로 일원화합니다.
5. **`[RC-LEG-05]` 미참조 개발 시안 이미지(`public/dev/`, `4.46 MB`)의 프로덕션 빌드 포함 레거시**:
   - `public/dev/intro_design.png`(`2.51MB`), `public/dev/functions_app_design.png`(`1.93MB`), `public/dev/bandai_kkokomi1.png`(`11.3KB`), `public/dev/bandai_kkokomi2.png`(`9.5KB`) 총 4개 파일(`4.46MB`)은 `public/images/brand/`로 정식 에셋 추출이 끝난 초기 시안 원본입니다. 런타임 코드 어디에서도 참조하지 않지만 `public/` 하위에 남아 있어 매 빌드마다 `dist/dev/`로 복사됩니다.
6. **`[RC-LEG-06]` [`vite.config.ts:86`](../vite.config.ts#L86)의 죽은 `globIgnores` 규칙 레거시**:
   - 이미 `v1.9`에서 삭제 완료된 `**/backup/**` 및 `**/knps_logo_alpha.png`가 `globIgnores` 배열에 남아 있습니다.
7. **`[RC-LEG-07]` `docs/` 설계 문서 분산 레거시 (`ARCHITECTURE_AND_DESIGN.md` vs `ROUTE_NAVIGATION_DESIGN.md` vs `SETTINGS_DESIGN.md`)**:
   - 단계별 설계 과정에서 생성된 개별 설계 문서들의 핵심 명세를 정본 [`docs/ARCHITECTURE_AND_DESIGN.md`](./ARCHITECTURE_AND_DESIGN.md)에 최종 통합하고, 구현 완료 시 불필요한 중복 문서를 정리할 수 있도록 설계합니다.

---

## 2장. 통합 구현 설계 및 개선 명세서

### 2.1. 기획 연구 결과: `'3.4. 설정'` 최소주의(Minimalist) 4대 핵심 기능 명세

사용자 기획안(*"초기 설정 기능은 최소화한다: 바닷길 콕콕의 풍속 판정 기준 설정 · 바닷길 콕콕의 파고 판정 기준 설정 · 앱 버전 확인 · 간단한 이용 안내. 기상 판정 기준은 사용자가 직접 변경할 수 있으며, 기기에 저장하여 다음 실행 시에도 유지한다."*)을 100% 반영한 상세 기능 명세입니다.

| 구분 | 핵심 요구사항 | 상세 기능 및 UX 설계 | 영속 저장소 및 기본값 폴백 |
| :--- | :--- | :--- | :--- |
| **기능 1** | **바닷길 콕콕의 풍속 판정 기준 설정** | - **입력 컨트롤**: `좋음 상한선 (< kn)`, `보통 상한선 (≤ kn)` (`1kn` 또는 `0.5kn` 단위 입력)<br>- **현장 체감 환산 캡션**: 각 입력값 하단에 초속(`m/s`, $1\text{ kn} \approx 0.5144\text{ m/s}$) 및 시속(`km/h`) 실시간 환산치 표시 (예: `14kn ≈ 7.2m/s`)<br>- **3단계 실시간 판정 프리뷰 바**:<br>  - `🟢 정상운항(좋음)`: `0 ~ {windGood}kn 미만`<br>  - `🟡 주의운항(보통)`: `{windGood} ~ {windMod}kn 이하`<br>  - `🔴 출항보류(나쁨)`: `{windMod}kn 초과` | - 저장 키: `localStorage['bada_weather_thresholds_v1']`<br>- 표준 기본값([`app_config.json`](../public/config/app_config.json)): `좋음 < 14kn`, `보통 ≤ 20kn` |
| **기능 2** | **바닷길 콕콕의 파고 판정 기준 설정** | - **입력 컨트롤**: 유의파고 `좋음 상한선 (< m)`, `보통 상한선 (≤ m)` (`0.1m` 단위 입력)<br>- **3단계 실시간 판정 프리뷰 바**:<br>  - `🟢 정상운항(좋음)`: `0 ~ {waveGood}m 미만`<br>  - `🟡 주의운항(보통)`: `{waveGood} ~ {waveMod}m 이하`<br>  - `🔴 출항보류(나쁨)`: `{waveMod}m 초과`<br>- **저장 및 복원 컨트롤**:<br>  - `[기기에 기준치 저장]` (`type="submit"`): 기기 영속 저장 및 즉시 재판정<br>  - `[표준 기본값 복원]` (`type="button"`): `14/20kn · 1.0/1.8m` 원터치 초기화 | - 저장 키: `localStorage['bada_weather_thresholds_v1']`<br>- 표준 기본값([`app_config.json`](../public/config/app_config.json)): `좋음 < 1.0m`, `보통 ≤ 1.8m` |
| **기능 3** | **간단한 이용 안내** | 모바일 화면에서 탭 전환이나 긴 스크롤 없이 즉시 읽히는 **3대 핵심 기능 요약 카드**:<br>1. **📘 꼬미의 바다수첩**: 5색 안전등급(`위험주의 Red` 최우선 노출) 기반 55개 접안지 수심·암초 확인, 공간정보 레이어(`.gpkg`/`.shp`/`.geojson`) 관리, 현장 이메일 제보 및 상괭이 관찰 기록<br>2. **🧭 바닷길 콕콕 (시간계산)**: 통영·거제 136개 항포구 초성 검색·500m 자동 스냅, 35개 해상 변침점 기반 육지 우회 실항로(`➤` 방향표시)·소요시간·침로·누적 도착시각(ETA) 자동 산출<br>3. **🌊 바닷길 콕콕 (기상판정)**: 지도 해역 탭 또는 항로 경유지별 ECMWF 풍속·파고 시간대별 조회 및 위 설정 기준치에 따른 3단계(`정상운항`/`주의운항`/`출항보류`) 자동 판정 | - 정적 내장 가이드 (오프라인 100% 열람 가능) |
| **기능 4** | **앱 버전 확인** | - **앱 릴리즈 버전**: `바다꼼꼬미 v2.1.0` (`APP_VERSION` 단일 상수)<br>- **탑재 데이터 사전 버전**: 접안지 `55개소` · 항포구/선착장 `136개소 (v2.0.0)` · 해상 변침점 `35개소` · 기상 모델 `ECMWF IFS/WAM 9km`<br>- **기기 실행 상태 배지**: `온라인 연결됨` / `오프라인 캐시 모드` 및 `PWA 앱 설치됨` / `웹 브라우저 실행 중` 표시 (+ 미설치 시 `[앱 설치]` 바로가기 연동) | - [`src/config/appVersion.ts`](../src/config/appVersion.ts) + `App.tsx` 실시간 런타임 상태 |

---

### 2.2. 아키텍처 및 데이터 흐름 설계

```mermaid
flowchart TD
    subgraph VersionSSOT["버전 단일 진실 공급원 (src/config/appVersion.ts)"]
        VER["APP_VERSION = '2.1.0'\nPORTS_DATASET_VERSION = '2.0.0'"]
    end

    subgraph EntryPoints["진입 경로 (Dual Entry Points — Zero Map Load on Home)"]
        HOME_CARD["1. 인트로 HomeScreen 4번 활성 카드\n[설정 · 기상기준 · 이용안내]\n+ 빠른 진입 칩 [🌬️기상기준] [📖이용안내]"]
        WTH_BTN["2. 바닷길 콕콕 > 기상상태판정 패널\n[⚙️ 기준치 설정] 버튼"]
    end

    subgraph TopLayerModal["App.tsx 최상위 루트 마운트 (워크스페이스 inert 래퍼 외부)"]
        DLG["WeatherThresholdSettings.tsx (통합 '3.4. 설정' Native <dialog>)\n- showModal() Top-Layer 렌더링\n- overscroll-behavior: contain"]
        SEC1["섹션 1: 바닷길 콕콕 풍속·파고 판정 기준 (<fieldset> + <legend>)\n- 풍속(kn + m/s 환산) / 파고(m) 16px 입력\n- 0 < good < moderate 검증 + 동적 aria-describedby\n- [기기에 기준치 저장] / [표준 기본값 복원]"]
        SEC2["섹션 2: 간단한 이용 안내\n(바다수첩 · 시간계산 · 기상판정 3대 요약 카드)"]
        SEC3["섹션 3: 앱 버전 및 데이터 사전 확인\n(v2.1.0 · 접안지 55 · 항포구 136 · 온라인/PWA 상태)"]
    end

    subgraph WeatherEngine["useMarineWeather.ts & ecmwfWeatherService.ts"]
        LS[("window.localStorage\n'bada_weather_thresholds_v1'")]
        CFG["public/config/app_config.json\n(14/20kn · 1.0/1.8m)"]
        HOOK["useMarineWeather()\n- thresholds / defaultThresholds\n- isCustomThresholds\n- updateThresholds() / resetThresholds()"]
    end

    VER --> HOME_CARD & DLG
    HOME_CARD -->|"onOpenSettings('thresholds' | 'guide')"| DLG
    WTH_BTN -->|"onOpenSettings('thresholds')"| DLG
    DLG --> SEC1 & SEC2 & SEC3
    SEC1 <-->|"즉시 반영 · 영구 저장 · 기본값 복원"| HOOK
    HOOK <-->|"스키마 검증 (isValidWeatherThresholds)"| LS
    CFG -.->|"기본값 폴백"| HOOK
```

---

### 2.3. 디자인 · UI/UX · 레이아웃 리팩토링 및 트러블슈팅 명세

#### 2.3.1. 인트로 허브([`src/components/home/HomeScreen.tsx`](../src/components/home/HomeScreen.tsx)) 4번 `[설정]` 카드 디자인 승격
기존 인트로 화면의 2×2 그리드에서 1번(`꼬미의 바다수첩`), 2번(`바닷길 콕콕`)만 활성이고 3번(`꼬미의 달력`), 4번(`설정`)이 모두 회색 비활성(`출시 예정`)이어서 하단 행 전체가 죽어 보이던 시각적 불균형을 해소합니다.

1. **수직·수평 1px 기준선 완벽 정렬**:
   - 카드 1·2와 동일하게 `<article>` 컨테이너 내부를 **[상단 상태 배지(`h-5`) → 중앙 아이콘 슬롯(`h-12 sm:h-14`, `icon_settings_gear_alpha.png`) → 타이틀(`설정`) → 부제(`기상 판정 기준 · 이용 안내`) → 하단 원터치 진입 칩 그리드(`grid-cols-2 gap-1`)]** 5단 구조로 설계합니다.
2. **국립공원공단(KNPS) 틸·슬레이트 하이브리드 컬러 테마**:
   - 카드 배경: `bg-gradient-to-b from-[#f0fdfa] via-[#e6fffa] to-[#ccfbf1]` 및 `border-[#14b8a6]` 테두리를 적용하여 1번 카드(산림 그린), 2번 카드(해양 블루)와 조화로운 국립공원 수생태계 틸(Teal) 톤을 부여합니다.
   - 상단 배지: 사용자가 기상 기준치를 변경해 기기에 저장한 상태(`isCustomWeatherThresholds === true`)이면 **`맞춤기준 적용중`**(에메랄드 강조), 기본 상태이면 **`기상기준 · v2.1`**을 표시합니다.
   - 하단 원터치 직행 칩(2열):
     - 좌측 칩: **`[🌬️ 기상기준]`** 클릭 시 설정 모달을 열고 풍속·파고 기준치 섹션으로 포커스
     - 우측 칩: **`[📖 이용안내]`** 클릭 시 설정 모달을 열고 간단한 이용 안내 및 버전 확인 섹션으로 스크롤/포커스

#### 2.3.2. 통합 `'3.4. 설정'` 다이얼로그([`src/components/navigation/WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx)) UI/UX 및 폼 검증 설계

1. **네이티브 `<dialog>` Top-Layer 전환 (`[RC-SET-01]`, `[RC-LEG-04]` 해결)**:
   - 기존 `<div role="dialog" aria-modal="true">`와 `useEscapeKey`를 제거하고, `<dialog ref={dialogRef} aria-labelledby="settings-dialog-title" className="knps-modal-surface ...">` 및 `dialog.showModal()`을 사용합니다.
   - 다이얼로그 외부 배경(Backdrop) 클릭 시 포인터 좌표(`clientX`, `clientY`)가 다이얼로그 `getBoundingClientRect()` 바깥인지 판별하여 안전하게 닫히도록(Light Dismiss) 처리합니다(드래그 선택 중 마우스가 밖에서 떼어질 때 오작동 방지).
2. **섹션 1 — 바닷길 콕콕 기상 판정 기준 설정 (`<fieldset>` + `<legend>` + 역전 방지 검증)**:
   - 상단 헤더 우측에 현재 적용 상태 배지(`🟢 사용자 맞춤 기준 저장됨` vs `⚪ 국립공원 표준 기본값`)를 표시합니다.
   - **풍속(`knots`) `<fieldset>`**:
     - `<legend>`: `🌬️ 바닷길 콕콕 풍속 판정 기준 (단위: kn)`
     - `좋음 상한선 (<)` 입력창(`id="wind-good-input"`, `name="windGood"`, `text-base`, `min-h-12`) + 하단 실시간 환산 캡션(`≈ {(windGood * 0.5144).toFixed(1)} m/s`)
     - `보통 상한선 (≤)` 입력창(`id="wind-mod-input"`, `name="windMod"`, `text-base`, `min-h-12`) + 하단 실시간 환산 캡션(`≈ {(windMod * 0.5144).toFixed(1)} m/s`)
     - 3색 시각 프리뷰 바: `[🟢 좋음 < 14kn] [🟡 보통 14~20kn] [🔴 나쁨 > 20kn]`
   - **유의파고(`m`) `<fieldset>`**:
     - `<legend>`: `🌊 바닷길 콕콕 파고 판정 기준 (단위: m)`
     - `좋음 상한선 (<)` 입력창(`id="wave-good-input"`, `name="waveGood"`, `step="0.1"`, `text-base`, `min-h-12`)
     - `보통 상한선 (≤)` 입력창(`id="wave-mod-input"`, `name="waveMod"`, `step="0.1"`, `text-base`, `min-h-12`)
     - 3색 시각 시각 프리뷰 바: `[🟢 좋음 < 1.0m] [🟡 보통 1.0~1.8m] [🔴 나쁨 > 1.8m]`
   - **상호작용 후 유효성 검증 (`[RC-SET-02]` 해결)**:
     - `windGood <= 0 || windGood >= windMod || windMod > 60`일 때 `windError` 메시지 생성: `"❌ 풍속 '좋음' 상한선은 '보통' 상한선보다 작아야 합니다 (권장: 좋음 14kn / 보통 20kn)."`
     - `waveGood <= 0 || waveGood >= waveMod || waveMod > 15`일 때 `waveError` 메시지 생성: `"❌ 파고 '좋음' 상한선은 '보통' 상한선보다 작아야 합니다 (권장: 좋음 1.0m / 보통 1.8m)."`
     - 오류가 있을 때만 해당 `<input>`에 `aria-invalid="true"`와 `aria-describedby="wind-threshold-error"`(또는 `wave-threshold-error`)를 동적으로 부여하고, 제출 시 첫 오류 입력창으로 `focus()`를 이동합니다.
   - **액션 버튼 바**:
     - 좌측: `[↺ 기본값 복원]` (`type="button"`, 클릭 시 `14/20kn`, `1.0/1.8m`로 입력값 및 `localStorage` 즉시 복원 후 토스트 알림)
     - 우측: `[✓ 기기에 기준치 저장]` (`type="submit"`, 유효성 통과 시 `localStorage` 영속 저장 후 토스트 알림)
3. **섹션 2 — 간단한 이용 안내 (3대 핵심 도메인 요약 카드)**:
   - **📘 꼬미의 바다수첩**: `위험주의(Red) 9개소 최우선 표시 · 총 55개 접안지 수심/위험요소/사진 확인 · 공간정보 레이어(.gpkg/.shp/.geojson) 관리 · 현장 제보 및 상괭이 관찰 기록`
   - **🧭 바닷길 콕콕 — 시간계산**: `통영·거제 136개 항포구 초성 검색 및 500m 자동 스냅 · 35개 해상 변침점 육지 우회 실항로(➤ 방향표시) · 선속별 소요시간 및 경유지 누적 도착시각(ETA) 계산`
   - **🌊 바닷길 콕콕 — 기상상태판정**: `ECMWF(IFS 풍속 + WAM 파고) 정밀 해상기상 조회 · 위 설정 기준치에 따른 3단계(좋음/보통/나쁨) 자동 판정 · 항로 경유지 원터치 기상 연동`
4. **섹션 3 — 앱 버전 및 시스템 상태 확인 카드**:
   - **앱 버전**: `바다꼼꼬미 v2.1.0` (`2026-11-10`)
   - **수록 데이터**: `접안지 55개소 · 항포구/선착장 136개소 (v2.0.0) · 해상 변침점 35개소`
   - **기상 모델**: `ECMWF IFS HRES (9km 풍속) + WAM HRES (9km 파고)`
   - **기기 상태**: `온라인 / 오프라인 캐시 동작` · `PWA 설치 상태` (미설치 시 `[📲 홈 화면에 앱 설치]` 버튼 제공)

#### 2.3.3. 전역 모달 입력 폼 iOS 자동 줌 방지 및 라벨 연결 리팩토링 (`PorpoiseObservationModal.tsx`, `FieldReportModal.tsx`, `DockingDetailSheet.tsx`)
- [`PorpoiseObservationModal.tsx`](../src/components/notebook/PorpoiseObservationModal.tsx#L119-L130): 관찰 일시 `<label htmlFor="porpoise-observed-at">` 및 `<input id="porpoise-observed-at" className="... text-base min-h-12">` 적용.
- [`FieldReportModal.tsx`](../src/components/notebook/FieldReportModal.tsx#L189-L258): 관리자 이메일, 제보자 이름, 현장 메모 입력 컨트롤에 `<label htmlFor>` + `<input id>` 매칭 및 `text-base`(`16px`) 적용.
- [`DockingDetailSheet.tsx`](../src/components/DockingDetailSheet.tsx#L29-L40): 로컬 중복 `calculateDistanceKm` 함수를 제거하고 [`routeGeoService.ts`](../src/services/routeGeoService.ts#L147-L171)의 `calculateHaversineKm`, `kmToNauticalMiles`를 재사용하도록 리팩토링.

---

### 2.4. MCP 및 도구/API 연동 최적화 방안

| 연동 대상 | 적용 위치 | 최적화 활용 방안 |
| :--- | :--- | :--- |
| **`modern-web-guidance` (`dialog`, `forms`, `validate-input-after-interaction`)** | [`WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx), [`src/index.css`](../src/index.css), [`PorpoiseObservationModal.tsx`](../src/components/notebook/PorpoiseObservationModal.tsx), [`FieldReportModal.tsx`](../src/components/notebook/FieldReportModal.tsx) | - 네이티브 `<dialog>` Top-Layer(`showModal()`) 및 `overscroll-behavior: contain` 적용<br>- `<fieldset>` + `<legend>`, `<label htmlFor>`, `16px`(`text-base`), `48px`(`min-h-12`) 터치 타겟 적용<br>- `blur`/`submit` 검증 및 오류 시에만 동적 `aria-describedby` 연결 |
| **Web Storage API (`window.localStorage`) + 런타임 스키마 가드** | [`useMarineWeather.ts`](../src/hooks/useMarineWeather.ts), [`ecmwfWeatherService.ts`](../src/services/ecmwfWeatherService.ts) | - `bada_weather_thresholds_v1` 키에 대해 `isValidWeatherThresholds()` 검증 및 `resetThresholds()` 초기화 제공 (네트워크 재호출 없이 `useMemo` 즉시 재판정) |
| **GitHub Actions CI 검증 파이프라인** | [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | - `ports.json` 그래프 무결성 검증과 함께 `package.json` 버전 및 `APP_VERSION` 정합성 유지 |

---

### 2.5. 레거시 정리 및 청산 내역 (7대 레거시 전수 식별 및 제거 명세)

개선 및 리팩토링 작업과 함께 프로젝트에서 완전히 제거·청산되는 레거시 목록입니다.

| 레거시 ID | 구분 | 대상 파일 / 경로 | 식별된 레거시 내용 | 청산 및 정리 조치 |
| :---: | :--- | :--- | :--- | :--- |
| **LEG-01** | **코드 중복 레거시** | [`src/components/DockingDetailSheet.tsx`](../src/components/DockingDetailSheet.tsx#L29-L40) | `routeGeoService.ts`의 `calculateHaversineKm`와 중복 선언된 로컬 `calculateDistanceKm` 함수 및 수동 `/ 1.852` 계산식 | 로컬 중복 함수를 완전히 삭제하고 `routeGeoService.ts`의 `calculateHaversineKm`, `kmToNauticalMiles`를 import하여 단일화 |
| **LEG-02** | **하드코딩 구버전 레거시** | [`package.json`](../package.json#L4), [`vite.config.ts`](../vite.config.ts#L54), [`src/App.tsx`](../src/App.tsx#L1245), [`src/components/home/HomeScreen.tsx`](../src/components/home/HomeScreen.tsx#L382) | 4개 파일에 각각 하드코딩되어 남아 있던 `"1.8.0"` 및 `"[v1.8]"` 구버전 문자열 | [`src/config/appVersion.ts`](../src/config/appVersion.ts) (`APP_VERSION = '2.1.0'`) 단일 상수로 통합하고 `package.json` 및 PWA manifest 설명을 `v2.1.0`으로 일괄 갱신 |
| **LEG-03** | **비활성 UI 레거시** | [`src/components/home/HomeScreen.tsx`](../src/components/home/HomeScreen.tsx#L310-L338) | 인트로 4번 `설정` 카드의 `disabled`, `aria-disabled="true"`, `cursor-not-allowed`, `출시 예정` 배지 | 비활성 속성과 `출시 예정` 배지를 제거하고 `[🌬️기상기준]`, `[📖이용안내]` 원터치 칩을 갖춘 정식 활성 카드로 교체 |
| **LEG-04** | **구형 모달 & Silent Drop 폼 레거시** | [`src/components/navigation/WeatherThresholdSettings.tsx`](../src/components/navigation/WeatherThresholdSettings.tsx), [`src/App.tsx`](../src/App.tsx#L2117-L2127) | ① 워크스페이스 `inert` 래퍼 내부에 갇혀 있던 모달 마운트 위치<br>② 구형 `<div role="dialog">` 및 `useEscapeKey` 수동 훅<br>③ `good >= moderate` 역전 입력 시 무응답 무시 후 창을 닫던 구버전 `handleSubmit` | ① `App.tsx` 최상위 루트로 마운트 위치 승격<br>② 네이티브 `<dialog>`(`showModal()`)로 교체<br>③ 역전 방지 검증 + 동적 에러 안내 + `[표준 기본값 복원]`을 갖춘 통합 `'3.4. 설정'` 다이얼로그로 전면 교체 |
| **LEG-05** | **미참조 개발 시안 에셋 레거시 (`4.46 MB`)** | `public/dev/intro_design.png` (`2.51MB`)<br>`public/dev/functions_app_design.png` (`1.93MB`)<br>`public/dev/bandai_kkokomi1.png` (`11.3KB`)<br>`public/dev/bandai_kkokomi2.png` (`9.5KB`) | 런타임 코드에서 전혀 참조되지 않는 개발 초기 시안 원본 이미지(`4.46MB`)가 `public/dev/`에 남아 프로덕션 빌드 시 `dist/dev/`로 그대로 복사·배포됨 | `public/dev/` 디렉터리(4개 미참조 시안 파일, `4.46MB`)를 제거하여 프로덕션 배포 아티팩트 용량을 `6.1MB → 1.6MB`(**73% 감축**) |
| **LEG-06** | **빌드 설정 레거시** | [`vite.config.ts`](../vite.config.ts#L86) | 이미 `v1.9`에서 삭제된 `**/backup/**`, `**/knps_logo_alpha.png` 및 `**/dev/**`가 남아 있던 `workbox.globIgnores` 배열 | `public/dev/` 청산 후 불필요해진 죽은 `globIgnores` 항목을 정리하여 `vite.config.ts` 클린화 |
| **LEG-07** | **분산 설계 문서 레거시** | [`docs/ARCHITECTURE_AND_DESIGN.md`](./ARCHITECTURE_AND_DESIGN.md), [`docs/ROUTE_NAVIGATION_DESIGN.md`](./ROUTE_NAVIGATION_DESIGN.md), [`docs/SETTINGS_DESIGN.md`](./SETTINGS_DESIGN.md) | 기능별 설계 과정에서 3개로 분산된 마크다운 문서 | 본 설계 승인 및 `v2.1` 구현 완료 시 모든 설계·검증 내용을 단일 정본 [`docs/ARCHITECTURE_AND_DESIGN.md`](./ARCHITECTURE_AND_DESIGN.md) (`v2.1`)로 완전 통합하고 임시/개별 설계 문서를 정리 |

---

## 3장. 사용자 필수 실행 요청 목록 (Action Items)

> **[필수 안내 — 임의 우회 금지 원칙 준수]**
> 본 문서는 `'3.4. 설정'` 기능 구현과 **전방위 리팩토링 · 디자인 개선 · 7대 레거시 청산**을 수행하기 직전의 **최종 구현 설계서**입니다. 아래 항목들은 파일/폴더 삭제를 포함한 레거시 청산 범위, UI 구성 방식, Git 반영 권한과 직결되어 에이전트가 임의로 처리할 수 없으므로 검토 후 승인(또는 선택지 지정)을 요청드립니다.

| 항목 ID | 구분 | 결정/요청 내용 | 선택지 (`(추천)` 포함) | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| **ACTION-01** | **`'3.4. 설정'` 구현 및 전방위 리팩토링 승인** | 본 설계서 2장에 명세된 **① 인트로 4번 `[설정]` 카드 정식 활성화 디자인, ② 네이티브 `<dialog>` 기반 통합 `'3.4. 설정'`(풍속·파고 기준치 설정 + `m/s` 환산 + 역전 입력 방지 검증 + 기기 영구 저장 + `[표준 기본값 복원]` + 간단한 이용 안내 + 앱 버전 확인), ③ `App.tsx` 최상위 모달 승격, ④ 전체 모달 폼 `16px`(`text-base`)·`<label htmlFor>` 접근성 리팩토링**을 즉시 구현할지 승인해 주십시오. | 1. **`(추천)` 전체 설계안 승인 및 즉시 본 구현·검증 착수**<br>2. 일부 항목 수정 후 구현 착수 (수정할 항목 지시) | 승인 즉시 코드 구현 및 `oxlint` · `tsc` · `vite build` 실측 검증 수행 |
| **ACTION-02** | **7대 레거시(`LEG-01 ~ LEG-07`) 청산 범위 결정** | 2.5절에 식별된 **7대 레거시 항목** 중 실제 파일 삭제가 수반되는 **`LEG-05`(`public/dev/` 미참조 개발 시안 이미지 4종 `4.46MB` 삭제)** 및 **`LEG-07`(`docs/` 분산 설계 문서를 단일 정본 `docs/ARCHITECTURE_AND_DESIGN.md`로 통합 후 개별 설계 문서 제거)**의 실행 범위를 결정해 주십시오. | 1. **`(추천)` `LEG-01 ~ LEG-07` 전수 청산 (`public/dev/` 4.46MB 미참조 시안 제거 + 코드/버전/설정 레거시 제거 + 구현 완료 후 `docs/ARCHITECTURE_AND_DESIGN.md` 단일 문서로 통합)**<br>2. 코드·버전·설정 레거시(`LEG-01 ~ LEG-04, LEG-06`)만 청산하고 `public/dev/` 폴더와 개별 `docs/*.md` 파일은 보존 | 파일 삭제가 포함되므로 사용자 명시 승인 필수 |
| **ACTION-03** | **설정 다이얼로그 내부 레이아웃 방식** | `'3.4. 설정'` 모달 내부의 ① 기상 판정 기준 설정, ② 간단한 이용 안내, ③ 앱 버전 확인 3개 섹션의 배치 방식을 결정해 주십시오. | 1. **`(추천)` 단일 스크롤 카드 레이아웃 + 인트로 `[🌬️기상기준]` / `[📖이용안내]` 칩 클릭 시 해당 섹션으로 자동 스크롤 포커스**<br>2. 모달 상단 세그먼트 탭(`[🌬️ 기상 기준 설정]` \| `[📖 이용 안내 · 버전]`)으로 2탭 분리 | 초기 설정 기능 최소화 원칙에 따라 한눈에 보이는 1안 권장 |
| **ACTION-04** | **구현 완료 후 Git 커밋 및 Push 범위** | `v2.1` 구현·레거시 청산·검증 완료 후 Git 반영 방식을 지정해 주십시오. | 1. **`(추천)` 구현 및 문서 최신화 완료 후 로컬 커밋까지만 수행 (원격 Push는 사용자 최종 확인 후 수행)**<br>2. 구현 완료 후 커밋하지 않고 작업 트리에 대기<br>3. 로컬 커밋 및 `origin/main` 원격 Push까지 즉시 수행 | 외부 저장소 반영 권한 준수 |
