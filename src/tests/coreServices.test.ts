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
  kmToNauticalMiles,
  resolveSmartWaypoint,
  samplePolylineDirectionArrows,
} from '../services/routeGeoService.ts';
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
  });

  it('passes all 8 core benchmark sea routes with Zero Land Crossing and optimal A* distance', () => {
    const benchmarks: Array<{
      id: string;
      fromId: string;
      toId: string;
      maxKm: number;
      expectedWaypointSubsequence?: string[];
    }> = [
      {
        id: '[RC-ROUTE-01 #1] 저구항(GJ-001) -> 삼덕항(KR-GN-TY-0002)',
        fromId: 'GJ-001',
        toId: 'KR-GN-TY-0002',
        maxKm: 28.0,
        expectedWaypointSubsequence: ['WP-HANSAN-N', 'WP-MIREUK-S'],
      },
      {
        id: '[RC-ROUTE-01 #2] 한산 제승당(TY-002) -> 거제 법동항(KR-GN-GJ-0026)',
        fromId: 'TY-002',
        toId: 'KR-GN-GJ-0026',
        maxKm: 13.0,
        expectedWaypointSubsequence: ['WP-HANSAN-N', 'WP-DUNDEOK-W'],
      },
      {
        id: '[RC-ROUTE-02 #1] 강구안(TY-001) -> 죽림항(KR-GN-TY-0015)',
        fromId: 'TY-001',
        toId: 'KR-GN-TY-0015',
        maxKm: 13.2,
      },
      {
        id: '[RC-ROUTE-02 #2] 강구안(TY-001) -> 달아항(KR-GN-TY-0005)',
        fromId: 'TY-001',
        toId: 'KR-GN-TY-0005',
        maxKm: 12.2,
      },
      {
        id: '[RC-ROUTE-03 #1] 한산 제승당(TY-002) -> 창좌항(KR-GN-TY-0021)',
        fromId: 'TY-002',
        toId: 'KR-GN-TY-0021',
        maxKm: 11.0,
        expectedWaypointSubsequence: ['WP-HANSAN-N'],
      },
      {
        id: '[RC-ROUTE-03 #2] 저구항(GJ-001) -> 쌍근 선착장(KR-GN-GJ-BERTH-0020)',
        fromId: 'GJ-001',
        toId: 'KR-GN-GJ-BERTH-0020',
        maxKm: 10.0,
        expectedWaypointSubsequence: ['WP-GARAN-SW'],
      },
      {
        id: '[RC-ROUTE-03 #3] 장승포항(GJ-002) -> 지세포항(KR-GN-GJ-0005)',
        fromId: 'GJ-002',
        toId: 'KR-GN-GJ-0005',
        maxKm: 10.0,
        expectedWaypointSubsequence: ['WP-JISEPO-E'],
      },
      {
        id: '[RC-ROUTE-04] 매물도 당금항(TY-003) -> 소매물도항(KR-GN-TY-0035)',
        fromId: 'TY-003',
        toId: 'KR-GN-TY-0035',
        maxKm: 8.5,
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

      // Verify inner sea segments (seaApproach -> waypoints -> seaApproach) never cross land barriers
      const innerCoords = leg.pathPositions.slice(1, -1);
      for (let i = 0; i < innerCoords.length - 1; i++) {
        const [lat1, lng1] = innerCoords[i];
        const [lat2, lng2] = innerCoords[i + 1];
        assert.equal(
          doesSegmentCrossLand(lat1, lng1, lat2, lng2),
          false,
          `${bm.id}: inner sea segment [${i} -> ${i + 1}] crossed land barrier`,
        );
      }

      if (bm.expectedWaypointSubsequence) {
        const activeIds = leg.activeWaypoints.map((w) => w.id);
        for (const expectedId of bm.expectedWaypointSubsequence) {
          assert.ok(
            activeIds.includes(expectedId),
            `${bm.id}: expected activeWaypoints [${activeIds.join(', ')}] to include ${expectedId}`,
          );
        }
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

    const citation = buildSourceCitationCopyText('v2.2');
    assert.ok(citation.includes('[바다꼼꼬미 v2.2 데이터 · API · 지도 · 기술 출처 요약]'));
    assert.ok(citation.includes('국립해양조사원(KHOA)'));
    assert.ok(citation.includes('유럽중기예보센터(ECMWF'));
  });
});


