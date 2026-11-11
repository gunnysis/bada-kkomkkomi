#!/usr/bin/env node
/**
 * 국립공원공단 QGIS 특별보호구역 원본 Shapefile → 앱 정적 GeoJSON(EPSG:4326) 동기화 스크립트
 * - 원본(Read-Only): C:\Users\Administrator\Desktop\국립공원공단\바다꼼꼬미\21_특별보호구역_구획_201224\20_특별보호구역_신규_최종_201109.shp
 * - 대상: public/data/layers/protected_area.geojson
 * - 필터: 관리 === '한동' (한려해상동부사무소 9개소) || 관리 === '한려' (한려해상국립공원사무소 11개소) → 총 20개소
 * - 좌표계 변환: EPSG:5181 (Korea 2000 / Central Belt, False_Northing=500,000m) → EPSG:4326 (WGS84 경위도)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_QGIS_SHP_PATH =
  process.env.QGIS_PROTECTED_AREA_SHP ||
  'C:\\Users\\Administrator\\Desktop\\국립공원공단\\바다꼼꼬미\\21_특별보호구역_구획_201224\\20_특별보호구역_신규_최종_201109.shp';

const OUTPUT_GEOJSON_PATH = path.join(ROOT, 'public', 'data', 'layers', 'protected_area.geojson');

// EPSG:5181 (Korea 2000 / Central Belt, False Northing = 500,000m)
const EPSG_5181_DEF =
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

proj4.defs('EPSG:5181', EPSG_5181_DEF);

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function signedRingArea(ring) {
  let area = 0;
  for (let i = 0, len = ring.length; i < len - 1; i++) {
    area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  return area / 2;
}

function ensureClosedRing(ring) {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, [first[0], first[1]]];
  }
  return ring;
}

function simplifyPointsDP(pts, toleranceDeg) {
  if (pts.length <= 4 || toleranceDeg <= 0) return pts;
  const sqTol = toleranceDeg * toleranceDeg;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxSqDist = 0;
    let index = 0;
    const x1 = pts[first][0];
    const y1 = pts[first][1];
    const x2 = pts[last][0];
    const y2 = pts[last][1];
    const dx = x2 - x1;
    const dy = y2 - y1;

    for (let i = first + 1; i < last; i++) {
      let px = x1;
      let py = y1;
      if (dx !== 0 || dy !== 0) {
        const t = ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
          px = x2;
          py = y2;
        } else if (t > 0) {
          px += dx * t;
          py += dy * t;
        }
      }
      const ddx = pts[i][0] - px;
      const ddy = pts[i][1] - py;
      const sqDist = ddx * ddx + ddy * ddy;
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (maxSqDist > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const simplified = pts.filter((_, i) => keep[i] === 1);
  const closed = ensureClosedRing(simplified);
  return closed.length >= 4 ? closed : ensureClosedRing(pts);
}

function parseDbf(dbfBuf, encoding = 'utf-8') {
  const view = new DataView(dbfBuf.buffer, dbfBuf.byteOffset, dbfBuf.byteLength);
  const numRecords = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const decoder = new TextDecoder(encoding);

  const fields = [];
  let offset = 32;
  while (offset + 32 <= headerLength && dbfBuf[offset] !== 0x0d) {
    const nameBytes = dbfBuf.subarray(offset, offset + 11);
    const zeroIdx = nameBytes.indexOf(0);
    const cleanNameBytes = zeroIdx >= 0 ? nameBytes.subarray(0, zeroIdx) : nameBytes;
    const name = decoder.decode(cleanNameBytes).trim();
    const type = String.fromCharCode(dbfBuf[offset + 11]);
    const length = dbfBuf[offset + 16];
    fields.push({ name, type, length });
    offset += 32;
  }

  const records = [];
  let recOffset = headerLength;
  for (let r = 0; r < numRecords; r++) {
    if (recOffset + recordLength > dbfBuf.byteLength) break;
    if (dbfBuf[recOffset] === 0x2a) {
      recOffset += recordLength;
      continue;
    }
    let fldPos = recOffset + 1;
    const row = {};
    for (const fld of fields) {
      const slice = dbfBuf.subarray(fldPos, fldPos + fld.length);
      fldPos += fld.length;
      const valStr = decoder.decode(slice).trim();
      if (fld.type === 'N' || fld.type === 'F') {
        const num = Number(valStr);
        row[fld.name] = valStr === '' || Number.isNaN(num) ? valStr : num;
      } else {
        row[fld.name] = valStr;
      }
    }
    records.push(row);
    recOffset += recordLength;
  }
  return records;
}

function parseShp(shpBuf, toleranceDeg = 0.000012) {
  const view = new DataView(shpBuf.buffer, shpBuf.byteOffset, shpBuf.byteLength);
  if (shpBuf.byteLength < 100 || view.getInt32(0, false) !== 9994) {
    throw new Error('Invalid SHP header');
  }
  const geometries = [];
  let offset = 100;
  while (offset + 8 <= shpBuf.byteLength) {
    const contentLenWords = view.getInt32(offset + 4, false);
    const contentByteLen = contentLenWords * 2;
    offset += 8;
    if (contentByteLen <= 0 || offset + contentByteLen > shpBuf.byteLength) break;

    const shapeType = view.getInt32(offset, true);
    const recEnd = offset + contentByteLen;

    if (shapeType === 5 || shapeType === 15 || shapeType === 25) {
      const numParts = view.getInt32(offset + 36, true);
      const numPoints = view.getInt32(offset + 40, true);
      const parts = [];
      let partOff = offset + 44;
      for (let i = 0; i < numParts; i++) {
        parts.push(view.getInt32(partOff, true));
        partOff += 4;
      }
      let ptOff = partOff;
      const rawRings = [];
      for (let p = 0; p < numParts; p++) {
        const startIdx = parts[p];
        const endIdx = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring = [];
        for (let idx = startIdx; idx < endIdx && ptOff + 16 <= recEnd; idx++) {
          const x = view.getFloat64(ptOff, true);
          const y = view.getFloat64(ptOff + 8, true);
          ptOff += 16;
          const [lng, lat] = proj4('EPSG:5181', 'EPSG:4326', [x, y]);
          ring.push([round6(lng), round6(lat)]);
        }
        if (ring.length >= 4) {
          rawRings.push(simplifyPointsDP(ensureClosedRing(ring), toleranceDeg));
        }
      }

      if (rawRings.length === 1) {
        geometries.push({ type: 'Polygon', coordinates: rawRings });
      } else if (rawRings.length > 1) {
        const polygons = [];
        for (const r of rawRings) {
          if (signedRingArea(r) >= 0 || polygons.length === 0) {
            polygons.push([r]);
          } else {
            polygons[polygons.length - 1].push(r);
          }
        }
        if (polygons.length === 1) {
          geometries.push({ type: 'Polygon', coordinates: polygons[0] });
        } else {
          geometries.push({ type: 'MultiPolygon', coordinates: polygons });
        }
      } else {
        geometries.push(null);
      }
    } else {
      geometries.push(null);
    }
    offset = recEnd;
  }
  return geometries;
}

function main() {
  if (!fs.existsSync(DEFAULT_QGIS_SHP_PATH)) {
    console.log(
      `[INFO] 외부 QGIS 원본 경로(${DEFAULT_QGIS_SHP_PATH})가 현재 환경에 없어 기존 컴파일된 protected_area.geojson을 유지합니다.`,
    );
    return;
  }

  const dbfPath = DEFAULT_QGIS_SHP_PATH.replace(/\.shp$/i, '.dbf');
  const shpBuf = fs.readFileSync(DEFAULT_QGIS_SHP_PATH);
  const dbfBuf = fs.readFileSync(dbfPath);

  const records = parseDbf(dbfBuf, 'utf-8');
  const geometries = parseShp(shpBuf, 0.000012); // ~1.2m tolerance for high-precision coastal boundary

  const features = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const geom = geometries[i];
    if (!geom) continue;
    if (rec['관리'] !== '한동' && rec['관리'] !== '한려') continue;

    const code = String(rec['코드명'] || `SPA-${i + 1}`).trim();
    const rawName = String(rec['명칭'] || code).trim();
    const officeName =
      rec['관리'] === '한동' ? '국립공원공단 한려해상동부사무소' : '국립공원공단 한려해상국립공원사무소';
    const locationType = String(rec['입지'] || '').trim();
    const zoneType = String(rec['유형'] || '').trim();
    const status = String(rec['상태'] || '').trim();
    const address = String(rec['주소'] || '').trim();
    const designatedDate = String(rec['지정일'] || '').trim();
    const expireYear = String(rec['만료년'] || '').trim();
    const areaSqm = Number(rec['고시면']) || Number(rec['Shape_Area']) || 0;

    features.push({
      type: 'Feature',
      id: code,
      properties: {
        id: code,
        name: rawName,
        코드명: code,
        관리: rec['관리'],
        office: officeName,
        명칭: rawName,
        입지: locationType,
        유형: zoneType,
        상태: status,
        주소: address,
        지정일: designatedDate,
        만료년: expireYear,
        고시면: areaSqm,
        level: `${locationType} · ${zoneType}`,
        restriction: `${officeName} 관할 특별보호구역 (${status || '기존'} · 지정일 ${designatedDate || '-'} · 만료 ${expireYear || '-'})`,
        description: `[${code}] ${officeName} · ${locationType}/${zoneType} · ${address}`,
      },
      geometry: geom,
    });
  }

  // Sort: 한동-01..09 first, then 한려-01..11
  features.sort((a, b) => String(a.id).localeCompare(String(b.id), 'ko'));

  const fc = {
    type: 'FeatureCollection',
    name: '한려해상국립공원 특별보호구역 (QGIS 20_특별보호구역_신규_최종_201109.shp 정식 변환 · EPSG:4326)',
    features,
  };

  fs.writeFileSync(OUTPUT_GEOJSON_PATH, `${JSON.stringify(fc, null, 2)}\n`, 'utf-8');
  console.log(
    `[OK] 특별보호구역 ${features.length}개소 변환 완료 → ${OUTPUT_GEOJSON_PATH} (${(fs.statSync(OUTPUT_GEOJSON_PATH).size / 1024).toFixed(1)} KB)`,
  );
}

main();
