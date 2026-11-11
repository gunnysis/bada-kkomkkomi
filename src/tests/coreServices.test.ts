import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  bearingToCardinal8,
  calculateBearingDegrees,
  calculateDurationMinutes,
  calculateHaversineKm,
  calculateRouteSummary,
  doesSegmentCrossLand,
  getPolylineArcMidpoint,
  getNearbyMarinePlaceLabel,
  isPointInAnyLandBarrier,
  kmToNauticalMiles,
  LANDMASS_BARRIER_POLYGONS,
  resolveSmartWaypoint,
  samplePolylineDirectionArrows,
} from '../services/routeGeoService.ts';
import { getRouteLegLabelParts } from '../services/routeLegLabelService.ts';
import { detectCrsFromMetadata } from '../services/spatialFileParser.ts';
import { hasLegacyDummyFeatures } from '../services/layerStorageService.ts';
import {
  alignEcmwfWindAndWaveSeries,
  buildEcmwfWeatherUrls,
  ECMWF_WEATHER_MODELS,
  evaluateCombinedWeatherGrade,
  evaluateHourlyWeatherSeries,
  isValidWeatherThresholds,
  judgeSingleWeatherMetric,
  resolveEffectiveThresholds,
  SAFE_DEFAULT_THRESHOLDS,
} from '../services/ecmwfWeatherService.ts';
import { parseRouteFromUrl } from '../hooks/useAppRoute.ts';
import {
  classifyGpsError,
  isValidRouteWaypointsDraft,
  loadWorkspaceDraft,
  sanitizeWorkspaceDraft,
  WORKSPACE_DRAFT_SCHEMA_VERSION,
} from '../services/workspaceDraftRepository.ts';
import {
  DATA_SOURCE_REGISTRY,
  OFFLINE_CAPABILITY_MATRIX,
  buildSourceCitationCopyText,
  classifyDockingPhotoAsset,
  resolveLayerProvenance,
  summarizePhotoCollection,
} from '../config/dataSources.ts';
import {
  applyDirectPortSelection,
  calculatePortDetourKm,
  findOptimalWaypointInsertIndex,
  findSiblingPorts,
  sanitizeCommittedRouteWaypoints,
  validateCandidatePort,
} from '../services/routePortSelectionService.ts';
import type { MarinePort, MarineWaypointNode, PortsDataset } from '../types/port.ts';
import type { RouteWaypoint } from '../types/route.ts';

const portsDataset = JSON.parse(
  fs.readFileSync(new URL('../../public/data/ports.json', import.meta.url), 'utf8'),
) as PortsDataset;

const ports: MarinePort[] = portsDataset.ports;
const marineWaypoints: MarineWaypointNode[] = portsDataset.waypoints ?? [];
const portById = new Map<string, MarinePort>(ports.map((p) => [p.id, p]));

function makeWaypointFromPort(
  portId: string,
  type: RouteWaypoint['type'],
): RouteWaypoint {
  const p = portById.get(portId);
  assert.ok(p, `Port ${portId} must exist in ports.json`);
  return {
    id: `test_${type}_${portId}`,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    type,
    matchedPortId: p.id,
    isCustomCoord: false,
    subCategory: p.subCategory,
    facilityLabel: p.facilityLabel,
    minDepthMeters: p.minDepthMeters,
    tidalSensitivity: p.tidalSensitivity,
    maxVesselTons: p.maxVesselTons,
    hazards: p.hazards,
  };
}

describe('1. Route Geo Engine & 8 Benchmark Sea Routes (routeGeoService.ts)', () => {
  it('computes accurate Haversine distance, nautical miles, bearing, and duration', () => {
    const dKm = calculateHaversineKm(34.84, 128.42, 34.84, 128.42);
    assert.equal(dKm, 0);

    const nm = kmToNauticalMiles(1.852);
    assert.ok(Math.abs(nm - 1.0) < 1e-6);

    const northBearing = calculateBearingDegrees(34.8, 128.4, 34.9, 128.4);
    assert.equal(northBearing, 0);
    assert.equal(bearingToCardinal8(northBearing), 'N');

    const eastBearing = calculateBearingDegrees(34.8, 128.4, 34.8, 128.5);
    assert.equal(bearingToCardinal8(eastBearing), 'E');

    const mins = calculateDurationMinutes(15, 15);
    assert.equal(mins, 60);
  });

  it('snaps coordinates within 500m to the nearest MarinePort and preserves offshore custom coords', () => {
    const samdeok = portById.get('KR-GN-TY-0002');
    assert.ok(samdeok);

    const snapped = resolveSmartWaypoint(
      samdeok.lat + 0.0005,
      samdeok.lng + 0.0005,
      ports,
      '테스트 지점',
      500,
    );
    assert.equal(snapped.isCustomCoord, false);
    assert.equal(snapped.matchedPortId, 'KR-GN-TY-0002');
    assert.equal(snapped.name, samdeok.name);

    const offshore = resolveSmartWaypoint(34.61, 128.72, ports, '외해 지점', 500);
    assert.equal(offshore.isCustomCoord, true);
    assert.equal(offshore.matchedPortId, undefined);

    // [RC-UX-05] Inland mountain click (Geoje Sadeung-myeon 34.8669, 128.5146) must snap outside land barriers
    assert.equal(isPointInAnyLandBarrier(34.8669, 128.5146), true);
    const inlandSnapped = resolveSmartWaypoint(34.8669, 128.5146, ports, '경유지 1', 500);
    assert.equal(
      isPointInAnyLandBarrier(inlandSnapped.lat, inlandSnapped.lng),
      false,
      'Inland click must be automatically snapped outside land barriers',
    );
  });

  it('passes all 12 core benchmark sea routes with full-segment (0..N-1) Zero Land Crossing and optimal A* distance', () => {
    assert.ok(
      LANDMASS_BARRIER_POLYGONS.length >= 370,
      `Expected >= 370 real OSM coastline barriers, got ${LANDMASS_BARRIER_POLYGONS.length}`,
    );
    assert.ok(
      marineWaypoints.length >= 200,
      `Expected >= 200 marine waypoints, got ${marineWaypoints.length}`,
    );

    const benchmarks: Array<{
      id: string;
      fromId: string;
      toId: string;
      maxKm: number;
      minPathVertices?: number;
    }> = [
      {
        id: '[RC-ROUTE-01 #1] 저구항(GJ-001) -> 삼덕항(KR-GN-TY-0002)',
        fromId: 'GJ-001',
        toId: 'KR-GN-TY-0002',
        maxKm: 28.0,
        minPathVertices: 4,
      },
      {
        id: '[RC-ROUTE-01 #2] 한산 제승당(TY-002) -> 거제 법동항(KR-GN-GJ-0026)',
        fromId: 'TY-002',
        toId: 'KR-GN-GJ-0026',
        maxKm: 19.0,
        minPathVertices: 4,
      },
      {
        id: '[RC-ROUTE-02 #1] 강구안(TY-001) -> 죽림항(KR-GN-TY-0015)',
        fromId: 'TY-001',
        toId: 'KR-GN-TY-0015',
        maxKm: 17.5,
        minPathVertices: 4,
      },
      {
        id: '[RC-ROUTE-02 #2] 강구안(TY-001) -> 달아항(KR-GN-TY-0005)',
        fromId: 'TY-001',
        toId: 'KR-GN-TY-0005',
        maxKm: 13.5,
        minPathVertices: 4,
      },
      {
        id: '[RC-ROUTE-03 #1] 한산 제승당(TY-002) -> 창좌항(KR-GN-TY-0021)',
        fromId: 'TY-002',
        toId: 'KR-GN-TY-0021',
        maxKm: 13.5,
        minPathVertices: 4,
      },
      {
        id: '[RC-ROUTE-03 #2] 저구항(GJ-001) -> 쌍근 선착장(KR-GN-GJ-BERTH-0020)',
        fromId: 'GJ-001',
        toId: 'KR-GN-GJ-BERTH-0020',
        maxKm: 11.5,
        minPathVertices: 3,
      },
      {
        id: '[RC-ROUTE-03 #3] 장승포항(GJ-002) -> 지세포항(KR-GN-GJ-0005)',
        fromId: 'GJ-002',
        toId: 'KR-GN-GJ-0005',
        maxKm: 10.0,
        minPathVertices: 3,
      },
      {
        id: '[RC-ROUTE-04] 매물도 당금항(TY-003) -> 소매물도항(KR-GN-TY-0035)',
        fromId: 'TY-003',
        toId: 'KR-GN-TY-0035',
        maxKm: 8.5,
        minPathVertices: 3,
      },
      {
        id: '[RC-LAND-01] 통영 당동항(TY-001) -> 한산 제승당(TY-002) 기본 항로',
        fromId: 'TY-001',
        toId: 'TY-002',
        maxKm: 10.5,
        minPathVertices: 4,
      },
      {
        id: '[RC-LAND-02] 한산도 의항 선착장(KR-GN-TY-BERTH-0013) -> 한산 제승당(TY-002)',
        fromId: 'KR-GN-TY-BERTH-0013',
        toId: 'TY-002',
        maxKm: 13.5,
        minPathVertices: 4,
      },
      {
        id: '[RC-LAND-03] 연화도 동두 선착장(KR-GN-TY-BERTH-0006) -> 통영항(KR-GN-TY-0001)',
        fromId: 'KR-GN-TY-BERTH-0006',
        toId: 'KR-GN-TY-0001',
        maxKm: 30.5,
        minPathVertices: 4,
      },
      {
        id: '[RC-LAND-04] 학동항(KR-GN-GJ-0010) -> 구조라항(KR-GN-GJ-0008)',
        fromId: 'KR-GN-GJ-0010',
        toId: 'KR-GN-GJ-0008',
        maxKm: 9.5,
        minPathVertices: 3,
      },
    ];

    for (const bm of benchmarks) {
      const wps = [
        makeWaypointFromPort(bm.fromId, 'start'),
        makeWaypointFromPort(bm.toId, 'end'),
      ];
      const summary = calculateRouteSummary(wps, 15, ports, marineWaypoints);
      assert.equal(summary.legs.length, 1, bm.id);
      const leg = summary.legs[0];

      assert.ok(
        leg.distanceKm > 0 && leg.distanceKm <= bm.maxKm,
        `${bm.id}: expected distanceKm <= ${bm.maxKm}, got ${leg.distanceKm.toFixed(2)}km`,
      );
      assert.ok(
        leg.directionArrows.length >= 1,
        `${bm.id}: expected direction arrows to be sampled`,
      );
      if (bm.minPathVertices) {
        assert.ok(
          leg.pathPositions.length >= bm.minPathVertices,
          `${bm.id}: expected pathPositions.length >= ${bm.minPathVertices}, got ${leg.pathPositions.length}`,
        );
      }

      // Verify ALL segments (0 .. pathPositions.length - 1, including port <-> seaApproach) never cross land barriers
      for (let i = 0; i < leg.pathPositions.length - 1; i++) {
        const [lat1, lng1] = leg.pathPositions[i];
        const [lat2, lng2] = leg.pathPositions[i + 1];
        assert.equal(
          doesSegmentCrossLand(lat1, lng1, lat2, lng2),
          false,
          `${bm.id}: segment [${i} -> ${i + 1}] (${lat1},${lng1} -> ${lat2},${lng2}) crossed land barrier`,
        );
      }
    }
  });

  it('guarantees zero land crossing on all 136 port approaches and all 300 waypoint graph edges', () => {
    const wpMap = new Map(marineWaypoints.map((w) => [w.id, w]));

    for (const w of marineWaypoints) {
      assert.equal(
        isPointInAnyLandBarrier(w.lat, w.lng),
        false,
        `Waypoint ${w.id} (${w.name}) is inside a land barrier`,
      );
      for (const nbId of w.neighbors) {
        const nb = wpMap.get(nbId);
        assert.ok(nb, `Waypoint ${w.id} references missing neighbor ${nbId}`);
        assert.ok(
          nb.neighbors.includes(w.id),
          `Asymmetric waypoint edge: ${w.id} -> ${nbId} is not reciprocated`,
        );
        assert.equal(
          doesSegmentCrossLand(w.lat, w.lng, nb.lat, nb.lng),
          false,
          `Waypoint edge ${w.id} <-> ${nbId} crosses a land barrier`,
        );
      }
    }

    for (const p of ports) {
      const seaLat = p.seaApproachLat ?? p.lat;
      const seaLng = p.seaApproachLng ?? p.lng;
      assert.equal(
        doesSegmentCrossLand(p.lat, p.lng, seaLat, seaLng),
        false,
        `Port ${p.id} (${p.name}) -> seaApproach crosses a land barrier`,
      );
      for (const wpId of p.connectedWaypointIds ?? []) {
        const wp = wpMap.get(wpId);
        assert.ok(wp, `Port ${p.id} references missing waypoint ${wpId}`);
        assert.equal(
          doesSegmentCrossLand(seaLat, seaLng, wp.lat, wp.lng),
          false,
          `Port ${p.id} (${p.name}) seaApproach -> ${wpId} crosses a land barrier`,
        );
      }
    }
  });

  it('computes true 50% arc-length midpoint and avoids endpoint collisions', () => {
    const coords: [number, number][] = [
      [34.8, 128.4],
      [34.8, 128.48],
      [34.8, 128.5],
    ];
    const mid = getPolylineArcMidpoint(coords);
    assert.ok(Math.abs(mid.midLat - 34.8) < 1e-4);
    assert.ok(Math.abs(mid.midLng - 128.45) < 1e-3);

    const arrows = samplePolylineDirectionArrows(coords, 0);
    assert.ok(arrows.length >= 1);
    for (const arrow of arrows) {
      assert.ok(arrow.bearingDeg >= 0 && arrow.bearingDeg < 360);
    }
  });
});

describe('2. ECMWF Marine Weather Service & Threshold Validation (ecmwfWeatherService.ts)', () => {
  it('enforces 0 < good < moderate threshold invariant and falls back safely', () => {
    assert.equal(
      isValidWeatherThresholds({
        windKnot: { good: 14, moderate: 20 },
        waveMeter: { good: 1.0, moderate: 1.8 },
      }),
      true,
    );

    // Inverted thresholds (good >= moderate) must be rejected
    assert.equal(
      isValidWeatherThresholds({
        windKnot: { good: 22, moderate: 20 },
        waveMeter: { good: 1.0, moderate: 1.8 },
      }),
      false,
    );

    const resolved = resolveEffectiveThresholds(
      {
        windKnot: { good: 25, moderate: 15 },
        waveMeter: { good: 1.0, moderate: 1.8 },
      },
      null,
    );
    assert.deepEqual(resolved, SAFE_DEFAULT_THRESHOLDS);
  });

  it('locks Open-Meteo URLs to ecmwf_ifs and ecmwf_wam models with Asia/Seoul timezone', () => {
    const urls = buildEcmwfWeatherUrls(34.8195, 128.552);
    assert.ok(urls.windForecastUrl.includes(`models=${ECMWF_WEATHER_MODELS.wind}`));
    assert.ok(urls.windForecastUrl.includes('wind_speed_unit=kn'));
    assert.ok(urls.waveMarineUrl.includes(`models=${ECMWF_WEATHER_MODELS.wave}`));
    assert.ok(urls.waveMarineUrl.includes('timezone=Asia%2FSeoul'));
  });

  it('aligns wind and wave series by timestamp Map and evaluates missing data as unknown', () => {
    const raw = alignEcmwfWindAndWaveSeries({
      windTimes: ['2026-11-10T12:00', '2026-11-10T13:00', '2026-11-10T14:00'],
      windValues: [10, 16, null],
      waveTimes: ['2026-11-10T12:00', '2026-11-10T13:00', '2026-11-10T14:00'],
      waveValues: [0.6, 1.2, 0.8],
      nowHourPrefix: '2026-11-10T12',
    });

    const evaluated = evaluateHourlyWeatherSeries(raw, SAFE_DEFAULT_THRESHOLDS);
    assert.equal(evaluated.length, 3);
    assert.equal(evaluated[0].grade, 'good');
    assert.equal(evaluated[1].grade, 'moderate');
    assert.equal(evaluated[2].grade, 'unknown');

    assert.equal(judgeSingleWeatherMetric(21, { good: 14, moderate: 20 }), 'bad');
    assert.equal(evaluateCombinedWeatherGrade('good', 'bad'), 'bad');
    assert.equal(evaluateCombinedWeatherGrade('good', 'unknown'), 'unknown');
  });
});

describe('3. App Deep-Link & Route Query Parser (useAppRoute.ts)', () => {
  it('normalizes query parameters with strict allowlist', () => {
    assert.deepEqual(parseRouteFromUrl(''), { screen: 'home', panel: 'route' });
    assert.deepEqual(parseRouteFromUrl('?screen=notebook'), {
      screen: 'notebook',
      panel: 'route',
    });
    assert.deepEqual(parseRouteFromUrl('?screen=navigation&panel=weather'), {
      screen: 'navigation',
      panel: 'weather',
    });
    assert.deepEqual(parseRouteFromUrl('?screen=navigation&panel=invalid'), {
      screen: 'navigation',
      panel: 'route',
    });
    assert.deepEqual(parseRouteFromUrl('?screen=unknown_malicious'), {
      screen: 'home',
      panel: 'route',
    });
  });
});

describe('4. Workspace Draft Persistence & GPS Error Classification (workspaceDraftRepository.ts)', () => {
  it('validates and sanitizes workspace drafts with schema versioning', () => {
    const fallbackWps: RouteWaypoint[] = [
      makeWaypointFromPort('TY-001', 'start'),
      makeWaypointFromPort('TY-002', 'end'),
    ];

    assert.equal(isValidRouteWaypointsDraft(fallbackWps), true);
    assert.equal(isValidRouteWaypointsDraft([fallbackWps[0]]), false);

    // Valid schema v1 draft
    const validRaw = {
      schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
      routeWaypoints: fallbackWps,
      speedKnots: 18,
      selectedColors: ['red', 'amber'],
      selectedRegion: 'tongyeong',
      savedAt: '2026-11-10T12:00:00.000Z',
    };
    const restored = sanitizeWorkspaceDraft(validRaw, fallbackWps, 15);
    assert.equal(restored.speedKnots, 18);
    assert.deepEqual(restored.selectedColors, ['red', 'amber']);
    assert.equal(restored.selectedRegion, 'tongyeong');

    // Corrupted or mismatched schema version falls back safely
    const corrupted = sanitizeWorkspaceDraft(
      { schemaVersion: 999, speedKnots: -10, selectedColors: [] },
      fallbackWps,
      15,
    );
    assert.equal(corrupted.speedKnots, 15);
    assert.deepEqual(corrupted.selectedColors, ['red']);
    assert.equal(corrupted.selectedRegion, 'all');

    // Clean Empty Route Initialization Invariant: loadWorkspaceDraft([], 15) must always return empty routeWaypoints
    const initialBootDraft = loadWorkspaceDraft([], 15);
    assert.deepEqual(initialBootDraft.routeWaypoints, []);
  });

  it('classifies GPS GeolocationPositionError codes into explicit field messages without faking coordinates', () => {
    const denied = classifyGpsError({ code: 1 });
    assert.equal(denied.code, 'permission_denied');
    assert.ok(denied.message.includes('위치 권한이 거부'));

    const unavailable = classifyGpsError({ code: 2 });
    assert.equal(unavailable.code, 'unavailable');
    assert.ok(unavailable.message.includes('시뮬레이션 위치'));

    const timeout = classifyGpsError({ code: 3 });
    assert.equal(timeout.code, 'timeout');
    assert.ok(timeout.message.includes('수신 시간이 초과'));
  });
});

describe('5. Source Credibility & Provenance SSOT Registry (dataSources.ts)', () => {
  it('maintains all 6 core provenance categories and 5 offline capability rows', () => {
    assert.equal(DATA_SOURCE_REGISTRY.length, 6);
    assert.equal(OFFLINE_CAPABILITY_MATRIX.length, 5);
    const ids = DATA_SOURCE_REGISTRY.map((item) => item.id);
    assert.deepEqual(ids, [
      'ports_docking',
      'marine_weather',
      'map_gis',
      'route_algorithm',
      'qgis_parser',
      'brand_ui',
    ]);
  });

  it('distinguishes SVG schematic diagrams from real field photos and resolves layer provenance', () => {
    const svgMeta = classifyDockingPhotoAsset('/images/docking/ty-001.svg');
    assert.equal(svgMeta.isVectorDiagram, true);
    assert.ok(svgMeta.badgeText.includes('현장 이해용 모식도'));

    const jpgMeta = classifyDockingPhotoAsset('/images/docking/ty-001-real.jpg');
    assert.equal(jpgMeta.isVectorDiagram, false);
    assert.ok(jpgMeta.badgeText.includes('현장 실사 사진'));

    const allDiagrams = summarizePhotoCollection([
      '/images/docking/ty-001.svg',
      '/images/docking/ty-002.svg',
    ]);
    assert.equal(allDiagrams.sectionTitle, '현장 접안 모식도 (수심·위험 도해)');
    assert.equal(allDiagrams.hasVectorDiagram, true);

    const mixedPhotos = summarizePhotoCollection([
      '/images/docking/ty-001.svg',
      '/images/docking/ty-001-real.jpg',
    ]);
    assert.equal(mixedPhotos.sectionTitle, '현장 접안 사진 · 모식도');

    const builtInLayer = resolveLayerProvenance({ id: 'national_park' });
    assert.equal(builtInLayer.isBuiltInSchematic, true);
    assert.ok(builtInLayer.badgeLabel.includes('경량 도식화'));

    const uploadedLayer = resolveLayerProvenance({
      id: 'layer_custom_1',
    });
    assert.equal(uploadedLayer.isBuiltInSchematic, false);
    assert.ok(uploadedLayer.badgeLabel.includes('사용자 직접 등록'));

    const citation = buildSourceCitationCopyText('v2.4');
    assert.ok(citation.includes('[바다꼼꼬미 v2.4 데이터 · API · 지도 · 기술 출처 요약]'));
    assert.ok(citation.includes('국립해양조사원(KHOA)'));
    assert.ok(citation.includes('유럽중기예보센터(ECMWF'));
  });
});

describe('6. v2.4 Spatial CRS Detection, Route Leg Label Toggle & Nearby Marine Label (Memo 3 & Map Fixes)', () => {
  it('formats route leg label parts cleanly across all 4 toggle states without stray separators', () => {
    const bothOn = getRouteLegLabelParts(24.4, 6.234, true, true);
    assert.deepEqual(bothOn, {
      durationText: '24분',
      distanceText: '6.2NM',
      combinedText: '24분 · 6.2NM',
      isHidden: false,
    });

    const durationOnly = getRouteLegLabelParts(24.4, 6.234, true, false);
    assert.deepEqual(durationOnly, {
      durationText: '24분',
      distanceText: null,
      combinedText: '24분',
      isHidden: false,
    });

    const distanceOnly = getRouteLegLabelParts(24.4, 6.234, false, true);
    assert.deepEqual(distanceOnly, {
      durationText: null,
      distanceText: '6.2NM',
      combinedText: '6.2NM',
      isHidden: false,
    });

    const bothOff = getRouteLegLabelParts(24.4, 6.234, false, false);
    assert.deepEqual(bothOff, {
      durationText: null,
      distanceText: null,
      combinedText: '',
      isHidden: true,
    });
  });

  it('appends ( 인근: ... ) only for custom sea coordinates within 5 NM and preserves official port names', () => {
    const samdeok = portById.get('KR-GN-TY-0002');
    assert.ok(samdeok);

    // 1) Official port snap (<500m) must keep exact official name without ( 인근: ... )
    const snappedOfficial = resolveSmartWaypoint(
      samdeok.lat + 0.0002,
      samdeok.lng + 0.0002,
      ports,
      '해상 출발지',
      500,
    );
    assert.equal(snappedOfficial.isCustomCoord, false);
    assert.equal(snappedOfficial.name, samdeok.name);
    assert.equal(snappedOfficial.name.includes('인근:'), false);

    // 2) Custom sea coordinate ~2.2 km from port (>500m snap radius, <=5 NM) appends nearby marine place label
    const nearCustom = resolveSmartWaypoint(
      34.745,
      128.415,
      ports,
      '경유지 1',
      500,
    );
    assert.equal(nearCustom.isCustomCoord, true);
    assert.ok(
      nearCustom.name.includes('인근 해상'),
      `Expected nearby place label for custom coordinate within 5 NM, got: ${nearCustom.name}`,
    );

    // 3) Far offshore (>5 NM from any port) returns null from getNearbyMarinePlaceLabel
    const farLabel = getNearbyMarinePlaceLabel(34.35, 128.95, ports, 5);
    assert.equal(farLabel, null);
  });

  it('detects EPSG:5181 from Korea_2000_Korea_Central_Belt WKT with spaces after commas', () => {
    const prjWkt5181 =
      'PROJCS["Korea_2000_Korea_Central_Belt",GEOGCS["GCS_Korea_2000",DATUM["D_Korea_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",200000.0],PARAMETER["False_Northing", 500000.0],PARAMETER["Central_Meridian", 127.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",38.0],UNIT["Meter",1.0]]';
    assert.equal(detectCrsFromMetadata(prjWkt5181), 'EPSG:5181');
  });

  it('detects legacy dummy polygon IDs (NP-TY-01, NP-GJ-02, SPA-01, SPA-02) for automatic cache purge', () => {
    assert.equal(
      hasLegacyDummyFeatures({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'NP-TY-01',
            properties: { id: 'NP-TY-01', name: '한려해상국립공원 (통영·한산지구)' },
            geometry: { type: 'Polygon', coordinates: [] },
          },
        ],
      }),
      true,
    );

    const realProtectedFc = JSON.parse(
      fs.readFileSync(
        new URL('../../public/data/layers/protected_area.geojson', import.meta.url),
        'utf8',
      ),
    );
    assert.equal(hasLegacyDummyFeatures(realProtectedFc), false);
    assert.equal(realProtectedFc.features.length, 20);
  });
});

describe('7. Registered Port Candidate Selection, Sibling Port Switcher & Post-Edit Sanitization (routePortSelectionService.ts)', () => {
  it('groups co-located and nearby (<150m) sibling ports for 1-tap switching (GAP-01)', () => {
    // 0m exact co-located pair 1: TY-003 <-> KR-GN-TY-0033 (욕지도 동항)
    const yokjiDocking = portById.get('TY-003');
    assert.ok(yokjiDocking);
    const yokjiSiblings = findSiblingPorts(yokjiDocking, ports, 150);
    const yokjiSiblingIds = yokjiSiblings.map((p) => p.id);
    assert.ok(yokjiSiblingIds.includes('TY-003'));
    assert.ok(yokjiSiblingIds.includes('KR-GN-TY-0033'));

    // 0m exact co-located pair 2: KR-GN-TY-0003 <-> KR-GN-TY-BERTH-0008 (척포항)
    const cheokpoPort = portById.get('KR-GN-TY-0003');
    assert.ok(cheokpoPort);
    const cheokpoSiblings = findSiblingPorts(cheokpoPort, ports, 150);
    const cheokpoSiblingIds = cheokpoSiblings.map((p) => p.id);
    assert.ok(cheokpoSiblingIds.includes('KR-GN-TY-0003'));
    assert.ok(cheokpoSiblingIds.includes('KR-GN-TY-BERTH-0008'));
  });

  it('blocks 0-distance direct A -> A and consecutive duplicates while allowing round-trip A -> B -> A (GAP-05)', () => {
    const portA = portById.get('TY-001');
    const portB = portById.get('TY-002');
    const portC = portById.get('TY-003');
    assert.ok(portA && portB && portC);

    // Step 1: Select start A -> immediate commit
    const afterStart = applyDirectPortSelection(portA, [], 'start');
    assert.equal(afterStart.error, null);
    assert.equal(afterStart.waypoints.length, 1);
    assert.equal(afterStart.waypoints[0].type, 'start');
    assert.equal(afterStart.waypoints[0].matchedPortId, portA.id);

    // Step 2: Selecting A again as direct destination (A -> A) must fail validation
    const invalidSameEnd = applyDirectPortSelection(portA, afterStart.waypoints, 'end');
    assert.ok(invalidSameEnd.error !== null);

    // Step 3: Select B as destination -> A -> B
    const afterEndB = applyDirectPortSelection(portB, afterStart.waypoints, 'end');
    assert.equal(afterEndB.error, null);
    assert.equal(afterEndB.waypoints.length, 2);
    assert.equal(afterEndB.waypoints[0].type, 'start');
    assert.equal(afterEndB.waypoints[1].type, 'end');

    // Step 4: Replace end B with A when only 2 waypoints -> becomes A -> A, must fail validation
    const errDirectReplace = validateCandidatePort(
      portA,
      'replace_end',
      afterEndB.waypoints,
      afterEndB.waypoints[1].id,
    );
    assert.ok(errDirectReplace !== null);

    // Step 5: Direct map click on start port A when A -> B is active builds round-trip A -> B -> A
    const roundTripWps = applyDirectPortSelection(portA, afterEndB.waypoints);
    assert.equal(roundTripWps.error, null);
    assert.equal(roundTripWps.waypoints.length, 3);
    assert.equal(roundTripWps.waypoints[0].matchedPortId, portA.id);
    assert.equal(roundTripWps.waypoints[1].matchedPortId, portB.id);
    assert.equal(roundTripWps.waypoints[1].type, 'waypoint');
    assert.equal(roundTripWps.waypoints[2].matchedPortId, portA.id);
    assert.equal(roundTripWps.waypoints[2].type, 'end');

    // Step 6: Removing middle waypoint B from A -> B -> A must sanitize A -> A down to single start [A] (GAP-06)
    const afterRemoveMiddle = sanitizeCommittedRouteWaypoints(
      roundTripWps.waypoints.filter((w) => w.type !== 'waypoint'),
    );
    assert.equal(afterRemoveMiddle.waypoints.length, 1);
    assert.equal(afterRemoveMiddle.waypoints[0].type, 'start');
    assert.equal(afterRemoveMiddle.waypoints[0].matchedPortId, portA.id);
    assert.ok(afterRemoveMiddle.notice !== null);
  });

  it('applies direct 1-step port selection (start -> end -> 3rd+ click optimal waypoint & 1-tap toggle removal) and computes accurate sea-route travel time', () => {
    const portA = portById.get('TY-001'); // 강구안
    const portB = portById.get('TY-003'); // 욕지도
    const portMid = portById.get('KR-GN-TY-0005'); // 달아항 (강구안 -> 욕지도 항로 중간 경유지)
    const portDetour = portById.get('KR-GN-GJ-0026'); // 거제 법동항 (항로 반대편 원거리 항구)
    const portNearStart = portById.get('KR-GN-TY-0002'); // 삼덕항 (강구안에서 달아항 사이)
    assert.ok(portA && portB && portMid && portDetour && portNearStart);

    // 1st map selection on empty route -> immediately sets start
    const first = applyDirectPortSelection(portA, []);
    assert.equal(first.error, null);
    assert.equal(first.addedRole, 'start');
    assert.equal(first.waypoints.length, 1);
    assert.equal(first.waypoints[0].matchedPortId, portA.id);

    // Selecting same port A as 2nd selection -> blocked with clear error
    const duplicateSecond = applyDirectPortSelection(portA, first.waypoints);
    assert.ok(duplicateSecond.error !== null);
    assert.equal(duplicateSecond.waypoints.length, 1);

    // 2nd map selection on different port B -> immediately sets end and completes route
    const second = applyDirectPortSelection(portB, first.waypoints);
    assert.equal(second.error, null);
    assert.equal(second.addedRole, 'end');
    assert.equal(second.waypoints.length, 2);
    assert.equal(second.waypoints[0].matchedPortId, portA.id);
    assert.equal(second.waypoints[1].matchedPortId, portB.id);

    // Verify route corridor detour calculation (달아항 has smaller detour on 강구안->욕지도 than 거제 법동항)
    const detourMidKm = calculatePortDetourKm(portMid, second.waypoints);
    const detourFarKm = calculatePortDetourKm(portDetour, second.waypoints);
    assert.ok(
      detourMidKm < detourFarKm,
      `Expected mid-corridor port detour (${detourMidKm}km) < far port detour (${detourFarKm}km)`,
    );

    // 3rd map click (no targetSlot needed!) -> automatically inserts as intermediate waypoint at optimal leg
    const thirdClickWaypoint = applyDirectPortSelection(portMid, second.waypoints);
    assert.equal(thirdClickWaypoint.error, null);
    assert.equal(thirdClickWaypoint.addedRole, 'waypoint');
    assert.equal(thirdClickWaypoint.waypoints.length, 3);
    assert.equal(thirdClickWaypoint.waypoints[0].matchedPortId, portA.id);
    assert.equal(thirdClickWaypoint.waypoints[1].matchedPortId, portMid.id);
    assert.equal(thirdClickWaypoint.waypoints[1].type, 'waypoint');
    assert.equal(thirdClickWaypoint.waypoints[2].matchedPortId, portB.id);

    // 4th map click on another port closer to start (삼덕항 between 강구안 and 달아항) -> optimal leg insertion at index 1
    const optimalCheck = findOptimalWaypointInsertIndex(
      portNearStart,
      thirdClickWaypoint.waypoints,
    );
    assert.equal(optimalCheck.insertIndex, 1);

    const fourthClickWaypoint = applyDirectPortSelection(
      portNearStart,
      thirdClickWaypoint.waypoints,
    );
    assert.equal(fourthClickWaypoint.error, null);
    assert.equal(fourthClickWaypoint.addedRole, 'waypoint');
    assert.equal(fourthClickWaypoint.waypoints.length, 4);
    assert.equal(fourthClickWaypoint.waypoints[1].matchedPortId, portNearStart.id);
    assert.equal(fourthClickWaypoint.waypoints[2].matchedPortId, portMid.id);

    // Re-clicking an existing intermediate waypoint marker on the map toggles (removes) it immediately
    const toggledOff = applyDirectPortSelection(
      portNearStart,
      fourthClickWaypoint.waypoints,
    );
    assert.equal(toggledOff.error, null);
    assert.equal(toggledOff.addedRole, 'removed_waypoint');
    assert.equal(toggledOff.waypoints.length, 3);
    assert.equal(toggledOff.waypoints[1].matchedPortId, portMid.id);

    // Black-box engine computes accurate real-sea distance and travel duration across all legs
    const summary = calculateRouteSummary(
      toggledOff.waypoints,
      15,
      ports,
      marineWaypoints,
    );
    assert.equal(summary.legs.length, 2);
    assert.ok(summary.totalDistanceNm > 0);
    assert.ok(summary.totalDurationMinutes > 0);
  });
});



