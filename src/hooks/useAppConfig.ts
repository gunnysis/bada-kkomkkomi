import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, MapLayerConfig } from '../types/config';
import {
  buildDefaultLayerStyle,
  type GitHubSyncResult,
  type LayerReleaseSnapshot,
  type SpatialFeatureCollection,
} from '../types/spatialLayer';
import {
  listReleaseSnapshots,
  loadOperationalLayerState,
  loadSyncOperationalMetaFromLocalStorage,
  saveOperationalLayerState,
  updateOperationalSyncMetadata,
} from '../services/layerStorageService';
import { commitLayersToGitHubRepository } from '../services/githubLayerSyncService';
import { reprojectAndNormalizeFeatureCollection } from '../services/spatialFileParser';

const DEFAULT_LAYERS: MapLayerConfig[] = [
  {
    id: 'docking',
    name: '갯바위 접안 포인트',
    visible: true,
    color: '#38bdf8',
    description: '5개 색상별 접안 안전도 및 현장 정보',
    isSystemLayer: true,
    geometryTypes: ['Point'],
    featureCount: 55,
  },
  {
    id: 'national_park',
    name: '한려해상국립공원 경계',
    visible: true,
    color: '#10b981',
    url: '/data/layers/national_park.geojson',
    description: '국립공원 관할 공원구역 경계선',
    geometryTypes: ['Polygon'],
    style: buildDefaultLayerStyle('#10b981', 'national_park', 'name'),
  },
  {
    id: 'protected_area',
    name: '특별보호구역',
    visible: true,
    color: '#a855f7',
    url: '/data/layers/protected_area.geojson',
    description: '출입통제 및 해양생물 특별보호구역',
    geometryTypes: ['Polygon'],
    style: buildDefaultLayerStyle('#a855f7', 'protected_area', 'name'),
  },
];

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
  layers: DEFAULT_LAYERS,
};

const STORAGE_KEY_ADMIN_EMAIL = 'bada_custom_admin_email';

function enrichLayerWithDefaults(layer: MapLayerConfig): MapLayerConfig {
  const isDocking = layer.id === 'docking' || layer.isSystemLayer;
  return {
    ...layer,
    isSystemLayer: isDocking ? true : layer.isSystemLayer,
    style:
      layer.style ??
      buildDefaultLayerStyle(layer.color || '#10b981', layer.id, 'name'),
  };
}

export function useAppConfig() {
  const syncBootMeta = loadSyncOperationalMetaFromLocalStorage();

  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [layers, setLayers] = useState<MapLayerConfig[]>(() =>
    syncBootMeta?.layers
      ? syncBootMeta.layers.map(enrichLayerWithDefaults)
      : DEFAULT_CONFIG.layers.map(enrichLayerWithDefaults),
  );
  const [geoJsonLayersData, setGeoJsonLayersData] = useState<
    Record<string, SpatialFeatureCollection>
  >({});
  const [layerLoadErrorIds, setLayerLoadErrorIds] = useState<string[]>([]);
  const [releaseId, setReleaseId] = useState<string>(
    syncBootMeta?.releaseId ?? 'REL-INITIAL',
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>(
    syncBootMeta?.updatedAt ?? '',
  );
  const [remoteSyncStatus, setRemoteSyncStatus] = useState<
    'synced' | 'local_only' | 'pending' | 'failed'
  >(syncBootMeta?.remoteSyncStatus ?? 'local_only');
  const [remoteCommitUrl, setRemoteCommitUrl] = useState<string | undefined>(
    syncBootMeta?.remoteCommitUrl,
  );
  const [snapshots, setSnapshots] = useState<LayerReleaseSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStaticGeoJsonForLayers = useCallback(
    async (
      targetLayers: MapLayerConfig[],
      existingGeoJsonMap: Record<string, SpatialFeatureCollection>,
    ) => {
      const mergedMap: Record<string, SpatialFeatureCollection> = {
        ...existingGeoJsonMap,
      };
      const failedIds: string[] = [];

      await Promise.all(
        targetLayers.map(async (layer) => {
          if (layer.id === 'docking' || layer.isSystemLayer) return;
          if (mergedMap[layer.id]) return;
          if (!layer.url) return;

          const fullUrl = `${import.meta.env.BASE_URL}${layer.url.replace(/^\/+/, '')}`;
          try {
            const res = await fetch(fullUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const rawData = await res.json();
            const normalized = reprojectAndNormalizeFeatureCollection(
              rawData,
              'EPSG:4326',
              false,
            );
            mergedMap[layer.id] = normalized.featureCollection;
          } catch {
            failedIds.push(layer.id);
          }
        }),
      );

      setGeoJsonLayersData(mergedMap);
      setLayerLoadErrorIds(failedIds);

      // 피처 개수 및 BBox 자동 보강
      setLayers((prev) =>
        prev.map((l) => {
          const fc = mergedMap[l.id];
          if (!fc) return l;
          const norm = reprojectAndNormalizeFeatureCollection(fc, 'EPSG:4326', false);
          return {
            ...l,
            featureCount: fc.features.length,
            geometryTypes:
              norm.geometryTypes.length > 0 ? norm.geometryTypes : l.geometryTypes,
            bbox: norm.bbox,
          };
        }),
      );

      return mergedMap;
    },
    [],
  );

  // 초기 부팅: app_config.json + IndexedDB 영속 운영 상태 통합 로드
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const configUrl = `${import.meta.env.BASE_URL}config/app_config.json`;

    async function bootstrap() {
      let staticConfig: AppConfig = DEFAULT_CONFIG;
      try {
        const res = await fetch(configUrl, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as AppConfig;
          const savedEmail = localStorage.getItem(STORAGE_KEY_ADMIN_EMAIL);
          if (savedEmail) {
            data.admin.report_recipient_email = savedEmail;
          }
          staticConfig = data;
        }
      } catch {
        // 정적 파일 실패 시 기본 설정 사용
      }

      if (!isMounted) return;
      setConfig(staticConfig);

      // 기기 내 영속 저장소(IndexedDB/localStorage)에 저장된 운영 상태 확인
      const savedOpState = await loadOperationalLayerState();
      const snapList = await listReleaseSnapshots();
      if (!isMounted) return;
      setSnapshots(snapList);

      const activeLayers = (
        savedOpState?.layers && savedOpState.layers.length > 0
          ? savedOpState.layers
          : staticConfig.layers || DEFAULT_LAYERS
      ).map(enrichLayerWithDefaults);

      if (savedOpState) {
        setReleaseId(savedOpState.releaseId);
        setLastSavedAt(savedOpState.updatedAt);
        setRemoteSyncStatus(savedOpState.remoteSyncStatus ?? 'local_only');
        setRemoteCommitUrl(savedOpState.remoteCommitUrl);
      }

      setLayers(activeLayers);
      await fetchStaticGeoJsonForLayers(
        activeLayers,
        savedOpState?.geoJsonById ?? {},
      );

      if (isMounted) {
        setIsLoading(false);
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [fetchStaticGeoJsonForLayers]);

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

  // 빠른 레이어 표시/숨김 토글 (즉시 로컬 운영 상태에도 반영하여 새로고침 시 유지)
  const toggleLayer = useCallback(
    (layerId: string) => {
      setLayers((prev) => {
        const next = prev.map((l) =>
          l.id === layerId ? { ...l, visible: !l.visible } : l,
        );
        void saveOperationalLayerState({
          layers: next,
          geoJsonById: geoJsonLayersData,
          summary: `레이어 표시 여부 변경 (${layerId})`,
          remoteSyncStatus,
          remoteCommitUrl,
        }).then((saved) => {
          setReleaseId(saved.releaseId);
          setLastSavedAt(saved.updatedAt);
          void listReleaseSnapshots().then(setSnapshots);
        });
        return next;
      });
    },
    [geoJsonLayersData, remoteSyncStatus, remoteCommitUrl],
  );

  /**
   * [핵심] 관리 화면의 [저장 (운영 반영)] 버튼 실행 핸들러:
   * 1. 런타임 지도 상태(layers + geoJsonLayersData) 즉시 반영
   * 2. 기기 영속 저장소(IndexedDB + localStorage) 즉시 커밋 및 스냅샷 생성
   * 3. 원격 GitHub 저장소(main) 자동 커밋 및 GitHub Pages 배포 트리거
   */
  const saveOperationalLayers = useCallback(
    async (params: {
      nextLayers: MapLayerConfig[];
      nextGeoJsonById: Record<string, SpatialFeatureCollection>;
      summary?: string;
    }): Promise<{
      releaseId: string;
      updatedAt: string;
      syncResult: GitHubSyncResult;
    }> => {
      const enrichedLayers = params.nextLayers.map(enrichLayerWithDefaults);
      const cleanGeoJsonById: Record<string, SpatialFeatureCollection> = {};
      for (const layer of enrichedLayers) {
        if (layer.id === 'docking' || layer.isSystemLayer) continue;
        const fc = params.nextGeoJsonById[layer.id];
        if (fc) {
          cleanGeoJsonById[layer.id] = fc;
        }
      }

      // 1. 런타임 상태 즉시 반영 (지도 0ms 갱신)
      setLayers(enrichedLayers);
      setGeoJsonLayersData(cleanGeoJsonById);
      setLayerLoadErrorIds([]);

      // 2. IndexedDB + localStorage 즉시 운영 커밋
      const savedState = await saveOperationalLayerState({
        layers: enrichedLayers,
        geoJsonById: cleanGeoJsonById,
        summary: params.summary,
        remoteSyncStatus: 'pending',
      });

      setReleaseId(savedState.releaseId);
      setLastSavedAt(savedState.updatedAt);
      setRemoteSyncStatus('pending');

      // 3. 원격 GitHub 저장소 자동 커밋 시도
      const syncResult = await commitLayersToGitHubRepository({
        baseAppConfig: config,
        layers: enrichedLayers,
        geoJsonById: cleanGeoJsonById,
        releaseId: savedState.releaseId,
        summary: savedState.summary,
      });

      await updateOperationalSyncMetadata({
        releaseId: savedState.releaseId,
        remoteSyncStatus: syncResult.status,
        remoteCommitSha: syncResult.commitSha,
        remoteCommitUrl: syncResult.commitUrl,
      });

      setRemoteSyncStatus(syncResult.status);
      setRemoteCommitUrl(syncResult.commitUrl);
      const updatedSnapshots = await listReleaseSnapshots();
      setSnapshots(updatedSnapshots);

      return {
        releaseId: savedState.releaseId,
        updatedAt: savedState.updatedAt,
        syncResult,
      };
    },
    [config],
  );

  const retryFailedGeoJsonLayers = useCallback(() => {
    void fetchStaticGeoJsonForLayers(layers, geoJsonLayersData);
  }, [fetchStaticGeoJsonForLayers, layers, geoJsonLayersData]);

  return {
    config,
    layers,
    geoJsonLayersData,
    layerLoadErrorIds,
    releaseId,
    lastSavedAt,
    remoteSyncStatus,
    remoteCommitUrl,
    snapshots,
    isLoading,
    updateAdminEmail,
    toggleLayer,
    saveOperationalLayers,
    retryFailedGeoJsonLayers,
  };
}
