import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  HourlyMarineWeather,
  MarineWeatherGrade,
  MarineWeatherStatusResult,
  WeatherThresholds,
} from '../types/weather';

const STORAGE_KEY_THRESHOLDS = 'bada_weather_thresholds_v1';

export const DEFAULT_THRESHOLDS: WeatherThresholds = {
  windKnot: { good: 14, moderate: 20 },
  waveMeter: { good: 1.0, moderate: 1.8 },
};

interface RawHourlyEntry {
  time: string;
  datePart: string;
  hourPart: string;
  displayTime: string;
  windSpeedKnots: number | null;
  waveHeightMeters: number | null;
}

function judgeMetric(
  value: number | null,
  thresholds: { good: number; moderate: number },
): MarineWeatherGrade {
  if (value === null || Number.isNaN(value)) return 'unknown';
  if (value < thresholds.good) return 'good';
  if (value <= thresholds.moderate) return 'moderate';
  return 'bad';
}

/**
 * 풍속과 파고 각각 판정 후 더 나쁜 등급을 최종 결과로 적용
 * - 단, 하나라도 'bad'이면 'bad'
 * - 자료가 없거나 조회 실패('unknown')인 항목이 있으면 '좋음'이나 '보통'으로 판정하지 않고 'unknown'('?') 반환
 */
function calculateOverallGrade(
  windGrade: MarineWeatherGrade,
  waveGrade: MarineWeatherGrade,
): MarineWeatherGrade {
  if (windGrade === 'bad' || waveGrade === 'bad') return 'bad';
  if (windGrade === 'unknown' || waveGrade === 'unknown') return 'unknown';
  if (windGrade === 'moderate' || waveGrade === 'moderate') return 'moderate';
  return 'good';
}

function getKstCurrentHourPrefix(): string {
  const now = new Date();
  // Asia/Seoul (UTC+9) 기준 YYYY-MM-DDTHH 생성
  const kstTime = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  const yyyy = kstTime.getFullYear();
  const mm = String(kstTime.getMonth() + 1).padStart(2, '0');
  const dd = String(kstTime.getDate()).padStart(2, '0');
  const hh = String(kstTime.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}`;
}

export function useMarineWeather(initialLat = 34.8195, initialLng = 128.552) {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [fetchNonce, setFetchNonce] = useState<number>(0);

  const [thresholds, setThresholds] = useState<WeatherThresholds>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
      if (raw) return JSON.parse(raw) as WeatherThresholds;
    } catch {
      // ignore storage error
    }
    return DEFAULT_THRESHOLDS;
  });

  const [rawHourly, setRawHourly] = useState<RawHourlyEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 기준치 저장 (네트워크 재요청 없이 useMemo로 즉시 재판정)
  const updateThresholds = useCallback((newThresholds: WeatherThresholds) => {
    setThresholds(newThresholds);
    try {
      localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(newThresholds));
    } catch {
      // ignore storage error
    }
  }, []);

  // 좌표 또는 수동 새로고침 시 Open-Meteo API 비동기 조회 (Effect 내 동기 setState 제거)
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${coords.lat.toFixed(4)}&longitude=${coords.lng.toFixed(4)}&hourly=wave_height&timezone=Asia%2FSeoul`;
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat.toFixed(4)}&longitude=${coords.lng.toFixed(4)}&hourly=wind_speed_10m&wind_speed_unit=kn&timezone=Asia%2FSeoul`;

    Promise.all([
      fetch(marineUrl, { signal: controller.signal }),
      fetch(forecastUrl, { signal: controller.signal }),
    ])
      .then(async ([marineRes, forecastRes]) => {
        if (!marineRes.ok || !forecastRes.ok) {
          throw new Error('해상기상 예보 서버 응답 오류');
        }

        const marineJson = await marineRes.json();
        const forecastJson = await forecastRes.json();

        const times: string[] = marineJson.hourly?.time || forecastJson.hourly?.time || [];
        const waveHeights: (number | null)[] = marineJson.hourly?.wave_height || [];
        const windSpeeds: (number | null)[] = forecastJson.hourly?.wind_speed_10m || [];

        if (times.length === 0) {
          throw new Error('해당 좌표의 해상기상 예보 자료가 없습니다.');
        }

        const nowPrefix = getKstCurrentHourPrefix();
        let startIndex = times.findIndex((t) => t.startsWith(nowPrefix));
        if (startIndex === -1) startIndex = 0;

        const targetTimes = times.slice(startIndex, startIndex + 48);
        const parsedRaw: RawHourlyEntry[] = targetTimes.map((timeStr, idx) => {
          const globalIdx = startIndex + idx;
          const wave = waveHeights[globalIdx] ?? null;
          const wind = windSpeeds[globalIdx] ?? null;

          // "YYYY-MM-DDTHH:mm" 직접 파싱으로 타임존 왜곡 원천 차단
          const [dateSection, timeSection] = timeStr.split('T');
          const [, monthStr, dayStr] = (dateSection || '').split('-');
          const hourStr = (timeSection || '00:00').slice(0, 2);
          const datePart = `${monthStr}/${dayStr}`;
          const hourPart = `${hourStr}시`;

          return {
            time: timeStr,
            datePart,
            hourPart,
            displayTime: `${datePart} ${hourPart}`,
            windSpeedKnots: wind,
            waveHeightMeters: wave,
          };
        });

        setRawHourly(parsedRaw);
        setSelectedIndex(0);
        setError(null);
        setLastFetchedAt(Date.now());
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg =
          err instanceof Error ? err.message : '기상 정보를 불러오지 못했습니다.';
        // 조회 실패 시 이전 좌표의 좋음/보통 상태가 남지 않도록 즉시 비움 -> '?'(unknown) 표시 보장
        setRawHourly([]);
        setError(msg);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [coords.lat, coords.lng, fetchNonce]);

  // 기준치(thresholds)와 원시 예보 데이터를 결합해 3단계 등급 도출
  const hourlyData: HourlyMarineWeather[] = useMemo(() => {
    return rawHourly.map((item) => {
      const waveGrade = judgeMetric(item.waveHeightMeters, thresholds.waveMeter);
      const windGrade = judgeMetric(item.windSpeedKnots, thresholds.windKnot);
      const grade = calculateOverallGrade(windGrade, waveGrade);
      return {
        ...item,
        grade,
        windGrade,
        waveGrade,
      };
    });
  }, [rawHourly, thresholds]);

  const updateCoordinates = useCallback((lat: number, lng: number) => {
    setIsLoading(true);
    setError(null);
    setRawHourly([]); // 새 위치 조회 중에는 '?'(unknown)로 초기화하여 오판 방지
    setCoords({ lat, lng });
  }, []);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRawHourly([]);
    setFetchNonce((n) => n + 1);
  }, []);

  const currentItem = hourlyData[selectedIndex] || null;

  const result: MarineWeatherStatusResult = {
    lat: coords.lat,
    lng: coords.lng,
    hourly: hourlyData,
    selectedIndex,
    setSelectedIndex,
    current: currentItem,
    isLoading,
    error,
    lastFetchedAt,
  };

  return {
    ...result,
    thresholds,
    updateCoordinates,
    updateThresholds,
    refresh,
  };
}
