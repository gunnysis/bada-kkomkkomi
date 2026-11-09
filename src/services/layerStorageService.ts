import type { MapLayerConfig } from '../types/config';
import type {
  LayerReleaseSnapshot,
  SpatialFeatureCollection,
} from '../types/spatialLayer';

const DB_NAME = 'bada_kkomkkomi_spatial_db';
const DB_VERSION = 1;
const STORE_OPERATIONAL = 'operational_state';
const STORE_SNAPSHOTS = 'release_snapshots';

const LS_KEY_OPERATIONAL_META = 'bada_operational_layers_meta_v2';
const LS_KEY_OPERATIONAL_GEOJSON_PREFIX = 'bada_operational_geojson_v2:';
const LS_KEY_SNAPSHOTS_FALLBACK = 'bada_operational_snapshots_v2';
const MAX_SNAPSHOTS = 12;

export interface OperationalLayerState {
  releaseId: string;
  updatedAt: string;
  summary: string;
  layers: MapLayerConfig[];
  geoJsonById: Record<string, SpatialFeatureCollection>;
  remoteSyncStatus?: 'synced' | 'local_only' | 'pending' | 'failed';
  remoteCommitSha?: string;
  remoteCommitUrl?: string;
}

function openSpatialDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OPERATIONAL)) {
        db.createObjectStore(STORE_OPERATIONAL, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'releaseId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open error'));
  });
}

/**
 * 로컬스토리지에서 동기적으로 마지막 운영 레이어 메타데이터를 즉시 조회 (초기 부팅 깜빡임 방지)
 */
export function loadSyncOperationalMetaFromLocalStorage(): {
  releaseId: string;
  updatedAt: string;
  summary: string;
  layers: MapLayerConfig[];
  remoteSyncStatus?: 'synced' | 'local_only' | 'pending' | 'failed';
  remoteCommitSha?: string;
  remoteCommitUrl?: string;
} | null {
  try {
    const raw = localStorage.getItem(LS_KEY_OPERATIONAL_META);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.layers)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 로컬스토리지 + IndexedDB에서 전체 운영 레이어 상태 및 GeoJSON 본문 로드
 */
export async function loadOperationalLayerState(): Promise<OperationalLayerState | null> {
  // 1. IndexedDB 우선 조회
  try {
    const db = await openSpatialDb();
    const record = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_OPERATIONAL, 'readonly');
      const store = tx.objectStore(STORE_OPERATIONAL);
      const req = store.get('current');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (record && Array.isArray(record.layers)) {
      return {
        releaseId: record.releaseId,
        updatedAt: record.updatedAt,
        summary: record.summary ?? '운영 반영 완료',
        layers: record.layers,
        geoJsonById: record.geoJsonById ?? {},
        remoteSyncStatus: record.remoteSyncStatus,
        remoteCommitSha: record.remoteCommitSha,
        remoteCommitUrl: record.remoteCommitUrl,
      };
    }
  } catch {
    // IndexedDB 접근 불가 시 localStorage 폴백
  }

  // 2. localStorage 폴백 조회
  const meta = loadSyncOperationalMetaFromLocalStorage();
  if (!meta) return null;
  const geoJsonById: Record<string, SpatialFeatureCollection> = {};
  for (const layer of meta.layers) {
    try {
      const gRaw = localStorage.getItem(`${LS_KEY_OPERATIONAL_GEOJSON_PREFIX}${layer.id}`);
      if (gRaw) {
        geoJsonById[layer.id] = JSON.parse(gRaw);
      }
    } catch {
      // ignore
    }
  }

  return {
    releaseId: meta.releaseId,
    updatedAt: meta.updatedAt,
    summary: meta.summary,
    layers: meta.layers,
    geoJsonById,
    remoteSyncStatus: meta.remoteSyncStatus,
    remoteCommitSha: meta.remoteCommitSha,
    remoteCommitUrl: meta.remoteCommitUrl,
  };
}

/**
 * 관리 화면에서 [저장] 클릭 시 호출:
 * 현재 레이어 설정 및 GeoJSON 데이터를 즉시 기기 영속 저장소(IndexedDB + localStorage)에 운영 상태로 확정하고
 * 버전 스냅샷 이력에 자동 등록합니다.
 */
export async function saveOperationalLayerState(params: {
  layers: MapLayerConfig[];
  geoJsonById: Record<string, SpatialFeatureCollection>;
  summary?: string;
  remoteSyncStatus?: 'synced' | 'local_only' | 'pending' | 'failed';
  remoteCommitSha?: string;
  remoteCommitUrl?: string;
}): Promise<OperationalLayerState> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes(),
  ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const releaseId = `REL-${datePart}`;
  const updatedAt = now.toISOString();
  const summary = params.summary || `공간 레이어 ${params.layers.length}건 운영 저장`;

  const state: OperationalLayerState = {
    releaseId,
    updatedAt,
    summary,
    layers: params.layers,
    geoJsonById: params.geoJsonById,
    remoteSyncStatus: params.remoteSyncStatus ?? 'local_only',
    remoteCommitSha: params.remoteCommitSha,
    remoteCommitUrl: params.remoteCommitUrl,
  };

  // 1. localStorage 즉시 미러링 (동기 부팅 및 오프라인 보장)
  try {
    localStorage.setItem(
      LS_KEY_OPERATIONAL_META,
      JSON.stringify({
        releaseId: state.releaseId,
        updatedAt: state.updatedAt,
        summary: state.summary,
        layers: state.layers,
        remoteSyncStatus: state.remoteSyncStatus,
        remoteCommitSha: state.remoteCommitSha,
        remoteCommitUrl: state.remoteCommitUrl,
      }),
    );
    for (const [layerId, fc] of Object.entries(state.geoJsonById)) {
      if (fc) {
        try {
          localStorage.setItem(
            `${LS_KEY_OPERATIONAL_GEOJSON_PREFIX}${layerId}`,
            JSON.stringify(fc),
          );
        } catch {
          // 용량 초과 시 IndexedDB가 본문을 담당
        }
      }
    }
  } catch {
    // ignore storage quota warning
  }

  const snapshot: LayerReleaseSnapshot = {
    releaseId: state.releaseId,
    createdAt: state.updatedAt,
    summary: state.summary,
    layers: state.layers,
    geoJsonById: state.geoJsonById,
    remoteSyncStatus: state.remoteSyncStatus,
    remoteCommitSha: state.remoteCommitSha,
    remoteCommitUrl: state.remoteCommitUrl,
  };

  // 2. IndexedDB 영구 커밋 및 스냅샷 이력 보관
  try {
    const db = await openSpatialDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_OPERATIONAL, STORE_SNAPSHOTS], 'readwrite');
      tx.objectStore(STORE_OPERATIONAL).put({
        key: 'current',
        ...state,
      });
      tx.objectStore(STORE_SNAPSHOTS).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 오래된 스냅샷 정리 (최대 MAX_SNAPSHOTS개 유지)
    const allSnaps = await listReleaseSnapshots();
    if (allSnaps.length > MAX_SNAPSHOTS) {
      const toDelete = allSnaps.slice(MAX_SNAPSHOTS);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        for (const item of toDelete) {
          store.delete(item.releaseId);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    // IndexedDB 실패 시 localStorage에 스냅샷 이력 백업
    try {
      const prevRaw = localStorage.getItem(LS_KEY_SNAPSHOTS_FALLBACK);
      const prevList: LayerReleaseSnapshot[] = prevRaw ? JSON.parse(prevRaw) : [];
      const nextList = [snapshot, ...prevList].slice(0, 5);
      localStorage.setItem(LS_KEY_SNAPSHOTS_FALLBACK, JSON.stringify(nextList));
    } catch {
      // ignore
    }
  }

  return state;
}

/**
 * 원격 GitHub 동기화 완료 후 현재 운영 상태의 원격 커밋 정보 업데이트
 */
export async function updateOperationalSyncMetadata(meta: {
  releaseId: string;
  remoteSyncStatus: 'synced' | 'local_only' | 'pending' | 'failed';
  remoteCommitSha?: string;
  remoteCommitUrl?: string;
}): Promise<void> {
  try {
    const lsMeta = loadSyncOperationalMetaFromLocalStorage();
    if (lsMeta && lsMeta.releaseId === meta.releaseId) {
      localStorage.setItem(
        LS_KEY_OPERATIONAL_META,
        JSON.stringify({
          ...lsMeta,
          remoteSyncStatus: meta.remoteSyncStatus,
          remoteCommitSha: meta.remoteCommitSha,
          remoteCommitUrl: meta.remoteCommitUrl,
        }),
      );
    }
  } catch {
    // ignore
  }

  try {
    const db = await openSpatialDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_OPERATIONAL, STORE_SNAPSHOTS], 'readwrite');
      const opStore = tx.objectStore(STORE_OPERATIONAL);
      const getReq = opStore.get('current');
      getReq.onsuccess = () => {
        if (getReq.result) {
          opStore.put({
            ...getReq.result,
            remoteSyncStatus: meta.remoteSyncStatus,
            remoteCommitSha: meta.remoteCommitSha,
            remoteCommitUrl: meta.remoteCommitUrl,
          });
        }
      };
      const snapStore = tx.objectStore(STORE_SNAPSHOTS);
      const snapReq = snapStore.get(meta.releaseId);
      snapReq.onsuccess = () => {
        if (snapReq.result) {
          snapStore.put({
            ...snapReq.result,
            remoteSyncStatus: meta.remoteSyncStatus,
            remoteCommitSha: meta.remoteCommitSha,
            remoteCommitUrl: meta.remoteCommitUrl,
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ignore
  }
}

/**
 * 저장된 운영 버전 스냅샷 이력 최신순 조회
 */
export async function listReleaseSnapshots(): Promise<LayerReleaseSnapshot[]> {
  try {
    const db = await openSpatialDb();
    const list = await new Promise<LayerReleaseSnapshot[]>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
      const req = tx.objectStore(STORE_SNAPSHOTS).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEY_SNAPSHOTS_FALLBACK);
      if (raw) {
        const parsed = JSON.parse(raw) as LayerReleaseSnapshot[];
        return parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    } catch {
      // ignore
    }
    return [];
  }
}
