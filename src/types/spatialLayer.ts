import type {
  LayerRenderStyle,
  MapLayerConfig,
  SpatialGeometryType,
} from './config';

export type SupportedCrsCode =
  | 'AUTO'
  | 'EPSG:4326'
  | 'EPSG:5179'
  | 'EPSG:5186'
  | 'EPSG:5187'
  | 'EPSG:5185'
  | 'EPSG:5181'
  | 'EPSG:5180'
  | 'EPSG:5183'
  | 'EPSG:5174'
  | 'EPSG:3857';

export type SupportedTextEncoding = 'AUTO' | 'UTF-8' | 'EUC-KR';

export interface SpatialGeometry {
  type: SpatialGeometryType;
  coordinates: any;
}

export interface SpatialFeature {
  type: 'Feature';
  id?: string | number;
  properties: Record<string, any>;
  geometry: SpatialGeometry;
}

export interface SpatialFeatureCollection {
  type: 'FeatureCollection';
  name?: string;
  features: SpatialFeature[];
}

export interface ParsedLayerCandidate {
  candidateId: string;
  layerName: string;
  description: string;
  sourceFileName: string;
  sourceFormat: 'gpkg' | 'shapefile' | 'geojson' | 'kml';
  detectedCrs: string;
  appliedCrs: string;
  axisSwapped: boolean;
  detectedEncoding: 'UTF-8' | 'EUC-KR';
  geometryTypes: SpatialGeometryType[];
  featureCount: number;
  vertexCount: number;
  bbox: [number, number, number, number];
  attributeKeys: string[];
  recommendedLabelField?: string;
  autoHealedNotes: string[];
  warnings: string[];
  dataSha256: string;
  featureCollection: SpatialFeatureCollection;
  /** 원본 좌표계(재투영 전) 피처 데이터 — 사용자가 화면에서 CRS를 수동 변경할 때 즉시 재투영하기 위해 보관 */
  rawFeatureCollection?: SpatialFeatureCollection;
}

export interface MultiFormatParseResult {
  candidates: ParsedLayerCandidate[];
  errors: string[];
}

export interface LayerReleaseSnapshot {
  releaseId: string;
  createdAt: string;
  summary: string;
  layers: MapLayerConfig[];
  geoJsonById: Record<string, SpatialFeatureCollection>;
  remoteSyncStatus?: 'synced' | 'local_only' | 'pending' | 'failed';
  remoteCommitSha?: string;
  remoteCommitUrl?: string;
}

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  autoCommitOnSave: boolean;
}

export interface GitHubSyncResult {
  success: boolean;
  status: 'synced' | 'local_only' | 'failed';
  commitSha?: string;
  commitUrl?: string;
  message: string;
}

export function buildDefaultLayerStyle(
  color: string,
  layerId?: string,
  labelField?: string,
): LayerRenderStyle {
  const isProtected = layerId === 'protected_area';
  const isNationalPark = layerId === 'national_park';
  return {
    strokeColor: color,
    strokeWidth: isNationalPark ? 2.5 : 3,
    strokeOpacity: 0.92,
    strokeDash: isProtected ? 'shortdash' : 'solid',
    fillColor: color,
    fillOpacity: isNationalPark ? 0.08 : 0.16,
    pointRadius: 7,
    labelField: labelField ?? 'name',
    showLabels: true,
    zIndex: 15,
  };
}
