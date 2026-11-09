import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  Eye,
  FileUp,
  FolderGit2,
  History,
  Layers,
  MapPin,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  MapLayerConfig,
  StrokeDashPattern,
} from '../../types/config';
import {
  buildDefaultLayerStyle,
  type GitHubSyncConfig,
  type GitHubSyncResult,
  type LayerReleaseSnapshot,
  type ParsedLayerCandidate,
  type SpatialFeature,
  type SpatialFeatureCollection,
  type SupportedCrsCode,
  type SupportedTextEncoding,
} from '../../types/spatialLayer';
import {
  createSampleGeoPackageFile,
  createSampleShapefileZip,
  KOREAN_CRS_DEFINITIONS,
  parseSpatialFiles,
  reprojectAndNormalizeFeatureCollection,
  reprojectLayerCandidate,
  simplifyFeatureCollection,
} from '../../services/spatialFileParser';
import {
  loadGitHubSyncConfig,
  saveGitHubSyncConfig,
} from '../../services/githubLayerSyncService';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface LayerControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: MapLayerConfig[];
  geoJsonLayersData: Record<string, SpatialFeatureCollection>;
  onToggleLayer: (layerId: string) => void;
  onSaveOperationalLayers: (params: {
    nextLayers: MapLayerConfig[];
    nextGeoJsonById: Record<string, SpatialFeatureCollection>;
    summary?: string;
  }) => Promise<{
    releaseId: string;
    updatedAt: string;
    syncResult: GitHubSyncResult;
  }>;
  onFlyToPoint?: (lat: number, lng: number, zoom?: number) => void;
  releaseId: string;
  lastSavedAt: string;
  remoteSyncStatus: 'synced' | 'local_only' | 'pending' | 'failed';
  remoteCommitUrl?: string;
  snapshots: LayerReleaseSnapshot[];
  showPorpoiseLayer: boolean;
  onTogglePorpoiseLayer: () => void;
  porpoiseCount: number;
}

type ModalWorkspaceTab = 'list' | 'import' | 'features' | 'history';

const LAYER_COLOR_PRESETS = [
  '#10b981', // 에메랄드 (공원구역)
  '#a855f7', // 퍼플 (특별보호구역)
  '#38bdf8', // 스카이 (해상항로/수역)
  '#f59e0b', // 앰버 (주의해역/시설)
  '#ef4444', // 로즈레드 (위험/통제구역)
  '#14b8a6', // 틸 (생태관찰)
  '#eab308', // 옐로우 (부표/표지)
  '#f97316', // 오렌지 (순찰구역)
];

function formatKoreanDateTime(iso: string): string {
  if (!iso) return '기본 내장 데이터';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getFeatureCenterLatLng(feature: SpatialFeature): [number, number] | null {
  const geom = feature?.geometry;
  if (!geom || !geom.coordinates) return null;
  if (geom.type === 'Point') {
    return [geom.coordinates[1], geom.coordinates[0]];
  }
  if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
    const pt = geom.coordinates[0];
    return pt ? [pt[1], pt[0]] : null;
  }
  if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
    const ring = geom.coordinates[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    let sumLng = 0;
    let sumLat = 0;
    for (const pt of ring) {
      sumLng += pt[0];
      sumLat += pt[1];
    }
    return [sumLat / ring.length, sumLng / ring.length];
  }
  if (geom.type === 'MultiPolygon') {
    const ring = geom.coordinates[0]?.[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    let sumLng = 0;
    let sumLat = 0;
    for (const pt of ring) {
      sumLng += pt[0];
      sumLat += pt[1];
    }
    return [sumLat / ring.length, sumLng / ring.length];
  }
  return null;
}

export function LayerControlModal({
  isOpen,
  onClose,
  layers,
  geoJsonLayersData,
  onSaveOperationalLayers,
  onFlyToPoint,
  releaseId,
  lastSavedAt,
  remoteSyncStatus,
  remoteCommitUrl,
  snapshots,
  showPorpoiseLayer,
  onTogglePorpoiseLayer,
  porpoiseCount,
}: LayerControlModalProps) {
  const [activeTab, setActiveTab] = useState<ModalWorkspaceTab>('list');

  // 편집 중인 작업 레이어 및 GeoJSON 맵 상태 ([저장] 클릭 시 즉시 운영 반영)
  const [draftLayers, setDraftLayers] = useState<MapLayerConfig[]>(() =>
    layers.map((l) => ({
      ...l,
      style: l.style ?? buildDefaultLayerStyle(l.color, l.id),
    })),
  );
  const [draftGeoJsonById, setDraftGeoJsonById] = useState<
    Record<string, SpatialFeatureCollection>
  >(() => ({ ...geoJsonLayersData }));
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);

  // 스타일/속성 편집 대상 레이어 ID
  const [expandedStyleLayerId, setExpandedStyleLayerId] = useState<string | null>(
    null,
  );
  const [selectedFeatureLayerId, setSelectedFeatureLayerId] = useState<string>(
    () => layers.find((l) => l.id !== 'docking' && !l.isSystemLayer)?.id ?? 'national_park',
  );
  const [featureSearchQuery, setFeatureSearchQuery] = useState<string>('');
  const [newColumnKey, setNewColumnKey] = useState<string>('');

  // 멀티 포맷 파일 가져오기 상태
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lastSelectedFiles, setLastSelectedFiles] = useState<File[]>([]);
  const [isParsingFiles, setIsParsingFiles] = useState<boolean>(false);
  const [crsOverride, setCrsOverride] = useState<SupportedCrsCode>('AUTO');
  const [encodingOverride, setEncodingOverride] =
    useState<SupportedTextEncoding>('AUTO');
  const [simplifyToleranceMeters, setSimplifyToleranceMeters] =
    useState<number>(0);
  const [parsedCandidates, setParsedCandidates] = useState<
    Array<{
      candidate: ParsedLayerCandidate;
      selected: boolean;
      targetMode: 'new' | string; // 'new' 또는 교체할 기존 layer.id
      customName: string;
      customDescription: string;
      customColor: string;
      customLabelField: string;
    }>
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // 저장/동기화 실행 상태
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveBanner, setSaveBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    commitUrl?: string;
  } | null>(null);

  // 원격 GitHub 저장소 자동 커밋 설정 상태
  const [gitHubConfig, setGitHubConfig] = useState<GitHubSyncConfig>(() =>
    loadGitHubSyncConfig(),
  );
  const [gitHubConfigSavedMsg, setGitHubConfigSavedMsg] = useState<string | null>(
    null,
  );

  const editableGeoLayers = useMemo(
    () => draftLayers.filter((l) => l.id !== 'docking' && !l.isSystemLayer),
    [draftLayers],
  );

  const activeFeatureLayer = useMemo(
    () =>
      editableGeoLayers.find((l) => l.id === selectedFeatureLayerId) ??
      editableGeoLayers[0] ??
      null,
    [editableGeoLayers, selectedFeatureLayerId],
  );

  const activeFeatureCollection = useMemo(() => {
    if (!activeFeatureLayer) return null;
    return draftGeoJsonById[activeFeatureLayer.id] ?? null;
  }, [activeFeatureLayer, draftGeoJsonById]);

  const activeLayerAttributeKeys = useMemo(() => {
    if (!activeFeatureCollection) return ['id', 'name'];
    const keys = new Set<string>(['id', 'name']);
    for (const f of activeFeatureCollection.features.slice(0, 50)) {
      for (const k of Object.keys(f.properties ?? {})) {
        keys.add(k);
      }
    }
    return Array.from(keys);
  }, [activeFeatureCollection]);

  const recordChangeNote = useCallback((note: string) => {
    setPendingNotes((prev) => (prev.includes(note) ? prev : [...prev, note]));
    setSaveBanner(null);
  }, []);

  // 1. 레이어 가시성·스타일·순서·삭제 핸들러
  const handleToggleDraftLayer = useCallback(
    (layerId: string) => {
      setDraftLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
      );
      recordChangeNote(`레이어 표시 전환 (${layerId})`);
    },
    [recordChangeNote],
  );

  const handleUpdateLayerMeta = useCallback(
    (layerId: string, patch: Partial<MapLayerConfig>) => {
      setDraftLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
      );
      recordChangeNote(`레이어 설정 수정 (${layerId})`);
    },
    [recordChangeNote],
  );

  const handleUpdateLayerStyle = useCallback(
    (
      layerId: string,
      stylePatch: Partial<NonNullable<MapLayerConfig['style']>>,
    ) => {
      setDraftLayers((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const baseStyle =
            l.style ?? buildDefaultLayerStyle(l.color, l.id, 'name');
          const nextStyle = { ...baseStyle, ...stylePatch };
          return {
            ...l,
            color: stylePatch.strokeColor ?? stylePatch.fillColor ?? l.color,
            style: nextStyle,
          };
        }),
      );
      recordChangeNote(`레이어 스타일 변경 (${layerId})`);
    },
    [recordChangeNote],
  );

  const handleMoveLayerOrder = useCallback(
    (index: number, direction: -1 | 1) => {
      setDraftLayers((prev) => {
        const targetIdx = index + direction;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const copy = [...prev];
        const [item] = copy.splice(index, 1);
        copy.splice(targetIdx, 0, item);
        return copy;
      });
      recordChangeNote('레이어 표시 순서 변경');
    },
    [recordChangeNote],
  );

  const handleDeleteLayer = useCallback(
    (layer: MapLayerConfig) => {
      if (layer.id === 'docking' || layer.isSystemLayer) return;
      setDraftLayers((prev) => prev.filter((l) => l.id !== layer.id));
      setDraftGeoJsonById((prev) => {
        const copy = { ...prev };
        delete copy[layer.id];
        return copy;
      });
      recordChangeNote(`레이어 삭제 (${layer.name})`);
    },
    [recordChangeNote],
  );

  const handleExportLayerGeoJson = useCallback(
    (layer: MapLayerConfig) => {
      const fc = draftGeoJsonById[layer.id];
      if (!fc) return;
      const blob = new Blob([JSON.stringify(fc, null, 2)], {
        type: 'application/geo+json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${layer.id}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [draftGeoJsonById],
  );

  const handleFlyToLayerBounds = useCallback(
    (layer: MapLayerConfig) => {
      if (!onFlyToPoint) return;
      const bbox = layer.bbox;
      if (bbox && bbox.length === 4) {
        const centerLng = (bbox[0] + bbox[2]) / 2;
        const centerLat = (bbox[1] + bbox[3]) / 2;
        onFlyToPoint(centerLat, centerLng, 12);
        return;
      }
      const fc = draftGeoJsonById[layer.id];
      if (fc && fc.features.length > 0) {
        const pt = getFeatureCenterLatLng(fc.features[0]);
        if (pt) {
          onFlyToPoint(pt[0], pt[1], 12);
        }
      }
    },
    [onFlyToPoint, draftGeoJsonById],
  );

  // 2. QGIS 멀티 포맷 파일 파싱 (.gpkg, .zip, .shp+.dbf+.prj+.cpg, .geojson, .kml/.kmz)
  const executeSpatialFileParse = useCallback(
    async (
      files: File[],
      crsOpt: SupportedCrsCode,
      encOpt: SupportedTextEncoding,
    ) => {
      if (files.length === 0) return;
      setIsParsingFiles(true);
      setParseErrors([]);
      try {
        const res = await parseSpatialFiles(files, {
          crsOverride: crsOpt,
          encodingOverride: encOpt,
        });
        setParseErrors(res.errors);
        setParsedCandidates(
          res.candidates.map((cand, idx) => ({
            candidate: cand,
            selected: true,
            targetMode: 'new',
            customName: cand.layerName,
            customDescription: cand.description,
            customColor:
              LAYER_COLOR_PRESETS[
                (draftLayers.length + idx) % LAYER_COLOR_PRESETS.length
              ],
            customLabelField: cand.recommendedLabelField || 'name',
          })),
        );
      } finally {
        setIsParsingFiles(false);
      }
    },
    [draftLayers.length],
  );

  const handleFileInputChange = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return;
      const arr = Array.from(fileList);
      setLastSelectedFiles(arr);
      void executeSpatialFileParse(arr, crsOverride, encodingOverride);
    },
    [crsOverride, encodingOverride, executeSpatialFileParse],
  );

  const handleChangeCrsOverride = useCallback(
    async (nextCrs: SupportedCrsCode) => {
      setCrsOverride(nextCrs);
      if (nextCrs === 'AUTO') {
        if (lastSelectedFiles.length > 0) {
          await executeSpatialFileParse(lastSelectedFiles, 'AUTO', encodingOverride);
        }
        return;
      }
      // 이미 파싱된 후보 레이어들을 선택한 좌표계로 즉시 재투영
      const updated = await Promise.all(
        parsedCandidates.map(async (item) => {
          const reprojected = await reprojectLayerCandidate(
            item.candidate,
            nextCrs,
          );
          return {
            ...item,
            candidate: reprojected,
          };
        }),
      );
      setParsedCandidates(updated);
    },
    [
      lastSelectedFiles,
      encodingOverride,
      executeSpatialFileParse,
      parsedCandidates,
    ],
  );

  const handleChangeEncodingOverride = useCallback(
    async (nextEnc: SupportedTextEncoding) => {
      setEncodingOverride(nextEnc);
      if (lastSelectedFiles.length > 0) {
        await executeSpatialFileParse(lastSelectedFiles, crsOverride, nextEnc);
      }
    },
    [lastSelectedFiles, crsOverride, executeSpatialFileParse],
  );

  // 선택된 가져오기 후보들을 draftLayers & draftGeoJsonById에 편입하는 헬퍼
  const mergeCheckedCandidatesIntoDraft = useCallback((): {
    mergedLayers: MapLayerConfig[];
    mergedGeoJson: Record<string, SpatialFeatureCollection>;
    addedDescriptions: string[];
  } => {
    const selectedItems = parsedCandidates.filter((i) => i.selected);
    if (selectedItems.length === 0) {
      return {
        mergedLayers: draftLayers,
        mergedGeoJson: draftGeoJsonById,
        addedDescriptions: [],
      };
    }

    let nextLayers = [...draftLayers];
    const nextGeoJson = { ...draftGeoJsonById };
    const addedDescriptions: string[] = [];

    for (const item of selectedItems) {
      const cand = item.candidate;
      const finalFc =
        simplifyToleranceMeters > 0
          ? simplifyFeatureCollection(
              cand.featureCollection,
              simplifyToleranceMeters,
            )
          : cand.featureCollection;

      if (item.targetMode !== 'new') {
        // 기존 레이어 교체
        const targetId = item.targetMode;
        nextLayers = nextLayers.map((l) => {
          if (l.id !== targetId) return l;
          return {
            ...l,
            name: item.customName.trim() || l.name,
            description: item.customDescription.trim() || l.description,
            color: item.customColor || l.color,
            visible: true,
            geometryTypes: cand.geometryTypes,
            featureCount: finalFc.features.length,
            bbox: cand.bbox,
            style: {
              ...(l.style ?? buildDefaultLayerStyle(item.customColor, l.id)),
              strokeColor: item.customColor,
              fillColor: item.customColor,
              labelField: item.customLabelField || 'name',
            },
            sourceMeta: {
              originalFileName: cand.sourceFileName,
              originalFormat: cand.sourceFormat,
              detectedCrs: `${cand.appliedCrs} → EPSG:4326`,
              detectedEncoding: cand.detectedEncoding,
              updatedAt: new Date().toISOString().slice(0, 10),
              dataSha256: cand.dataSha256,
            },
          };
        });
        nextGeoJson[targetId] = finalFc;
        addedDescriptions.push(`${item.customName} 레이어 교체`);
      } else {
        // 신규 레이어 생성
        const safeSlug = cand.layerName
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]+/g, '_')
          .slice(0, 24);
        const newLayerId = `layer_${safeSlug}_${Date.now().toString(36).slice(-4)}`;
        const newLayer: MapLayerConfig = {
          id: newLayerId,
          name: item.customName.trim() || cand.layerName,
          description: item.customDescription.trim() || cand.description,
          visible: true,
          color: item.customColor,
          url: `/data/layers/${newLayerId}.geojson`,
          geometryTypes: cand.geometryTypes,
          featureCount: finalFc.features.length,
          bbox: cand.bbox,
          style: buildDefaultLayerStyle(
            item.customColor,
            newLayerId,
            item.customLabelField || 'name',
          ),
          sourceMeta: {
            originalFileName: cand.sourceFileName,
            originalFormat: cand.sourceFormat,
            detectedCrs: `${cand.appliedCrs} → EPSG:4326`,
            detectedEncoding: cand.detectedEncoding,
            updatedAt: new Date().toISOString().slice(0, 10),
            dataSha256: cand.dataSha256,
          },
        };
        nextLayers.push(newLayer);
        nextGeoJson[newLayerId] = finalFc;
        setSelectedFeatureLayerId(newLayerId);
        addedDescriptions.push(`신규 레이어 등록 (${newLayer.name})`);
      }
    }

    return {
      mergedLayers: nextLayers,
      mergedGeoJson: nextGeoJson,
      addedDescriptions,
    };
  }, [
    parsedCandidates,
    draftLayers,
    draftGeoJsonById,
    simplifyToleranceMeters,
  ]);

  const handleStageImportedCandidates = useCallback(() => {
    const { mergedLayers, mergedGeoJson, addedDescriptions } =
      mergeCheckedCandidatesIntoDraft();
    if (addedDescriptions.length === 0) return;

    setDraftLayers(mergedLayers);
    setDraftGeoJsonById(mergedGeoJson);
    setParsedCandidates([]);
    setLastSelectedFiles([]);
    addedDescriptions.forEach((d) => recordChangeNote(d));
    setActiveTab('list');
  }, [mergeCheckedCandidatesIntoDraft, recordChangeNote]);

  // 3. 피처·속성 CRUD 핸들러
  const handleUpdateFeatureProperty = useCallback(
    (featureIndex: number, propKey: string, nextValue: string) => {
      if (!activeFeatureLayer) return;
      const layerId = activeFeatureLayer.id;
      const fc = draftGeoJsonById[layerId];
      if (!fc) return;

      const nextFeatures = fc.features.map((f, idx) => {
        if (idx !== featureIndex) return f;
        return {
          ...f,
          properties: {
            ...f.properties,
            [propKey]: nextValue,
          },
        };
      });

      setDraftGeoJsonById((prev) => ({
        ...prev,
        [layerId]: {
          ...fc,
          features: nextFeatures,
        },
      }));
      recordChangeNote(`${activeFeatureLayer.name} 피처 속성 수정`);
    },
    [activeFeatureLayer, draftGeoJsonById, recordChangeNote],
  );

  const handleAddAttributeColumn = useCallback(() => {
    const col = newColumnKey.trim();
    if (!col || !activeFeatureLayer) return;
    const layerId = activeFeatureLayer.id;
    const fc = draftGeoJsonById[layerId];
    if (!fc) return;

    const nextFeatures = fc.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        [col]: f.properties?.[col] ?? '',
      },
    }));

    setDraftGeoJsonById((prev) => ({
      ...prev,
      [layerId]: {
        ...fc,
        features: nextFeatures,
      },
    }));
    setNewColumnKey('');
    recordChangeNote(`${activeFeatureLayer.name} 속성 컬럼 추가 (${col})`);
  }, [newColumnKey, activeFeatureLayer, draftGeoJsonById, recordChangeNote]);

  const handleAddPointFeatureToLayer = useCallback(() => {
    if (!activeFeatureLayer) return;
    const layerId = activeFeatureLayer.id;
    const fc = draftGeoJsonById[layerId] ?? {
      type: 'FeatureCollection',
      name: activeFeatureLayer.name,
      features: [],
    };
    const nextIdx = fc.features.length + 1;
    const newFeat: SpatialFeature = {
      type: 'Feature',
      id: `${layerId.toUpperCase()}-${nextIdx}`,
      properties: {
        id: `${layerId.toUpperCase()}-${nextIdx}`,
        name: `${activeFeatureLayer.name} 신규 지점 #${nextIdx}`,
        description: '직원 현장 추가 지점',
      },
      geometry: {
        type: 'Point',
        coordinates: [128.5085, 34.8125],
      },
    };

    const nextFc: SpatialFeatureCollection = {
      ...fc,
      features: [...fc.features, newFeat],
    };
    const norm = reprojectAndNormalizeFeatureCollection(nextFc, 'EPSG:4326');

    setDraftGeoJsonById((prev) => ({
      ...prev,
      [layerId]: norm.featureCollection,
    }));
    setDraftLayers((prev) =>
      prev.map((l) =>
        l.id === layerId
          ? {
              ...l,
              featureCount: norm.featureCollection.features.length,
              geometryTypes: norm.geometryTypes,
              bbox: norm.bbox,
            }
          : l,
      ),
    );
    recordChangeNote(`${activeFeatureLayer.name} 신규 피처 추가`);
  }, [activeFeatureLayer, draftGeoJsonById, recordChangeNote]);

  const handleDeleteFeatureFromLayer = useCallback(
    (featureIndex: number) => {
      if (!activeFeatureLayer) return;
      const layerId = activeFeatureLayer.id;
      const fc = draftGeoJsonById[layerId];
      if (!fc) return;

      const nextFeatures = fc.features.filter((_, idx) => idx !== featureIndex);
      const nextFc: SpatialFeatureCollection = {
        ...fc,
        features: nextFeatures,
      };
      const norm = reprojectAndNormalizeFeatureCollection(nextFc, 'EPSG:4326');

      setDraftGeoJsonById((prev) => ({
        ...prev,
        [layerId]: norm.featureCollection,
      }));
      setDraftLayers((prev) =>
        prev.map((l) =>
          l.id === layerId
            ? {
                ...l,
                featureCount: norm.featureCollection.features.length,
                geometryTypes: norm.geometryTypes,
                bbox: norm.bbox,
              }
            : l,
        ),
      );
      recordChangeNote(`${activeFeatureLayer.name} 피처 삭제`);
    },
    [activeFeatureLayer, draftGeoJsonById, recordChangeNote],
  );

  // 4. 스냅샷 롤백 선택 핸들러
  const handleRestoreSnapshotToDraft = useCallback(
    (snap: LayerReleaseSnapshot) => {
      setDraftLayers(
        snap.layers.map((l) => ({
          ...l,
          style: l.style ?? buildDefaultLayerStyle(l.color, l.id),
        })),
      );
      setDraftGeoJsonById({ ...snap.geoJsonById });
      recordChangeNote(`이전 버전(${snap.releaseId}) 복원 선택`);
      setActiveTab('list');
    },
    [recordChangeNote],
  );

  // 5. [핵심] [저장 (운영 반영)] 버튼 클릭 핸들러
  const handleSaveToProduction = useCallback(async () => {
    setIsSaving(true);
    setSaveBanner(null);

    try {
      // 만약 파일 등록 탭에서 아직 목록에 편입하지 않은 선택된 후보가 있다면 함께 즉시 편입하여 운영 반영!
      const { mergedLayers, mergedGeoJson, addedDescriptions } =
        mergeCheckedCandidatesIntoDraft();

      const allNotes = [...pendingNotes, ...addedDescriptions];
      const summaryText =
        allNotes.length > 0
          ? allNotes.join(', ')
          : `공간정보 레이어 ${mergedLayers.length}건 운영 상태 확정`;

      const result = await onSaveOperationalLayers({
        nextLayers: mergedLayers,
        nextGeoJsonById: mergedGeoJson,
        summary: summaryText,
      });

      setDraftLayers(mergedLayers);
      setDraftGeoJsonById(mergedGeoJson);
      setParsedCandidates([]);
      setLastSelectedFiles([]);
      setPendingNotes([]);

      if (addedDescriptions.length > 0) {
        setActiveTab('list');
      }

      setSaveBanner({
        type: result.syncResult.status === 'failed' ? 'warning' : 'success',
        message: `[${result.releaseId}] 즉시 운영 반영 완료! ${result.syncResult.message}`,
        commitUrl: result.syncResult.commitUrl,
      });
    } catch (err: unknown) {
      setSaveBanner({
        type: 'error',
        message: `저장 중 오류가 발생했습니다: ${
          err instanceof Error ? err.message : '알 수 없는 오류'
        }`,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    mergeCheckedCandidatesIntoDraft,
    pendingNotes,
    onSaveOperationalLayers,
  ]);

  const handleResetDraftChanges = useCallback(() => {
    setDraftLayers(
      layers.map((l) => ({
        ...l,
        style: l.style ?? buildDefaultLayerStyle(l.color, l.id),
      })),
    );
    setDraftGeoJsonById({ ...geoJsonLayersData });
    setParsedCandidates([]);
    setLastSelectedFiles([]);
    setPendingNotes([]);
    setSaveBanner(null);
  }, [layers, geoJsonLayersData]);

  const handleSaveGitHubConfig = useCallback(() => {
    saveGitHubSyncConfig(gitHubConfig);
    setGitHubConfigSavedMsg('원격 GitHub 자동 배포 설정이 기기에 저장되었습니다.');
    window.setTimeout(() => setGitHubConfigSavedMsg(null), 2500);
  }, [gitHubConfig]);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const totalPendingChanges =
    pendingNotes.length + parsedCandidates.filter((c) => c.selected).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="layer-modal-title"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/80 p-2.5 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-slate-600 bg-[#0b192c] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 상단 헤더 & 현재 운영 릴리스 상태 배지 */}
        <div className="flex items-center justify-between border-b border-slate-700/90 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2
                  id="layer-modal-title"
                  className="text-base font-black tracking-tight text-white sm:text-lg"
                >
                  공간정보 레이어 관리
                </h2>
                <span className="rounded-md border border-emerald-400/50 bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-black text-emerald-300">
                  {releaseId}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                    remoteSyncStatus === 'synced'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {remoteSyncStatus === 'synced'
                    ? 'GitHub 운영 동기화됨'
                    : '앱·기기 즉시 운영 반영됨'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                QGIS 멀티포맷(.gpkg · .zip/shp · .geojson · .kml) · 한국좌표계 자동변환 ·{' '}
                <strong className="text-emerald-300">[저장] 클릭 시 즉시 운영 반영</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="레이어 창 닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. 4개 실무 워크스페이스 탭 네비게이션 */}
        <div className="grid grid-cols-4 gap-1 border-b border-slate-700/80 bg-slate-900/90 px-3 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
              activeTab === 'list'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>레이어 ({draftLayers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
              activeTab === 'import'
                ? 'bg-sky-400 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FileUp className="h-3.5 w-3.5" />
            <span>+ 파일 등록</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
              activeTab === 'features'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>속성·피처 편집</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
              activeTab === 'history'
                ? 'bg-purple-400 text-slate-950 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>이력·원격연동</span>
          </button>
        </div>

        {/* 3. 스크롤 가능한 본문 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">
          {/* ================================================================
              TAB 1: 레이어 목록 · 표시/숨김 · 스타일/라벨 편집
             ================================================================ */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {/* 상단 빠른 파일 등록 & 실무 샘플 원클릭 테스트 바 */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-500/40 bg-sky-950/30 p-3">
                <div className="text-xs text-sky-100">
                  <p className="font-black text-sky-300">
                    QGIS 실무 공간파일 원스톱 등록 (.gpkg · .zip/shp · .geojson · .kml)
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    한국 좌표계(EPSG:5179/5186) 자동 재투영 및 한글(CP949) 자동 복원 지원
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('import')}
                    className="inline-flex items-center gap-1 rounded-xl bg-sky-400 px-3 py-1.5 text-xs font-black text-slate-950 shadow active:scale-95"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    <span>QGIS 파일 올리기</span>
                  </button>
                </div>
              </div>

              {/* 등록된 공간 레이어 목록 */}
              {draftLayers.map((layer, index) => {
                const isSystem = layer.id === 'docking' || layer.isSystemLayer;
                const fc = draftGeoJsonById[layer.id];
                const featureCount =
                  fc?.features?.length ?? layer.featureCount ?? 0;
                const geomTypesLabel =
                  layer.geometryTypes && layer.geometryTypes.length > 0
                    ? layer.geometryTypes.join('/')
                    : isSystem
                      ? 'Point'
                      : 'Polygon';
                const isStyleOpen = expandedStyleLayerId === layer.id;
                const layerStyle =
                  layer.style ?? buildDefaultLayerStyle(layer.color, layer.id);

                return (
                  <div
                    key={layer.id}
                    className="rounded-2xl border border-slate-700/90 bg-slate-900/85 p-3.5 transition hover:border-slate-500"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex flex-1 cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={layer.visible}
                          onChange={() => handleToggleDraftLayer(layer.id)}
                          aria-label={`${layer.name} 표시 전환`}
                          className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-800 text-emerald-500 accent-emerald-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/70"
                              style={{ backgroundColor: layer.color }}
                            />
                            <span className="text-sm font-black text-white">
                              {layer.name}
                            </span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                              {geomTypesLabel} · {featureCount}건
                            </span>
                            {layer.sourceMeta?.detectedCrs && (
                              <span className="rounded bg-emerald-950/90 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                {layer.sourceMeta.detectedCrs}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {layer.description}
                          </p>
                        </div>
                      </label>

                      {/* 순서 이동 버튼 */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveLayerOrder(index, -1)}
                          disabled={index === 0}
                          title="레이어 순서 위로"
                          className="rounded-lg border border-slate-700 bg-slate-800 p-1 text-slate-300 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLayerOrder(index, 1)}
                          disabled={index === draftLayers.length - 1}
                          title="레이어 순서 아래로"
                          className="rounded-lg border border-slate-700 bg-slate-800 p-1 text-slate-300 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 레이어별 실무 액션 바 (시스템 고정 접안 마커 외 모든 공간 레이어) */}
                    {!isSystem && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleFlyToLayerBounds(layer)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1 text-[11px] font-bold text-sky-300 hover:border-sky-400"
                        >
                          <Eye className="h-3 w-3" />
                          <span>지도 위치보기</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStyleLayerId(
                              isStyleOpen ? null : layer.id,
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${
                            isStyleOpen
                              ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                              : 'border-slate-700 bg-slate-800/90 text-slate-200 hover:border-slate-500'
                          }`}
                        >
                          <Palette className="h-3 w-3" />
                          <span>스타일·라벨 설정</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFeatureLayerId(layer.id);
                            setActiveTab('features');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:border-emerald-400"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>속성·피처 편집 ({featureCount})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportLayerGeoJson(layer)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-slate-500"
                        >
                          <Download className="h-3 w-3" />
                          <span>GeoJSON 내보내기</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteLayer(layer)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-900/50"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>삭제</span>
                        </button>
                      </div>
                    )}

                    {/* 인라인 스타일·라벨 편집 패널 */}
                    {!isSystem && isStyleOpen && (
                      <div className="mt-3 space-y-2.5 rounded-xl border border-slate-700 bg-slate-950/90 p-3 text-xs">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              레이어 이름
                            </label>
                            <input
                              type="text"
                              value={layer.name}
                              onChange={(e) =>
                                handleUpdateLayerMeta(layer.id, {
                                  name: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              레이어 설명
                            </label>
                            <input
                              type="text"
                              value={layer.description}
                              onChange={(e) =>
                                handleUpdateLayerMeta(layer.id, {
                                  description: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
                            />
                          </div>
                        </div>

                        <div>
                          <span className="block text-[11px] font-bold text-slate-400">
                            대표 색상 (선·면 공통)
                          </span>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {LAYER_COLOR_PRESETS.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() =>
                                  handleUpdateLayerStyle(layer.id, {
                                    strokeColor: hex,
                                    fillColor: hex,
                                  })
                                }
                                className={`h-6 w-6 rounded-full border-2 ${
                                  layer.color === hex
                                    ? 'scale-110 border-white'
                                    : 'border-transparent opacity-80'
                                }`}
                                style={{ backgroundColor: hex }}
                                aria-label={`색상 ${hex}`}
                              />
                            ))}
                            <input
                              type="color"
                              value={layer.color}
                              onChange={(e) =>
                                handleUpdateLayerStyle(layer.id, {
                                  strokeColor: e.target.value,
                                  fillColor: e.target.value,
                                })
                              }
                              className="h-6 w-8 cursor-pointer rounded border border-slate-600 bg-slate-900"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              선 종류
                            </label>
                            <select
                              value={layerStyle.strokeDash}
                              onChange={(e) =>
                                handleUpdateLayerStyle(layer.id, {
                                  strokeDash: e.target
                                    .value as StrokeDashPattern,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                            >
                              <option value="solid">실선 (Solid)</option>
                              <option value="shortdash">파선 (Dash)</option>
                              <option value="shortdot">점선 (Dot)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              선 굵기 ({layerStyle.strokeWidth}px)
                            </label>
                            <input
                              type="range"
                              min={1}
                              max={6}
                              step={0.5}
                              value={layerStyle.strokeWidth}
                              onChange={(e) =>
                                handleUpdateLayerStyle(layer.id, {
                                  strokeWidth: Number(e.target.value),
                                })
                              }
                              className="mt-2 w-full accent-sky-400"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              면 투명도 ({Math.round(layerStyle.fillOpacity * 100)}%)
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={0.6}
                              step={0.04}
                              value={layerStyle.fillOpacity}
                              onChange={(e) =>
                                handleUpdateLayerStyle(layer.id, {
                                  fillOpacity: Number(e.target.value),
                                })
                              }
                              className="mt-2 w-full accent-emerald-400"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-200">
                            <input
                              type="checkbox"
                              checked={layerStyle.showLabels !== false}
                              onChange={(e) =>
                                handleUpdateLayerStyle(layer.id, {
                                  showLabels: e.target.checked,
                                })
                              }
                              className="h-4 w-4 rounded accent-sky-400"
                            />
                            <span>지도 위 피처 이름(라벨) 표시</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">
                              라벨 속성명:
                            </span>
                            <input
                              type="text"
                              value={layerStyle.labelField ?? 'name'}
                              onChange={(e) =>
                                handleUpdateLayerStyle(layer.id, {
                                  labelField: e.target.value,
                                })
                              }
                              className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-sky-300"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 개인 상괭이 관찰 표식 레이어 */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-teal-500/40 bg-teal-950/30 p-3.5 transition hover:border-teal-400">
                <input
                  type="checkbox"
                  checked={showPorpoiseLayer}
                  onChange={onTogglePorpoiseLayer}
                  className="mt-1 h-5 w-5 rounded border-teal-600 bg-slate-800 text-teal-400 accent-teal-400"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-teal-400" />
                    <span className="text-sm font-extrabold text-teal-200">
                      개인 상괭이 관찰 표식
                    </span>
                    <span className="rounded bg-teal-900/80 px-1.5 py-0.5 text-[10px] font-black text-teal-300">
                      {porpoiseCount}건
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    기기에 저장된 상괭이 목격 위치 핀 표시
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* ================================================================
              TAB 2: + 파일 등록 (QGIS .gpkg / .zip Shapefile / .geojson / .kml)
             ================================================================ */}
          {activeTab === 'import' && (
            <div className="space-y-3.5">
              {/* 드래그앤드롭 및 파일 선택 영역 */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFileInputChange(e.dataTransfer.files);
                }}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-400/70 bg-slate-900/90 p-5 text-center transition hover:border-sky-300"
              >
                <FileUp className="h-8 w-8 text-sky-400" />
                <p className="mt-2 text-sm font-black text-white">
                  QGIS 공간정보 파일을 이곳에 끌어다 놓거나 선택하세요
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  지원 포맷: <strong className="text-amber-300">.gpkg</strong> (GeoPackage) ·{' '}
                  <strong className="text-amber-300">.zip / .shp+.dbf+.prj</strong> (Shapefile) ·{' '}
                  <strong className="text-amber-300">.geojson / .json</strong> ·{' '}
                  <strong className="text-amber-300">.kml / .kmz</strong>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".gpkg,.zip,.shp,.dbf,.shx,.prj,.cpg,.geojson,.json,.kml,.kmz"
                  onChange={(e) => handleFileInputChange(e.target.files)}
                  className="hidden"
                />
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2 text-xs font-black text-slate-950 shadow active:scale-95"
                  >
                    <FileUp className="h-4 w-4" />
                    <span>내 기기에서 QGIS 파일 선택</span>
                  </button>
                </div>

                {/* 직원 실무 포맷(GPKG / Shapefile EPSG:5179) 즉시 체험 버튼 */}
                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5 border-t border-slate-800 pt-3">
                  <span className="text-[11px] font-bold text-slate-400">
                    실무 포맷 자동변환 즉시 검증:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleGpkg = createSampleGeoPackageFile();
                      handleFileInputChange([sampleGpkg]);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/60"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>샘플 .gpkg 로드 (EPSG:5179 구역)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleShpZip = createSampleShapefileZip();
                      handleFileInputChange([sampleShpZip]);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/60 bg-amber-950/60 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-900/60"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>샘플 .zip Shapefile 로드 (EPSG:5179 항로)</span>
                  </button>
                </div>
              </div>

              {/* 좌표계(CRS) · 한글 인코딩 · 경량화 옵션 바 */}
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 p-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300">
                    원본 좌표계 (CRS 자동 감지/지정)
                  </label>
                  <select
                    value={crsOverride}
                    onChange={(e) =>
                      void handleChangeCrsOverride(
                        e.target.value as SupportedCrsCode,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs font-bold text-sky-300"
                  >
                    <option value="AUTO">자동 감지 (권장 · .prj/GPKG/범위)</option>
                    {Object.entries(KOREAN_CRS_DEFINITIONS).map(([code, meta]) => (
                      <option key={code} value={code}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300">
                    한글 속성 인코딩 (.dbf / 텍스트)
                  </label>
                  <select
                    value={encodingOverride}
                    onChange={(e) =>
                      void handleChangeEncodingOverride(
                        e.target.value as SupportedTextEncoding,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs font-bold text-emerald-300"
                  >
                    <option value="AUTO">자동 감지 (UTF-8 / CP949·EUC-KR)</option>
                    <option value="EUC-KR">EUC-KR / CP949 (관공서 Shapefile)</option>
                    <option value="UTF-8">UTF-8 (표준 유니코드)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300">
                    도형 정밀도 · 모바일 경량화
                  </label>
                  <select
                    value={simplifyToleranceMeters}
                    onChange={(e) =>
                      setSimplifyToleranceMeters(Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs font-bold text-amber-300"
                  >
                    <option value={0}>원본 정밀도 유지 (단순화 안 함)</option>
                    <option value={1}>모바일 최적화 단순화 (허용오차 1m)</option>
                    <option value={5}>대용량 해안선 고속 경량화 (5m)</option>
                  </select>
                </div>
              </div>

              {isParsingFiles && (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-sky-500/40 bg-sky-950/30 p-4 text-xs font-bold text-sky-200">
                  <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
                  <span>공간 데이터 파싱 및 WGS 84 좌표 재투영 중...</span>
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="rounded-2xl border border-rose-500/70 bg-rose-950/60 p-3 text-xs text-rose-200">
                  <p className="font-black text-rose-300">파일 확인 필요</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {parseErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 파싱된 후보 레이어 카드 목록 */}
              {parsedCandidates.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-300">
                      인식된 공간 레이어 ({parsedCandidates.length}건) — 하단 [저장 (운영 반영)] 클릭 시 즉시 반영됩니다
                    </span>
                    <button
                      type="button"
                      onClick={handleStageImportedCandidates}
                      className="inline-flex items-center gap-1 rounded-xl bg-sky-500/20 px-2.5 py-1 text-xs font-black text-sky-300 hover:bg-sky-500/30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>레이어 목록 탭으로 먼저 담기</span>
                    </button>
                  </div>

                  {parsedCandidates.map((item, idx) => {
                    const { candidate } = item;
                    return (
                      <div
                        key={candidate.candidateId}
                        className="rounded-2xl border-2 border-emerald-500/60 bg-slate-900/95 p-3.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-center gap-2 font-black text-white">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) =>
                                setParsedCandidates((prev) =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? { ...c, selected: e.target.checked }
                                      : c,
                                  ),
                                )
                              }
                              className="h-4 w-4 rounded accent-emerald-400"
                            />
                            <span className="text-sm text-emerald-300">
                              {candidate.sourceFileName}
                            </span>
                          </label>
                          <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-black text-emerald-300 uppercase">
                            {candidate.sourceFormat} · {candidate.appliedCrs} ➔ EPSG:4326
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-sky-300">
                            도형: {candidate.geometryTypes.join(', ')}
                          </span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-amber-300">
                            피처: {candidate.featureCount}개 (꼭짓점 {candidate.vertexCount.toLocaleString()}개)
                          </span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                            인코딩: {candidate.detectedEncoding}
                          </span>
                        </div>

                        {candidate.autoHealedNotes.length > 0 && (
                          <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-2 text-[11px] text-emerald-200">
                            {candidate.autoHealedNotes.map((note, nIdx) => (
                              <p key={nIdx}>✓ {note}</p>
                            ))}
                          </div>
                        )}

                        {candidate.warnings.length > 0 && (
                          <div className="mt-2 rounded-xl border border-amber-500/50 bg-amber-950/40 p-2 text-[11px] text-amber-200">
                            {candidate.warnings.map((w, wIdx) => (
                              <p key={wIdx}>⚠ {w}</p>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              반영 방식 (신규 추가 / 기존 교체)
                            </label>
                            <select
                              value={item.targetMode}
                              onChange={(e) =>
                                setParsedCandidates((prev) =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? { ...c, targetMode: e.target.value }
                                      : c,
                                  ),
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-bold text-white"
                            >
                              <option value="new">+ 신규 레이어로 추가</option>
                              {editableGeoLayers.map((existing) => (
                                <option key={existing.id} value={existing.id}>
                                  ↻ [{existing.name}] 데이터 교체
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              표시할 레이어명
                            </label>
                            <input
                              type="text"
                              value={item.customName}
                              onChange={(e) =>
                                setParsedCandidates((prev) =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? { ...c, customName: e.target.value }
                                      : c,
                                  ),
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-400">
                              색상 및 라벨 컬럼
                            </label>
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                type="color"
                                value={item.customColor}
                                onChange={(e) =>
                                  setParsedCandidates((prev) =>
                                    prev.map((c, i) =>
                                      i === idx
                                        ? { ...c, customColor: e.target.value }
                                        : c,
                                    ),
                                  )
                                }
                                className="h-7 w-9 cursor-pointer rounded border border-slate-600 bg-slate-950"
                              />
                              <select
                                value={item.customLabelField}
                                onChange={(e) =>
                                  setParsedCandidates((prev) =>
                                    prev.map((c, i) =>
                                      i === idx
                                        ? {
                                            ...c,
                                            customLabelField: e.target.value,
                                          }
                                        : c,
                                    ),
                                  )
                                }
                                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-sky-300"
                              >
                                {candidate.attributeKeys.map((k) => (
                                  <option key={k} value={k}>
                                    라벨: {k}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 3: 속성·피처 편집 (CRUD)
             ================================================================ */}
          {activeTab === 'features' && (
            <div className="space-y-3">
              {/* 편집 대상 레이어 선택 및 검색 바 */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-slate-300">
                    대상 레이어:
                  </span>
                  <select
                    value={activeFeatureLayer?.id ?? ''}
                    onChange={(e) => setSelectedFeatureLayerId(e.target.value)}
                    className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs font-black text-amber-300"
                  >
                    {editableGeoLayers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({draftGeoJsonById[l.id]?.features.length ?? 0}건)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAddPointFeatureToLayer}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-2.5 py-1.5 text-xs font-black text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+ 피처(지점) 추가</span>
                  </button>
                </div>
              </div>

              {/* 검색 및 새 컬럼 추가 */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={featureSearchQuery}
                    onChange={(e) => setFeatureSearchQuery(e.target.value)}
                    placeholder="피처 ID, 이름, 속성값 검색..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pr-3 pl-8 text-xs text-white"
                  />
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newColumnKey}
                    onChange={(e) => setNewColumnKey(e.target.value)}
                    placeholder="새 속성 필드명 (예: 관리담당자)"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddAttributeColumn}
                    className="shrink-0 rounded-xl border border-sky-500/50 bg-sky-500/20 px-3 py-2 text-xs font-black text-sky-300"
                  >
                    + 컬럼 추가
                  </button>
                </div>
              </div>

              {/* 피처 카드 리스트 */}
              {activeFeatureCollection ? (
                <div className="space-y-2">
                  {activeFeatureCollection.features.map((feat, fIdx) => {
                    const q = featureSearchQuery.trim().toLowerCase();
                    if (
                      q &&
                      !JSON.stringify(feat.properties ?? {})
                        .toLowerCase()
                        .includes(q)
                    ) {
                      return null;
                    }
                    const centerPt = getFeatureCenterLatLng(feat);

                    return (
                      <div
                        key={String(feat.id ?? fIdx)}
                        className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-black text-sky-300">
                              #{fIdx + 1} · {feat.geometry.type}
                            </span>
                            <span className="font-black text-white">
                              {String(
                                feat.properties?.name ??
                                  feat.properties?.id ??
                                  `Feature ${fIdx + 1}`,
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {centerPt && onFlyToPoint && (
                              <button
                                type="button"
                                onClick={() =>
                                  onFlyToPoint(centerPt[0], centerPt[1], 13)
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-500/20 px-2 py-0.5 text-[11px] font-bold text-sky-300"
                              >
                                <MapPin className="h-3 w-3" />
                                <span>위치 이동</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteFeatureFromLayer(fIdx)}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>피처 삭제</span>
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {activeLayerAttributeKeys.map((key) => (
                            <div key={key}>
                              <label className="block font-mono text-[10px] font-bold text-slate-400">
                                {key}
                              </label>
                              <input
                                type="text"
                                value={String(feat.properties?.[key] ?? '')}
                                onChange={(e) =>
                                  handleUpdateFeatureProperty(
                                    fIdx,
                                    key,
                                    e.target.value,
                                  )
                                }
                                className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">
                  편집할 공간 레이어를 선택해 주세요.
                </p>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 4: 버전 이력(롤백) · GitHub 원격 저장소 자동 배포 설정
             ================================================================ */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* 1. 저장된 운영 버전 스냅샷 이력 및 원클릭 복원 */}
              <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-400" />
                    <h3 className="text-xs font-black text-white">
                      운영 반영(저장) 버전 스냅샷 이력 ({snapshots.length}건)
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    이전 버전 선택 후 [저장]을 누르면 즉시 복원됩니다
                  </span>
                </div>

                {snapshots.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-400">
                    아직 기기에 기록된 신규 스냅샷이 없습니다. 하단 [저장 (운영 반영)]을 누르면 스냅샷이 자동 생성됩니다.
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.releaseId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-purple-300">
                              {snap.releaseId}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatKoreanDateTime(snap.createdAt)}
                            </span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                              레이어 {snap.layers.length}개
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-300">
                            {snap.summary}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {snap.remoteCommitUrl && (
                            <a
                              href={snap.remoteCommitUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-sky-500/40 bg-sky-950/40 px-2 py-1 text-[11px] font-bold text-sky-300"
                            >
                              GitHub 커밋 보기
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRestoreSnapshotToDraft(snap)}
                            className="inline-flex items-center gap-1 rounded-lg bg-purple-500/25 px-2.5 py-1 text-[11px] font-black text-purple-200 hover:bg-purple-500/40"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>이 버전으로 복원 선택</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. 원격 GitHub 저장소 자동 커밋 연동 설정 */}
              <div className="rounded-2xl border border-sky-500/40 bg-slate-900/90 p-3.5 text-xs">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-sky-400" />
                  <h3 className="font-black text-sky-300">
                    원격 GitHub 저장소(GitHub Pages) 자동 운영 배포 연동
                  </h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  관리 화면에서 <strong>[저장 (운영 반영)]</strong> 클릭 시 기기 내 영속 저장소(`IndexedDB`)에는 토큰 없이도 100% 즉시 반영됩니다. 모든 직원 단말기에 배포되도록 원격 GitHub 저장소(`main`)까지 동시에 자동 커밋하려면 저장소 쓰기 토큰(`contents: write` 권한 Fine-grained PAT)을 입력하세요. (토큰은 외부로 노출되지 않고 현재 기기 내부에만 격리 보관됩니다.)
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400">
                      GitHub Owner
                    </label>
                    <input
                      type="text"
                      value={gitHubConfig.owner}
                      onChange={(e) =>
                        setGitHubConfig((prev) => ({
                          ...prev,
                          owner: e.target.value,
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400">
                      Repository
                    </label>
                    <input
                      type="text"
                      value={gitHubConfig.repo}
                      onChange={(e) =>
                        setGitHubConfig((prev) => ({
                          ...prev,
                          repo: e.target.value,
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400">
                      운영 브랜치
                    </label>
                    <input
                      type="text"
                      value={gitHubConfig.branch}
                      onChange={(e) =>
                        setGitHubConfig((prev) => ({
                          ...prev,
                          branch: e.target.value,
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white"
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="block text-[10px] font-bold text-slate-400">
                    GitHub Fine-grained Personal Access Token (`contents: write`)
                  </label>
                  <input
                    type="password"
                    value={gitHubConfig.token}
                    onChange={(e) =>
                      setGitHubConfig((prev) => ({
                        ...prev,
                        token: e.target.value,
                      }))
                    }
                    placeholder="github_pat_... (미입력 시 기기 내 즉시 운영 반영 모드로 동작)"
                    className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-emerald-300"
                  />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-bold text-slate-200">
                    <input
                      type="checkbox"
                      checked={gitHubConfig.autoCommitOnSave}
                      onChange={(e) =>
                        setGitHubConfig((prev) => ({
                          ...prev,
                          autoCommitOnSave: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded accent-sky-400"
                    />
                    <span>[저장] 버튼 클릭 시 원격 GitHub 저장소 자동 커밋 수행</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleSaveGitHubConfig}
                    className="inline-flex items-center gap-1 rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-black text-slate-950 active:scale-95"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>연동 설정 기기 저장</span>
                  </button>
                </div>

                {gitHubConfigSavedMsg && (
                  <p className="mt-2 text-[11px] font-bold text-emerald-300">
                    ✓ {gitHubConfigSavedMsg}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 4. 하단 고정 [저장 = 즉시 운영 반영] 액션 바 */}
        <div className="border-t border-slate-700/90 bg-slate-950/95 px-4 py-3 sm:px-5">
          {saveBanner && (
            <div
              role="status"
              className={`mb-2.5 flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                saveBanner.type === 'success'
                  ? 'border-emerald-400/70 bg-emerald-950/80 text-emerald-200'
                  : saveBanner.type === 'warning'
                    ? 'border-amber-400/70 bg-amber-950/80 text-amber-200'
                    : 'border-rose-400/70 bg-rose-950/80 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {saveBanner.type === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                )}
                <div>
                  <p>{saveBanner.message}</p>
                  {saveBanner.commitUrl && (
                    <a
                      href={saveBanner.commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block underline text-sky-300"
                    >
                      원격 GitHub 배포 커밋 확인하기 ↗
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaveBanner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              {totalPendingChanges > 0 ? (
                <span className="font-black text-amber-300">
                  ● 미저장 변경사항 {totalPendingChanges}건 대기중 — [저장] 클릭 시 즉시 운영에 반영됩니다
                </span>
              ) : (
                <span className="font-bold text-slate-400">
                  최근 운영 반영: {formatKoreanDateTime(lastSavedAt)}
                  {remoteCommitUrl && (
                    <>
                      {' · '}
                      <a
                        href={remoteCommitUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 underline"
                      >
                        원격 커밋
                      </a>
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {totalPendingChanges > 0 && (
                <button
                  type="button"
                  onClick={handleResetDraftChanges}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-xs font-bold text-slate-200 active:scale-95"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>변경 취소</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveToProduction()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg transition hover:bg-emerald-400 active:scale-95 disabled:opacity-50 sm:text-sm"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>운영 반영 중...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 stroke-[2.5]" />
                    <span>저장 (운영 반영)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
