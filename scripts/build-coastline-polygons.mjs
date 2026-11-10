import fs from 'node:fs';
import path from 'node:path';

const RAW_PATH =
  'C:/Users/Administrator/.gemini/antigravity-cli/brain/654e088b-5396-4722-ae87-00a5cb65222b/scratch/osm_coastline_raw.json';
const OUT_TS_PATH = path.resolve('src/data/coastlinePolygons.ts');

// Douglas-Peucker simplification in degrees (1 deg lat ~ 111km, 0.00014 deg ~ 15m)
function sqSegDist(p, p1, p2) {
  let x = p1[1];
  let y = p1[0];
  let dx = p2[1] - x;
  let dy = p2[0] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[1] - x) * dx + (p[0] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[1];
      y = p2[0];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[1] - x;
  dy = p[0] - y;
  return dx * dx + dy * dy;
}

function simplifyDP(points, sqTolerance) {
  const len = points.length;
  const markers = new Uint8Array(len);
  markers[0] = 1;
  markers[len - 1] = 1;
  const stack = [[0, len - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxSqDist = 0;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const sqDist = sqSegDist(points[i], points[first], points[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (maxSqDist > sqTolerance) {
      markers[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < len; i++) {
    if (markers[i]) out.push(points[i]);
  }
  return out;
}

function simplifyClosedRing(coords, toleranceDeg) {
  if (coords.length <= 5) return coords.slice(0, -1);
  // Find two farthest points to split closed ring before DP
  let maxDist = -1;
  let splitIdx = Math.floor(coords.length / 2);
  const p0 = coords[0];
  for (let i = 1; i < coords.length - 1; i++) {
    const d = (coords[i][0] - p0[0]) ** 2 + (coords[i][1] - p0[1]) ** 2;
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }
  const sqTol = toleranceDeg * toleranceDeg;
  const half1 = simplifyDP(coords.slice(0, splitIdx + 1), sqTol);
  const half2 = simplifyDP(coords.slice(splitIdx), sqTol);
  const combined = [...half1.slice(0, -1), ...half2.slice(0, -1)];
  return combined.map(([lat, lng]) => [
    Number(lat.toFixed(5)),
    Number(lng.toFixed(5)),
  ]);
}

// Signed area in (lng, lat) plane: > 0 means CCW, < 0 means CW (OSM coastline default: land on right = CW)
function computeSignedAreaLngLat(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x1 = ring[j][1];
    const y1 = ring[j][0];
    const x2 = ring[i][1];
    const y2 = ring[i][0];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function main() {
  const data = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
  const nodes = new Map();
  const ways = [];
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push(el);
    }
  }

  const startMap = new Map();
  for (const w of ways) {
    const startId = w.nodes[0];
    if (!startMap.has(startId)) startMap.set(startId, []);
    startMap.get(startId).push(w);
  }

  const used = new Set();
  const closedRings = [];
  const openChains = [];

  for (const w of ways) {
    if (used.has(w.id)) continue;
    used.add(w.id);
    const chain = [...w.nodes];
    const tags = { ...(w.tags || {}) };

    while (chain[0] !== chain[chain.length - 1]) {
      const tail = chain[chain.length - 1];
      const candidates = (startMap.get(tail) || []).filter((cand) => !used.has(cand.id));
      if (candidates.length === 0) break;
      const nextWay = candidates[0];
      used.add(nextWay.id);
      if (nextWay.tags?.name && !tags.name) tags.name = nextWay.tags.name;
      chain.push(...nextWay.nodes.slice(1));
    }

    if (chain[0] !== chain[chain.length - 1]) {
      let extendedBackward = true;
      while (extendedBackward && chain[0] !== chain[chain.length - 1]) {
        extendedBackward = false;
        const head = chain[0];
        for (const cand of ways) {
          if (used.has(cand.id)) continue;
          if (cand.nodes[cand.nodes.length - 1] === head) {
            used.add(cand.id);
            if (cand.tags?.name && !tags.name) tags.name = cand.tags.name;
            chain.unshift(...cand.nodes.slice(0, -1));
            extendedBackward = true;
            break;
          }
        }
      }
    }

    const coords = chain.map((nid) => nodes.get(nid)).filter(Boolean);
    if (chain[0] === chain[chain.length - 1]) {
      closedRings.push({ name: tags.name || '', coords });
    } else {
      openChains.push({ name: tags.name || '', coords });
    }
  }

  const polygons = [];

  // 1. Close the main Tongyeong-Goseong-Masan mainland chain (10171 pts: [34.904,128.117] -> [35.102,128.465])
  for (let idx = 0; idx < openChains.length; idx++) {
    const oc = openChains[idx];
    const start = oc.coords[0];
    const end = oc.coords[oc.coords.length - 1];
    let closedCoords = [...oc.coords];
    if (oc.coords.length > 5000) {
      // Tongyeong-Goseong-Masan mainland: close via NW inland corner [35.12, 128.10]
      closedCoords.push([35.12, end[1]], [35.12, 128.10], [start[0], 128.10], start);
    } else if (start[0] > 35.05 || end[0] > 35.05) {
      // Northern Jinhae/Busan chains: close via northern inland border 35.12
      closedCoords.push([35.12, end[1]], [35.12, start[1]], start);
    } else {
      // Western Namhae chain: close via western border 128.08
      closedCoords.push([end[0], 128.08], [start[0], 128.08], start);
    }
    const simp = simplifyClosedRing(closedCoords, 0.00022);
    if (simp.length >= 3) {
      // Ensure clockwise winding in (lng, lat) so outward normal is always left (seaward)
      const area = computeSignedAreaLngLat(simp);
      if (area > 0) simp.reverse();
      polygons.push({
        id: `OSM-MAINLAND-${idx + 1}`,
        name: idx === 0 ? '통영·고성·창원 본토 해안선' : `북부·서부 본토 해안선 ${idx + 1}`,
        polygon: simp,
      });
    }
  }

  // 2. Process all closed island rings
  let islandIdx = 0;
  for (const ring of closedRings) {
    const rawArea = Math.abs(computeSignedAreaLngLat(ring.coords));
    // Skip microscopic sub-15m rocks (< 1e-8 sq deg ~ 100 m^2)
    if (rawArea < 1.2e-8) continue;
    const tol = rawArea > 1e-4 ? 0.00020 : rawArea > 1e-6 ? 0.00014 : 0.00010;
    const simp = simplifyClosedRing(ring.coords, tol);
    if (simp.length < 3) continue;
    const area = computeSignedAreaLngLat(simp);
    if (area > 0) simp.reverse(); // Normalize to CW in (lng, lat)
    islandIdx++;
    polygons.push({
      id: `OSM-ISLAND-${islandIdx}`,
      name: ring.name || `통영·거제 도서 #${islandIdx}`,
      polygon: simp,
    });
  }

  const totalVertices = polygons.reduce((acc, p) => acc + p.polygon.length, 0);
  console.log(`Generated ${polygons.length} real coastline polygons with ${totalVertices} total vertices.`);

  // Verify Hansan-myeon Jwado (around 34.797, 128.503), Songdo (34.796, 128.515), Bisando (34.813, 128.481)
  const checkPoints = [
    ['한산면 좌도(서좌·동좌)', 34.7975, 128.5035],
    ['한산면 송도', 34.7955, 128.5155],
    ['한산면 유자도', 34.7875, 128.4935],
    ['한산 비산도', 34.8135, 128.4820],
    ['한산도 본섬(망산)', 34.7800, 128.4850],
    ['한산도 북단 반도(두억·의항)', 34.8030, 128.4780],
    ['미륵도(산양)', 34.8050, 128.4100],
    ['거제도(계룡산)', 34.8800, 128.6200],
  ];
  for (const [label, lat, lng] of checkPoints) {
    const matched = polygons.filter((p) => {
      const lats = p.polygon.map((c) => c[0]);
      const lngs = p.polygon.map((c) => c[1]);
      return (
        lat >= Math.min(...lats) &&
        lat <= Math.max(...lats) &&
        lng >= Math.min(...lngs) &&
        lng <= Math.max(...lngs)
      );
    });
    console.log(
      `Check [${label}] (${lat}, ${lng}) -> matched BBox of ${matched.map((m) => `${m.id}(${m.polygon.length}v)`).join(', ')}`,
    );
  }

  const fileContent = `/**
 * OpenStreetMap (natural=coastline) 기반 통영·거제·고성·남해·진해만 실측 해안선 및 도서 폴리곤 데이터셋
 * - 원천: OpenStreetMap Contributors (ODbL), 빌드 스크립트: scripts/build-coastline-polygons.mjs
 * - 범위: 34.54°N ~ 35.08°N, 128.12°E ~ 128.82°E
 * - 정점 방향: 모든 다각형은 (lng, lat) 평면 기준 시계방향(CW, 육지가 우측·해수면이 좌측)으로 정규화됨
 */
export interface CoastlineBarrierPolygon {
  id: string;
  name: string;
  polygon: readonly (readonly [number, number])[];
}

export const REAL_COASTLINE_POLYGONS: readonly CoastlineBarrierPolygon[] = ${JSON.stringify(polygons)};
`;

  fs.mkdirSync(path.dirname(OUT_TS_PATH), { recursive: true });
  fs.writeFileSync(OUT_TS_PATH, fileContent, 'utf8');
  console.log(`Wrote ${OUT_TS_PATH} (${(fs.statSync(OUT_TS_PATH).size / 1024).toFixed(1)} KB)`);
}

main();
