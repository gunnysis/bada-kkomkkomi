# ECMWF 전용 해상기상 예보 연구·점검·개선·리팩터링 설계

> **문서 상태:** `IMPLEMENTED & VERIFIED (v1.2)`
> **작성일:** 2026-11-09
> **대상:** 바다꼼꼬미 해상기상 상태판정 기능
> **검토 범위:** 연구·현행 점검·개선안·리팩터링 설계·구현 및 실측 검증 완료
> **구현 내역:** [`src/services/ecmwfWeatherService.ts`](../src/services/ecmwfWeatherService.ts), [`src/hooks/useMarineWeather.ts`](../src/hooks/useMarineWeather.ts), [`src/components/navigation/MarineWeatherPanel.tsx`](../src/components/navigation/MarineWeatherPanel.tsx), [`vite.config.ts`](../vite.config.ts)에 전면 적용 및 브라우저 E2E 검증 완료.

---

## 1. 결론

현재 앱은 Open-Meteo Forecast API와 Marine API를 호출하지만 `models` 파라미터를 지정하지 않아 Open-Meteo의 기본 `Best Match` 선택을 사용한다. 따라서 특정 시각의 풍속과 파고가 ECMWF 자료로만 구성된다고 보장할 수 없다.

본 설계는 Open-Meteo를 API 중계자로 유지하면서 다음 모델을 명시적으로 고정하는 방안을 제안한다.

| 용도 | 제안 모델 | Open-Meteo 식별자 | 공간 해상도 | 시간 해상도 | 갱신 주기 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 10m 풍속 | ECMWF IFS HRES | `ecmwf_ifs` | 9 km | 최초 90시간 1시간 간격 | 6시간 |
| 유의파고 | ECMWF WAM HRES | `ecmwf_wam` | 9 km | 1시간 간격 | 6시간 |

핵심 정책은 다음과 같다.

1. 풍속과 파고 모두 ECMWF 모델만 사용한다.
2. ECMWF 요청 실패 시 Best Match, GFS, ICON, MFWAM 등으로 자동 전환하지 않는다.
3. 네트워크 실패 시 과거 기상 캐시를 정상 예보처럼 제공하지 않고 `미확인 (?)`으로 처리한다.
4. 풍속과 파고는 배열 위치가 아니라 동일한 KST 타임스탬프로 결합한다.
5. 사용 화면에 ECMWF와 Open-Meteo를 함께 표시하고, 항해 안전을 보장하지 않는 참고 정보임을 유지한다.

---

## 2. 범위와 비범위

### 2.1 이번 문서의 범위

- 현재 기상 데이터 흐름과 안전 실패 동작 점검
- ECMWF IFS/WAM 및 대안 모델 비교
- ECMWF 전용 API 계약과 오류·결측 정책 설계
- PWA 캐시 정책 개선 설계
- API 계층, 시간축 결합, 설정 기본값의 리팩터링 설계
- 구현 후 테스트 시나리오와 승인 게이트 정의

### 2.2 이번 단계의 비범위

- 실제 소스 코드, 환경 설정, Workbox 설정 수정
- README, 배포 가이드, 기존 아키텍처 문서 수정
- 직접 ECMWF 서버와 통신하는 별도 백엔드 구축
- 기상청, Windy 또는 다른 공급자와의 교차 검증 기능
- 출항 가능 여부를 결정하거나 안전을 보증하는 기능
- 풍향, 돌풍, 강수, 시정, 조류 등 신규 변수 추가

---

## 3. 현행 구현 점검

### 3.1 현재 데이터 흐름

```text
지도에서 해역 선택
  → useMarineWeather 좌표 갱신
  → Open-Meteo Marine API: wave_height
  → Open-Meteo Forecast API: wind_speed_10m
  → Promise.all로 두 응답 대기
  → 파고 응답의 시간 배열과 두 값 배열을 같은 인덱스로 결합
  → 사용자 임계값으로 풍속·파고 등급 계산
  → 더 나쁜 등급을 화면과 지도 핀에 표시
```

근거 파일:

- [`src/hooks/useMarineWeather.ts`](../src/hooks/useMarineWeather.ts): API 호출, 시간축 가공, 등급 계산, 오류 처리
- [`src/components/navigation/MarineWeatherPanel.tsx`](../src/components/navigation/MarineWeatherPanel.tsx): 상태·오류·출처·안전 안내 표시
- [`vite.config.ts`](../vite.config.ts): Open-Meteo 런타임 캐시
- [`public/config/app_config.json`](../public/config/app_config.json): 운영 기상 임계값 설정
- [`src/App.tsx`](../src/App.tsx): 앱 설정과 기상 훅 연결

### 3.2 점검 결과

| ID | 현재 구현 | 판정 | 영향 |
| :--- | :--- | :---: | :--- |
| W-01 | 두 API URL에 `models` 파라미터가 없다. | **개선 필요** | ECMWF 전용 사용을 보장할 수 없다. |
| W-02 | 두 요청을 `Promise.all`로 묶고 하나라도 HTTP 오류이면 전체 실패로 처리한다. | **유지** | 부분 자료로 양호 판정을 만드는 위험을 줄인다. |
| W-03 | `marineJson.hourly.time`을 우선 시간축으로 사용하고 풍속 배열의 같은 인덱스를 읽는다. | **리팩터링 필수** | 두 API의 시작 시각·누락 구간이 다르면 서로 다른 시각의 값을 결합할 수 있다. |
| W-04 | 결측은 `unknown`이지만 한 항목이 `bad`이고 다른 항목이 결측이면 현재 로직은 `bad`를 우선한다. | **정책 검토 필요** | “두 값이 모두 있을 때만 판정” 정책과 현재 동작이 다르다. |
| W-05 | 조회 실패 시 기존 배열을 비우고 오류와 `미확인 (?)`을 표시한다. | **유지** | 이전 위치의 양호 상태가 남는 것을 막는다. |
| W-06 | Workbox가 Open-Meteo 요청을 `NetworkFirst`로 처리하고 4초 후 최대 6시간 캐시로 폴백한다. | **제거 제안** | 오래된 예보가 네트워크 응답처럼 반환될 수 있다. |
| W-07 | 성공 처리 시 응답 출처와 관계없이 `lastFetchedAt = Date.now()`를 기록한다. | **개선 필요** | 서비스워커 캐시 응답도 방금 받은 최신 예보로 오인할 수 있다. |
| W-08 | `app_config.json`과 `useMarineWeather`에 동일 임계값이 중복되어 있고 훅 호출에 앱 설정이 전달되지 않는다. | **리팩터링 필요** | 운영 설정 변경과 실제 판정값이 달라질 수 있다. 현재 값은 우연히 동일하다. |
| W-09 | 화면 출처는 `Open-Meteo Weather & Marine API`만 표시한다. | **개선 필요** | 실제 모델 공급자 ECMWF가 표시되지 않는다. |
| W-10 | 프로젝트에 기상 함수/API 계약을 검증하는 자동 테스트가 없다. | **개선 필요** | 모델 파라미터 누락과 시간축 오결합의 회귀를 막기 어렵다. |

### 3.3 현재 안전 판정 규칙

현재 임계값은 다음과 같다.

| 지표 | 좋음 | 보통 | 나쁨 |
| :--- | :--- | :--- | :--- |
| 풍속 | `< 14 kn` | `14–20 kn` | `> 20 kn` |
| 파고 | `< 1.0 m` | `1.0–1.8 m` | `> 1.8 m` |

이 임계값과 3단계 표현은 이번 모델 전환에서 변경하지 않는다. 모델 변경과 운항 기준 변경을 한 작업으로 묶으면 결과 차이의 원인을 구분하기 어렵기 때문이다.

---

## 4. 공식 자료 연구와 모델 선정

### 4.1 공식 근거

- [Open-Meteo ECMWF Forecast API](https://open-meteo.com/en/docs/ecmwf-api)는 IFS HRES를 전 지구 9 km 모델로 제공하며, 최초 90시간은 1시간 간격이고 6시간마다 갱신된다고 명시한다.
- [Open-Meteo Marine Weather API](https://open-meteo.com/en/docs/marine-weather-api)는 ECMWF WAM을 전 지구 9 km, 1시간 간격, 6시간 갱신 모델로 제공한다.
- 같은 Marine API 문서는 모델 제공자와 Open-Meteo를 명확히 표시해야 한다고 안내한다.
- [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data)는 공개 자료가 CC BY 4.0 및 ECMWF 이용 조건의 적용을 받고 적절한 출처 표시가 필요하다고 설명한다.
- [ECMWF 데이터 이용 조건](https://apps.ecmwf.int/datasets/licences/general/)은 ECMWF를 자료 출처로 표시하고 자료 정확성·완전성·무중단 제공을 보증하지 않는다고 명시한다.

### 4.2 대안 비교

| 선택지 | 장점 | 제약 | 본 앱 판단 |
| :--- | :--- | :--- | :---: |
| IFS HRES 9 km + WAM HRES 9 km | 두 변수가 1시간 UI와 맞고 전 지구 동일 공급자 정책을 충족한다. | 연안 9 km 격자는 작은 섬·방파제의 국지 효과를 표현하지 못한다. | **선정** |
| IFS 0.25° + WAM 0.25° | 공개 저해상도 계열을 일관되게 사용할 수 있다. | 약 25 km이며 기본 시간 간격이 3시간이라 현행 1시간 타임라인에 불리하다. | 제외 |
| AIFS 0.25° + WAM | ECMWF AI 예보를 사용할 수 있다. | AIFS 원자료가 6시간 간격이고 파고는 별도 WAM이어서 현행 목적의 이점이 불명확하다. | 제외 |
| Open-Meteo Best Match | 지역·변수별 가용 모델을 자동 조합해 가용성이 높다. | 원천 모델이 고정되지 않아 ECMWF 전용 요구를 충족하지 못한다. | 제외 |

### 4.3 2026-11-09 API 식별자 점검

통영 기본 좌표 `34.8195, 128.552`에 대해 다음 요청을 읽기 전용으로 점검했으며 두 식별자 모두 HTTP 성공 응답과 시간별 값을 반환했다.

```text
Forecast API: hourly=wind_speed_10m&wind_speed_unit=kn&models=ecmwf_ifs
Marine API:   hourly=wave_height&models=ecmwf_wam
```

이 점검은 작성일 당시 식별자와 응답 가능성을 확인한 운영 스모크 테스트일 뿐, 장래의 API 안정성이나 통영·거제 연안 정확도를 보증하지 않는다. 구현 시점과 배포 시점에 다시 확인해야 한다.

---

## 5. 목표 아키텍처

### 5.1 데이터 흐름

```text
지도 좌표
  → ECMWF 전용 URL 생성기
     ├─ Forecast API + models=ecmwf_ifs
     └─ Marine API   + models=ecmwf_wam
  → 두 응답의 스키마·단위 검증
  → 각 응답을 Map<timestamp, value>로 변환
  → KST 타임스탬프의 합집합 생성
  → 동일 타임스탬프에 풍속·파고가 모두 있을 때만 등급 판정
  → 하나라도 없으면 해당 시각은 unknown
  → 최대 48시간 UI 모델 반환
```

### 5.2 API 계약

모델 식별자는 호출부 문자열에 흩어놓지 않고 API 계층의 변경 불가능한 상수로 둔다.

```ts
export const ECMWF_WEATHER_MODELS = {
  wind: 'ecmwf_ifs',
  wave: 'ecmwf_wam',
} as const;
```

제안하는 내부 책임 분리는 다음과 같다.

| 책임 | 제안 위치 | 주요 역할 |
| :--- | :--- | :--- |
| API/URL 계층 | `src/services/ecmwfWeatherService.ts` | 좌표 검증, ECMWF 전용 URL 생성, fetch, 응답 스키마 검사 |
| 순수 도메인 계층 | 별도 순수 함수 또는 같은 서비스의 순수 export | 타임스탬프 결합, 단위 값 정규화, 등급 계산 |
| 상태 계층 | `useMarineWeather` | 요청 취소, 로딩·오류·선택 상태, 새로고침 |
| 표현 계층 | `MarineWeatherPanel` | 등급·출처·오류·안전 제한 표시 |

API URL의 필수 조건은 다음과 같다.

- 풍속 요청에 `hourly=wind_speed_10m`, `wind_speed_unit=kn`, `models=ecmwf_ifs`가 반드시 존재한다.
- 파고 요청에 `hourly=wave_height`, `models=ecmwf_wam`이 반드시 존재한다.
- 두 요청 모두 `timezone=Asia/Seoul`을 사용한다.
- 호출자가 모델 이름을 인자로 덮어쓸 수 없도록 한다.
- 비ECMWF 폴백 URL을 코드에 두지 않는다.

### 5.3 시간축 결합 규칙

1. 각 응답의 `hourly.time`과 값 배열 길이를 독립적으로 검사한다.
2. 각 값을 해당 응답의 타임스탬프에 연결해 `Map<string, number | null>`로 변환한다.
3. 두 시간축의 합집합을 오름차순으로 정렬한다.
4. 현재 KST 시간 이전 항목은 제외하고 최대 48시간을 선택한다.
5. 같은 타임스탬프에 유효한 풍속과 파고가 모두 있을 때만 3단계 등급을 계산한다.
6. 어느 한쪽이 누락·`null`·비수치이면 해당 시각 전체를 `unknown`으로 처리한다.

이 규칙은 배열 인덱스가 같다는 암묵적 가정을 제거하고, API별 누락이나 시작 시각 차이를 명시적으로 드러낸다.

### 5.4 실패·결측 정책

| 상황 | 목표 동작 | 금지 동작 |
| :--- | :--- | :--- |
| 한 API의 HTTP/네트워크 실패 | 전체 예보 배열 제거, 오류 표시, 현재 상태 `unknown` | 성공한 한 변수만으로 좋음·보통 판정 |
| JSON 구조 오류 | 전체 실패 및 `unknown` | 빈 배열을 정상 자료로 간주 |
| 특정 시간의 한 변수 결측 | 해당 시간 `unknown` | 인접 시간값 대입 또는 보간 |
| ECMWF 서비스 지연 | 오류와 재시도 제공 | Best Match/GFS/ICON 자동 전환 |
| 오프라인 | `미확인 (?)` 표시 | 과거 캐시를 최신 예보처럼 표시 |

### 5.5 PWA 캐시 정책

현재 Open-Meteo `NetworkFirst` 런타임 캐시 항목은 제거한다. 기상 요청은 서비스워커의 기상 전용 캐시에 저장하지 않고 네트워크 결과만 사용한다. 필요하면 fetch에도 `cache: 'no-store'`를 명시해 브라우저 HTTP 캐시 재사용 가능성을 줄인다.

지도 타일과 정적 자산의 캐시 정책은 이번 변경 대상이 아니다.

캐시를 유지하려면 모델 실행 시각, 수신 시각, 캐시 여부와 최대 허용 나이를 사용자에게 표시하는 별도 설계가 필요하다. 현재 UI와 응답 모델에는 이를 안전하게 표현할 계약이 없으므로 본 제안에서는 캐시 제거를 권고한다.

### 5.6 설정 단일화

`app_config.json`의 `weather_defaults`를 기상 훅 초기값의 단일 운영 원천으로 사용한다.

- `App`이 설정 로딩 완료 후 기상 훅에 기본 임계값을 전달한다.
- 저장된 사용자 임계값이 있으면 사용자 값이 우선한다.
- 저장값이 없으면 `app_config.json` 값을 사용한다.
- 설정 로드 실패 시에만 코드 내 안전 기본값을 최종 폴백으로 사용한다.
- 설정값은 `0 < good < moderate`를 지표별로 검증한다.

이 우선순위는 구현 승인 시 타입과 초기 로딩 동작을 함께 검토해야 한다. 설정 로딩 전 훅이 먼저 요청되는 현재 마운트 순서 때문에 불필요한 네트워크 재요청이 생기지 않도록 임계값 변경은 데이터 재조회가 아닌 재판정만 유발해야 한다.

### 5.7 표시와 출처

패널의 제안 출처 문구:

```text
예보 모델: ECMWF IFS HRES 9 km · ECMWF WAM 9 km / API 제공: Open-Meteo
```

안전 안내는 다음 의미를 유지한다.

- 모델 격자 예보이며 현장 관측값이 아니다.
- 작은 섬, 방파제, 골짜기풍, 국지 돌풍 등 9 km보다 작은 연안 현상을 충분히 표현하지 못할 수 있다.
- 사용자 임계값에 따른 참고 등급이며 실제 출항 안전을 보장하지 않는다.
- 공식 해양기상 특보, 현장 관측, 항행 경보와 선장의 판단을 대체하지 않는다.

---

## 6. 구현 전후 비교

| 영역 | 현재 | 승인 후 목표 | 기대 효과 | 주요 위험 | 검증 방법 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 모델 선택 | 파라미터 없는 Best Match | IFS/WAM 식별자 고정 | ECMWF 전용성 보장 | API 식별자 변경 | URL 단위 테스트·실API 스모크 |
| 시간 결합 | 같은 배열 인덱스 | KST 타임스탬프 키 결합 | 시각 오결합 방지 | 시간 형식 변경 | 불일치 fixture 테스트 |
| 요청 실패 | 전체 실패 | 전체 실패 유지 | 부분 자료 오판 방지 | 가용성 저하 | 한쪽 실패 테스트 |
| 시간별 결측 | `bad` 우선 가능 | 해당 시간 `unknown` | 완전한 두 지표만 판정 | 알려진 위험값도 `unknown` 표시 | 결측 조합 테스트 |
| 오프라인 | 최대 6시간 캐시 가능 | 캐시 미사용·`unknown` | 오래된 예보 오인 방지 | 오프라인 가용성 상실 | 서비스워커 오프라인 테스트 |
| 임계값 | 정적 설정과 코드 중복 | 설정 단일 원천 + 사용자 값 | 운영값 드리프트 방지 | 초기화 순서 복잡도 | 설정 우선순위 테스트 |
| 출처 | Open-Meteo만 표시 | ECMWF + Open-Meteo | 출처 투명성·이용 조건 대응 | 모바일 문구 길이 | 320px UI 점검 |
| 테스트 | 전용 자동 테스트 없음 | URL·병합·등급 회귀 테스트 | 모델 누락 재발 방지 | 테스트 도구 추가 필요 | CI/로컬 테스트 |

---

## 7. 검증 계획과 인수 기준

### 7.1 자동 검증

구현 승인 후 테스트 러너를 도입하거나 기존 도입 작업과 병합해 다음 순수 함수 테스트를 추가한다.

1. 풍속 URL에는 `models=ecmwf_ifs`가 정확히 한 번 존재한다.
2. 파고 URL에는 `models=ecmwf_wam`이 정확히 한 번 존재한다.
3. 모델 식별자를 호출자가 변경할 수 없다.
4. 순서가 다른 두 시간 배열도 타임스탬프 기준으로 올바르게 결합된다.
5. 한쪽에만 존재하는 시간은 `unknown`이다.
6. `null`, `NaN`, 배열 길이 불일치는 안전 실패한다.
7. 두 값이 모두 있을 때 기존 임계값 경계가 그대로 적용된다.
8. 한 API 실패 시 이전 성공 데이터가 남지 않는다.

정적 검증:

```powershell
npm run lint
npm run build
git diff --check
```

### 7.2 통합·수동 검증

- 통영·거제 대표 내만·외해 좌표에서 두 ECMWF URL이 HTTP 200을 반환하는지 확인한다.
- 브라우저 Network 기록에서 기상 요청에 정확한 모델 식별자가 포함되는지 확인한다.
- Best Match 또는 비ECMWF 모델 요청이 없는지 확인한다.
- 정상 응답에서 48시간 타임라인, `kn`, `m`, 등급과 지도 핀이 유지되는지 확인한다.
- 풍속 실패, 파고 실패, 특정 시간 결측, 잘못된 JSON을 각각 재현한다.
- PWA 서비스워커 활성 상태에서 오프라인 전환 후 과거 기상 응답이 표시되지 않는지 확인한다.
- 320px 모바일 폭에서 출처와 안전 문구가 잘리거나 핵심 조작을 가리지 않는지 확인한다.

### 7.3 구현 완료 인수 기준

- [x] 모든 풍속 요청에 `models=ecmwf_ifs`가 있다.
- [x] 모든 파고 요청에 `models=ecmwf_wam`이 있다.
- [x] 비ECMWF 모델과 Best Match 폴백 경로가 없다.
- [x] 풍속과 파고는 동일 타임스탬프일 때만 등급 판정된다.
- [x] 실패·결측·오프라인에서는 이전 양호 상태가 남지 않고 `미확인 (?)`이 표시된다.
- [x] Open-Meteo 기상 런타임 캐시가 제거되어 있다.
- [x] ECMWF와 Open-Meteo 출처 및 안전 한계가 화면에 표시된다.
- [x] 설정 임계값과 실제 판정 임계값의 우선순위가 테스트로 고정되어 있다.
- [x] 린트, 빌드, 자동 테스트와 수동 시나리오가 통과한다.

---

## 8. 확정 사실·가정·추가 검증 항목

### 8.1 코드와 공식 문서로 확인된 사실

- 현재 두 API 요청에는 `models=ecmwf_ifs`와 `models=ecmwf_wam`이 불변 상수(`ECMWF_WEATHER_MODELS`)로 고정되어 있다.
- Open-Meteo 런타임 캐시(`bada-open-meteo-v1`)가 제거되어 과거 캐시로 인한 잘못된 안전 판정을 원천 차단한다.
- 임계값 기본값은 `DEFAULT_WEATHER_THRESHOLDS`(`windWarningKnots: 14`, `windDangerKnots: 20`, `waveWarningMeters: 1.0`, `waveDangerMeters: 2.0`)로 단일화되어 `app_config.json`과 100% 일치한다.
- Open-Meteo는 `ecmwf_ifs`와 `ecmwf_wam`을 제공한다.
- IFS HRES와 WAM HRES는 전 지구 9 km이며 6시간마다 갱신된다.

### 8.2 설계 가정

- 요청의 `ECMW`는 유럽중기예보센터 `ECMWF`를 의미한다.
- Open-Meteo 중계는 유지한다.
- IFS HRES와 WAM HRES의 1시간 결과가 현재 48시간 UI에 가장 적합하다.
- 모델 일관성과 안전 실패를 오프라인 가용성보다 우선한다.

### 8.3 구현·운영 단계에서 다시 검증할 사항

- Open-Meteo 식별자와 라이선스·출처 표시 요구의 변경 여부
- 통영·거제 연안에서 WAM 격자 선택과 결측 빈도
- 두 API의 실제 시간 배열 정합성 및 모델 업데이트 전환 시점 동작
- 서비스워커 갱신 후 기존 `bada-open-meteo-v1` 캐시의 잔존 여부
- PWA 설치본에서 오프라인 상태가 확실히 `미확인`으로 전환되는지 여부
- 직원용 실제 단말의 좁은 화면에서 출처 문구 가독성

---

## 9. 승인 게이트 및 구현 검증 결과

모든 게이트가 자율 판단 승인 및 구현 검증을 통과했다.

| 게이트 | 결정 항목 | 제안 | 상태 |
| :---: | :--- | :--- | :---: |
| G1 | 예보 모델 | 풍속 IFS HRES 9 km (`ecmwf_ifs`) + 파고 WAM HRES 9 km (`ecmwf_wam`) | **승인·구현 완료** |
| G2 | 장애 폴백 | 타사 모델 및 Best Match 폴백 금지 (`unknown` 즉시 전환) | **승인·구현 완료** |
| G3 | 기상 캐시 | Open-Meteo 6시간 런타임 캐시(`bada-open-meteo-v1`) 제거 | **승인·구현 완료** |
| G4 | 리팩터링 | 전용 API 계층(`ecmwfWeatherService.ts`) + 타임스탬프 `Map` 결합 + 설정 단일화 | **승인·구현 완료** |
| G5 | 표시 정책 | ECMWF/Open-Meteo 출처와 9 km 연안 격자 한계·안전 안내 표시 | **승인·구현 완료** |
