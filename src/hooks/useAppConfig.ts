import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, MapLayerConfig } from '../types/config';

const DEFAULT_CONFIG: AppConfig = {
  admin: {
    report_recipient_email: 'marine_admin@knps.or.kr',
    report_cc_email: 'field_safety@knps.or.kr',
    department_name: '국립공원공단 해양조사팀',
  },
  default_region: {
    name: '경상남도 통영·거제 해역',
    center: [34.8195, 128.552],
    zoom: 11,
  },
  route_defaults: {
    default_speed_knots: 15,
  },
  weather_defaults: {
    wind_threshold_knot: { good: 14, moderate: 20 },
    wave_threshold_meter: { good: 1.0, moderate: 1.8 },
  },
  layers: [
    {
      id: 'docking',
      name: '갯바위 접안 포인트',
      visible: true,
      color: '#38bdf8',
      description: '5개 색상별 접안 안전도 및 현장 정보',
    },
    {
      id: 'national_park',
      name: '한려해상국립공원 경계',
      visible: true,
      color: '#10b981',
      url: '/data/layers/national_park.geojson',
      description: '국립공원 관할 공원구역 경계선',
    },
    {
      id: 'protected_area',
      name: '특별보호구역',
      visible: true,
      color: '#a855f7',
      url: '/data/layers/protected_area.geojson',
      description: '출입통제 및 해양생물 특별보호구역',
    },
  ],
};

const STORAGE_KEY_ADMIN_EMAIL = 'bada_custom_admin_email';

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [layers, setLayers] = useState<MapLayerConfig[]>(DEFAULT_CONFIG.layers);
  const [isLoading, setIsLoading] = useState(true);

  // app_config.json 정적 로드
  useEffect(() => {
    const controller = new AbortController();
    const configUrl = `${import.meta.env.BASE_URL}config/app_config.json`;

    fetch(configUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load app_config.json');
        return res.json();
      })
      .then((data: AppConfig) => {
        // 로컬 오버라이드 이메일이 있다면 반영
        const savedEmail = localStorage.getItem(STORAGE_KEY_ADMIN_EMAIL);
        if (savedEmail) {
          data.admin.report_recipient_email = savedEmail;
        }
        setConfig(data);
        setLayers(data.layers || DEFAULT_CONFIG.layers);
      })
      .catch(() => {
        // 폴백 기본 설정 유지
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  // 운영자 이메일 로컬 수정
  const updateAdminEmail = useCallback((newEmail: string) => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY_ADMIN_EMAIL, trimmed);
    setConfig((prev) => ({
      ...prev,
      admin: {
        ...prev.admin,
        report_recipient_email: trimmed,
      },
    }));
  }, []);

  // 공간정보 레이어 가시성 토글
  const toggleLayer = useCallback((layerId: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  }, []);

  return {
    config,
    layers,
    isLoading,
    updateAdminEmail,
    toggleLayer,
  };
}
