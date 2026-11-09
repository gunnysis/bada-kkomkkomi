import type {
  HourlyMarineWeather,
  MarineWeatherGrade,
  WeatherThresholds,
} from '../types/weather';
import type { WeatherDefaultsConfig } from '../types/config';

/**
 * ECMWF 전용 해상기상 모델 식별자 상수 (변경 및 외부 오버라이드 불가)
 * - 10m 풍속: ECMWF IFS HRES 9km (`ecmwf_ifs`)
 * - 유의파고: ECMWF WAM HRES 9km (`ecmwf_wam`)
 */
export const ECMWF_WEATHER_MODELS = {
  wind: 'ecmwf_ifs',
  wave: 'ecmwf_wam',
} as const;

export const SAFE_DEFAULT_THRESHOLDS: WeatherThresholds = {
  windKnot: { good: 14, moderate: 20 },
  waveMeter: { good: 1.0, moderate: 1.8 },
};

export interface RawAlignedHourlyWeather {
  time: string;
  datePart: string;
  hourPart: string;
  displayTime: string;
  windSpeedKnots: number | null;
  waveHeightMeters: number | null;
}

/**
 * 임계값 유효성 검사 (`0 < good < moderate`)
 */
export function isValidThresholdPair(pair: unknown): pair is { good: number; moderate: number } {
  if (!pair || typeof pair !== 'object') return false;
  const p = pair as { good?: unknown; moderate?: unknown };
  return (
    typeof p.good === 'number' &&
    typeof p.moderate === 'number' &&
    Number.isFinite(p.good) &&
    Number.isFinite(p.moderate) &&
    p.good > 0 &&
    p.good < p.moderate
  );
}

export function isValidWeatherThresholds(value: unknown): value is WeatherThresholds {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WeatherThresholds>;
  return isValidThresholdPair(v.windKnot) && isValidThresholdPair(v.waveMeter);
}

/**
 * 설정 우선순위 결정:
 * 1순위: 사용자가 저장한 로컬 임계값 (유효한 경우)
 * 2순위: app_config.json의 weather_defaults (유효한 경우)
 * 3순위: 코드 내 안전 기본값 (SAFE_DEFAULT_THRESHOLDS)
 */
export function resolveEffectiveThresholds(
  userSaved: unknown,
  configDefaults?: WeatherDefaultsConfig | null,
): WeatherThresholds {
  if (isValidWeatherThresholds(userSaved)) {
    return userSaved;
  }
  if (configDefaults) {
    const candidate: WeatherThresholds = {
      windKnot: configDefaults.wind_threshold_knot,
      waveMeter: configDefaults.wave_threshold_meter,
    };
    if (isValidWeatherThresholds(candidate)) {
      return candidate;
    }
  }
  return SAFE_DEFAULT_THRESHOLDS;
}

/**
 * 좌표 유효성 검증 및 ECMWF 전용 API 요청 URL 생성
 * - 호출자가 모델 식별자를 인자로 덮어쓸 수 없으며 항상 `ecmwf_ifs`와 `ecmwf_wam`으로 고정됩니다.
 */
export function buildEcmwfWeatherUrls(lat: number, lng: number): {
  windForecastUrl: string;
  waveMarineUrl: string;
} {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('유효하지 않은 해역 좌표입니다.');
  }
  const latStr = lat.toFixed(4);
  const lngStr = lng.toFixed(4);

  const windForecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lngStr}&hourly=wind_speed_10m&wind_speed_unit=kn&models=${ECMWF_WEATHER_MODELS.wind}&timezone=Asia%2FSeoul`;
  const waveMarineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latStr}&longitude=${lngStr}&hourly=wave_height&models=${ECMWF_WEATHER_MODELS.wave}&timezone=Asia%2FSeoul`;

  return { windForecastUrl, waveMarineUrl };
}

export function getKstCurrentHourPrefix(nowDate = new Date()): string {
  const kstTime = new Date(
    nowDate.getTime() + (9 * 60 + nowDate.getTimezoneOffset()) * 60000,
  );
  const yyyy = kstTime.getFullYear();
  const mm = String(kstTime.getMonth() + 1).padStart(2, '0');
  const dd = String(kstTime.getDate()).padStart(2, '0');
  const hh = String(kstTime.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}`;
}

function normalizeFiniteOrNull(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function parseKstDisplayParts(timeStr: string): {
  datePart: string;
  hourPart: string;
  displayTime: string;
} {
  const [dateSection, timeSection] = timeStr.split('T');
  const [, monthStr = '00', dayStr = '00'] = (dateSection || '').split('-');
  const hourStr = (timeSection || '00:00').slice(0, 2);
  const datePart = `${monthStr}/${dayStr}`;
  const hourPart = `${hourStr}시`;
  return {
    datePart,
    hourPart,
    displayTime: `${datePart} ${hourPart}`,
  };
}

/**
 * 풍속(ECMWF IFS) 응답과 파고(ECMWF WAM) 응답을 배열 인덱스가 아닌
 * 동일한 KST 타임스탬프(`YYYY-MM-DDTHH:mm`) 키 기준으로 정렬·결합하는 순수 함수
 */
export function alignEcmwfWindAndWaveSeries(params: {
  windTimes: unknown;
  windValues: unknown;
  waveTimes: unknown;
  waveValues: unknown;
  nowHourPrefix?: string;
  maxHours?: number;
}): RawAlignedHourlyWeather[] {
  const {
    windTimes,
    windValues,
    waveTimes,
    waveValues,
    nowHourPrefix = getKstCurrentHourPrefix(),
    maxHours = 48,
  } = params;

  if (
    !Array.isArray(windTimes) ||
    !Array.isArray(windValues) ||
    !Array.isArray(waveTimes) ||
    !Array.isArray(waveValues)
  ) {
    throw new Error('ECMWF 예보 응답의 시간축 또는 데이터 배열 형식이 올바르지 않습니다.');
  }

  if (
    windTimes.length === 0 ||
    waveTimes.length === 0 ||
    windTimes.length !== windValues.length ||
    waveTimes.length !== waveValues.length
  ) {
    throw new Error('ECMWF 풍속·파고 시계열 배열 길이가 일치하지 않거나 비어 있습니다.');
  }

  const windMap = new Map<string, number | null>();
  for (let i = 0; i < windTimes.length; i++) {
    const t = windTimes[i];
    if (typeof t === 'string' && t.includes('T')) {
      windMap.set(t, normalizeFiniteOrNull(windValues[i]));
    }
  }

  const waveMap = new Map<string, number | null>();
  for (let i = 0; i < waveTimes.length; i++) {
    const t = waveTimes[i];
    if (typeof t === 'string' && t.includes('T')) {
      waveMap.set(t, normalizeFiniteOrNull(waveValues[i]));
    }
  }

  const unionTimes = Array.from(new Set([...windMap.keys(), ...waveMap.keys()])).sort();
  if (unionTimes.length === 0) {
    throw new Error('해당 좌표의 유효한 ECMWF 시계열 타임스탬프가 없습니다.');
  }

  let startIndex = unionTimes.findIndex((t) => t >= nowHourPrefix);
  if (startIndex === -1) startIndex = 0;

  const targetTimes = unionTimes.slice(startIndex, startIndex + maxHours);
  return targetTimes.map((timeStr) => {
    const parts = parseKstDisplayParts(timeStr);
    const windSpeedKnots = windMap.has(timeStr) ? (windMap.get(timeStr) ?? null) : null;
    const waveHeightMeters = waveMap.has(timeStr) ? (waveMap.get(timeStr) ?? null) : null;

    return {
      time: timeStr,
      datePart: parts.datePart,
      hourPart: parts.hourPart,
      displayTime: parts.displayTime,
      windSpeedKnots,
      waveHeightMeters,
    };
  });
}

export function judgeSingleWeatherMetric(
  value: number | null,
  thresholds: { good: number; moderate: number },
): MarineWeatherGrade {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value < thresholds.good) return 'good';
  if (value <= thresholds.moderate) return 'moderate';
  return 'bad';
}

/**
 * 동일 타임스탬프에 유효한 풍속(ECMWF IFS)과 파고(ECMWF WAM)가 모두 존재할 때만
 * 3단계 등급(good / moderate / bad)을 판정하고, 어느 한쪽이라도 결측(unknown)이면
 * 해당 시각 전체를 'unknown'('?')으로 처리합니다 (docs/ecmwf_weather_forecast_research_and_design.md 5.3항).
 */
export function evaluateCombinedWeatherGrade(
  windGrade: MarineWeatherGrade,
  waveGrade: MarineWeatherGrade,
): MarineWeatherGrade {
  if (windGrade === 'unknown' || waveGrade === 'unknown') {
    return 'unknown';
  }
  if (windGrade === 'bad' || waveGrade === 'bad') {
    return 'bad';
  }
  if (windGrade === 'moderate' || waveGrade === 'moderate') {
    return 'moderate';
  }
  return 'good';
}

export function evaluateHourlyWeatherSeries(
  rawSeries: RawAlignedHourlyWeather[],
  thresholds: WeatherThresholds,
): HourlyMarineWeather[] {
  return rawSeries.map((item) => {
    const windGrade = judgeSingleWeatherMetric(item.windSpeedKnots, thresholds.windKnot);
    const waveGrade = judgeSingleWeatherMetric(item.waveHeightMeters, thresholds.waveMeter);
    const grade = evaluateCombinedWeatherGrade(windGrade, waveGrade);
    return {
      ...item,
      grade,
      windGrade,
      waveGrade,
    };
  });
}

/**
 * ECMWF 전용 풍속(IFS HRES) 및 파고(WAM HRES) 동시 조회
 * - 타 모델(Best Match, GFS, ICON 등) 폴백 금지
 * - 브라우저/SW 캐시 재사용 방지를 위해 `cache: 'no-store'` 적용
 */
export async function fetchEcmwfMarineWeatherSeries(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<RawAlignedHourlyWeather[]> {
  const { windForecastUrl, waveMarineUrl } = buildEcmwfWeatherUrls(lat, lng);

  const [waveRes, windRes] = await Promise.all([
    fetch(waveMarineUrl, { signal, cache: 'no-store' }),
    fetch(windForecastUrl, { signal, cache: 'no-store' }),
  ]);

  if (!waveRes.ok || !windRes.ok) {
    throw new Error(
      `ECMWF 예보 서버 응답 오류 (WAM ${waveRes.status} / IFS ${windRes.status})`,
    );
  }

  const [waveJson, windJson] = await Promise.all([waveRes.json(), windRes.json()]);

  return alignEcmwfWindAndWaveSeries({
    windTimes: windJson?.hourly?.time,
    windValues: windJson?.hourly?.wind_speed_10m,
    waveTimes: waveJson?.hourly?.time,
    waveValues: waveJson?.hourly?.wave_height,
  });
}
