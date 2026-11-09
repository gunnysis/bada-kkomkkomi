import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  HourlyMarineWeather,
  MarineWeatherStatusResult,
  WeatherThresholds,
} from '../types/weather';
import type { WeatherDefaultsConfig } from '../types/config';
import {
  evaluateHourlyWeatherSeries,
  fetchEcmwfMarineWeatherSeries,
  isValidWeatherThresholds,
  resolveEffectiveThresholds,
  SAFE_DEFAULT_THRESHOLDS,
  type RawAlignedHourlyWeather,
} from '../services/ecmwfWeatherService';

const STORAGE_KEY_THRESHOLDS = 'bada_weather_thresholds_v1';

export const DEFAULT_THRESHOLDS: WeatherThresholds = SAFE_DEFAULT_THRESHOLDS;

function readSavedUserThresholds(): WeatherThresholds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidWeatherThresholds(parsed)) {
      return parsed;
    }
  } catch {
    // ignore storage error
  }
  return null;
}

export function useMarineWeather(
  initialLat = 34.8195,
  initialLng = 128.552,
  configWeatherDefaults?: WeatherDefaultsConfig,
) {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [fetchNonce, setFetchNonce] = useState<number>(0);

  // 사용자가 직접 수정해 저장한 임계값 (없으면 null -> configWeatherDefaults -> SAFE_DEFAULT_THRESHOLDS 순으로 폴백)
  const [userThresholds, setUserThresholds] = useState<WeatherThresholds | null>(() =>
    readSavedUserThresholds(),
  );

  const thresholds = useMemo<WeatherThresholds>(
    () => resolveEffectiveThresholds(userThresholds, configWeatherDefaults),
    [userThresholds, configWeatherDefaults],
  );

  const [rawHourly, setRawHourly] = useState<RawAlignedHourlyWeather[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 기준치 저장 (네트워크 재요청 없이 useMemo로 즉시 재판정)
  const updateThresholds = useCallback((newThresholds: WeatherThresholds) => {
    if (!isValidWeatherThresholds(newThresholds)) return;
    setUserThresholds(newThresholds);
    try {
      localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(newThresholds));
    } catch {
      // ignore storage error
    }
  }, []);

  // 오프라인 전환 시 과거 예보를 정상 상태처럼 유지하지 않고 즉시 미확인('?')으로 전환 (설계서 5.4항)
  useEffect(() => {
    const handleOffline = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsLoading(false);
      setRawHourly([]);
      setError('오프라인 상태 — 실시간 ECMWF 예보를 확인할 수 없습니다.');
    };
    window.addEventListener('offline', handleOffline);
    return () => window.removeEventListener('offline', handleOffline);
  }, []);

  // 좌표 또는 수동 새로고침 시 ECMWF 전용(IFS + WAM) API 비동기 조회
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchEcmwfMarineWeatherSeries(coords.lat, coords.lng, controller.signal)
      .then((alignedSeries) => {
        if (controller.signal.aborted) return;
        setRawHourly(alignedSeries);
        setSelectedIndex(0);
        setError(null);
        setLastFetchedAt(Date.now());
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg =
          err instanceof Error ? err.message : 'ECMWF 기상 정보를 불러오지 못했습니다.';
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

  // 기준치(thresholds)와 타임스탬프 정렬된 원시 예보 데이터를 결합해 3단계 등급 도출
  const hourlyData: HourlyMarineWeather[] = useMemo(() => {
    return evaluateHourlyWeatherSeries(rawHourly, thresholds);
  }, [rawHourly, thresholds]);

  const updateCoordinates = useCallback((lat: number, lng: number) => {
    setIsLoading(true);
    setError(null);
    setRawHourly([]); // 새 위치 조회 중에는 '?'(unknown)로 초기화하여 오판 방지
    setCoords({ lat, lng });
    setFetchNonce((n) => n + 1); // 동일 좌표 재호출 시에도 무한 로딩 없이 즉시 재조회 보장
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
