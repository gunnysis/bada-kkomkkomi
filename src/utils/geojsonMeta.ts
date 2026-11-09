import type { SpatialGeometryType } from '../types/config';
import type {
  SpatialFeature,
  SpatialFeatureCollection,
} from '../types/spatialLayer';

export interface Wgs84NormalizedMeta {
  featureCollection: SpatialFeatureCollection;
  geometryTypes: SpatialGeometryType[];
  bbox?: [number, number, number, number];
}

function updateBBoxFromCoords(
  coords: unknown,
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): void {
  if (!Array.isArray(coords)) return;
  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    const lng = coords[0];
    const lat = coords[1];
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < bounds.minLng) bounds.minLng = lng;
      if (lng > bounds.maxLng) bounds.maxLng = lng;
      if (lat < bounds.minLat) bounds.minLat = lat;
      if (lat > bounds.maxLat) bounds.maxLat = lat;
    }
    return;
  }
  for (const child of coords) {
    updateBBoxFromCoords(child, bounds);
  }
}

/**
 * 초기 부팅 시 정적 EPSG:4326 GeoJSON 파일의 피처·지오메트리 유형·BBox만 경량 추출하는 헬퍼
 * - 무거운 proj4 / fflate / spatialFileParser 번들이 초기 부팅 청크에 포함되지 않도록 분리
 */
export function normalizeWgs84FeatureCollection(
  rawData: unknown,
): Wgs84NormalizedMeta {
  const rawObj = rawData as { features?: unknown[] } | null;
  const rawFeatures = Array.isArray(rawObj?.features) ? rawObj.features : [];

  const features: SpatialFeature[] = [];
  const geomSet = new Set<SpatialGeometryType>();
  const bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };

  rawFeatures.forEach((item, idx) => {
    const f = item as SpatialFeature | null;
    if (!f || !f.geometry || typeof f.geometry.type !== 'string') return;
    const gType = f.geometry.type as SpatialGeometryType;
    geomSet.add(gType);
    updateBBoxFromCoords(f.geometry.coordinates, bounds);

    const props =
      f.properties && typeof f.properties === 'object' ? { ...f.properties } : {};
    features.push({
      type: 'Feature',
      id: f.id ?? idx,
      properties: props,
      geometry: f.geometry,
    });
  });

  const hasValidBounds =
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLng) &&
    Number.isFinite(bounds.maxLat);

  return {
    featureCollection: {
      type: 'FeatureCollection',
      features,
    },
    geometryTypes: Array.from(geomSet),
    bbox: hasValidBounds
      ? [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
      : undefined,
  };
}
