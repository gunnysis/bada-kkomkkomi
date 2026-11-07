import { useState, useEffect, useCallback, useRef } from 'react';
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

function judgeMetric(value: number | null, thresholds: { good: number; moderate: number }): MarineWeatherGrade {
  if (value === null || Number.isNaN(value)) return 'unknown';
  if (value < thresholds.good) return 'good';
  if (value <= thresholds.moderate) return 'moderate';
  return 'bad';
}

function calculateOverallGrade(
  windGrade: MarineWeatherGrade,
  waveGrade: MarineWeatherGrade
): MarineWeatherGrade {
  if (windGrade === 'bad' || waveGrade === 'bad') return 'bad';
  if (windGrade === 'moderate' || waveGrade === 'moderate') return 'moderate';
  if (windGrade === 'good' && waveGrade === 'good') return 'good';
  if (windGrade === 'unknown' && waveGrade === 'unknown') return 'unknown';
  return windGrade !== 'unknown' ? windGrade : waveGrade;
}

export function useMarineWeather(initialLat = 34.8195, initialLng = 128.552) {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });

  const [thresholds, setThresholds] = useState<WeatherThresholds>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_THRESHOLDS;
  });

  const [hourlyData, setHourlyData] = useState<HourlyMarineWeather[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 기준치 저장
  const updateThresholds = useCallback((newThresholds: WeatherThresholds) => {
    setThresholds(newThresholds);
    try {
      localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(newThresholds));
    } catch {}
  }, []);

  // Open-Meteo API 호출
  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=wave_height&timezone=Asia%2FSeoul`;
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=wind_speed_10m&wind_speed_unit=kn&timezone=Asia%2FSeoul`;

    try {
      const [marineRes, forecastRes] = await Promise.all([
        fetch(marineUrl, { signal: controller.signal }),
        fetch(forecastUrl, { signal: controller.signal }),
      ]);

      if (!marineRes.ok || !forecastRes.ok) {
        throw new Error('해상기상 데이터를 조회할 수 없습니다.');
      }

      const marineJson = await marineRes.json();
      const forecastJson = await forecastRes.json();

      const times: string[] = marineJson.hourly?.time || forecastJson.hourly?.time || [];
      const waveHeights: (number | null)[] = marineJson.hourly?.wave_height || [];
      const windSpeeds: (number | null)[] = forecastJson.hourly?.wind_speed_10m || [];

      // 현재 시각 기준 이후 48시간 데이터 추출
      const nowStr = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
      let startIndex = times.findIndex((t) => t.startsWith(nowStr));
      if (startIndex === -1) startIndex = 0;
      const targetTimes = times.slice(startIndex, startIndex + 48);

      const parsedHourly: HourlyMarineWeather[] = targetTimes.map((timeStr, idx) => {
        const globalIdx = startIndex + idx;
        const wave = waveHeights[globalIdx] ?? null;
        const wind = windSpeeds[globalIdx] ?? null;

        const waveGrade = judgeMetric(wave, thresholds.waveMeter);
        const windGrade = judgeMetric(wind, thresholds.windKnot);
        const grade = calculateOverallGrade(windGrade, waveGrade);

        // 표시용 시간 포맷 (예: "11/07 14시")
        const dateObj = new Date(timeStr);
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const d = dateObj.getDate().toString().padStart(2, '0');
        const h = dateObj.getHours().toString().padStart(2, '0');
        const displayTime = `${m}/${d} ${h}시`;

        return {
          time: timeStr,
          displayTime,
          windSpeedKnots: wind,
          waveHeightMeters: wave,
          grade,
          windGrade,
          waveGrade,
        };
      });

      setHourlyData(parsedHourly);
      setSelectedIndex(0);
      setLastFetchedAt(Date.now());
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : '기상 정보를 불러오지 못했습니다.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [thresholds]);

  // 좌표 변경 시 조회
  useEffect(() => {
    void fetchWeather(coords.lat, coords.lng);
  }, [coords.lat, coords.lng, fetchWeather]);

  const updateCoordinates = useCallback((lat: number, lng: number) => {
    setCoords({ lat, lng });
  }, []);

  const currentItem = hourlyData[selectedIndex] || null;

  const result: MarineWeatherStatusResult = {
    lat: coords.lat,
    lng: coords.lng,
    hourly: hourlyData,
    selectedIndex,
    current: currentItem,
    isLoading,
    error,
    lastFetchedAt,
  };

  return {
    ...result,
    thresholds,
    setSelectedIndex,
    updateCoordinates,
    updateThresholds,
    refresh: () => fetchWeather(coords.lat, coords.lng),
  };
}
