import fs from 'node:fs';
import path from 'node:path';

/**
 * 바다꼼꼬미 (Bada-Kkomkkomi) 전사 데이터·버전·항로 그래프·레거시 재발 방지 검증 스크립트
 * - 로컬(`npm run verify`) 및 GitHub Actions CI(`deploy-pages.yml`)에서 공통 실행됩니다.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[Integrity Failure] ${message}`);
  }
}

// 1. 버전 단일 정본(Single Source of Truth) 및 라이트 테마 동기화 검증 (LEG-02 / LEG-08 / LEG-14 재발 방지)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const pkgLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const appVersionTs = fs.readFileSync('src/config/appVersion.ts', 'utf8');
const viteConfigTs = fs.readFileSync('vite.config.ts', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const deployGuideMd = fs.readFileSync('DEPLOY_GUIDE.md', 'utf8');

const versionMatch = appVersionTs.match(/APP_VERSION\s*=\s*'([^']+)'/);
const displayMatch = appVersionTs.match(/APP_VERSION_DISPLAY\s*=\s*'([^']+)'/);

assert(versionMatch, 'src/config/appVersion.ts must export APP_VERSION');
assert(displayMatch, 'src/config/appVersion.ts must export APP_VERSION_DISPLAY');
assert(
  pkg.version === versionMatch[1],
  `package.json version (${pkg.version}) does not match APP_VERSION (${versionMatch[1]})`,
);
assert(
  pkgLock.version === versionMatch[1] && pkgLock.packages?.['']?.version === versionMatch[1],
  `package-lock.json version (${pkgLock.version}) does not match APP_VERSION (${versionMatch[1]})`,
);
assert(
  viteConfigTs.includes(`[${displayMatch[1]}]`),
  `vite.config.ts PWA manifest description must include [${displayMatch[1]}]`,
);
assert(
  indexHtml.includes(`[${displayMatch[1]}]`),
  `index.html title/description must include [${displayMatch[1]}]`,
);
assert(
  deployGuideMd.includes(`[${displayMatch[1]}]`),
  `DEPLOY_GUIDE.md header must include [${displayMatch[1]}]`,
);
assert(
  fs.existsSync('docs/DATA_AND_TECH_SOURCES.md') &&
    fs.existsSync('src/config/dataSources.ts'),
  'Source provenance documentation (docs/DATA_AND_TECH_SOURCES.md) and SSOT module (src/config/dataSources.ts) must exist',
);
assert(
  !indexHtml.includes('class="dark"') && !indexHtml.includes('#061c24'),
  'index.html must not contain legacy dark mode class or #061c24 theme color',
);

// 2. app_config.json 및 기상 기본 기준치 검증
const cfg = JSON.parse(fs.readFileSync('public/config/app_config.json', 'utf8'));
assert(Array.isArray(cfg.layers), 'Invalid app_config.json: layers must be an array');
assert(
  cfg.weather_defaults?.wind_threshold_knot?.good > 0 &&
    cfg.weather_defaults?.wind_threshold_knot?.good <
      cfg.weather_defaults?.wind_threshold_knot?.moderate,
  'Invalid app_config.json: wind_threshold_knot must satisfy 0 < good < moderate',
);
assert(
  cfg.weather_defaults?.wave_threshold_meter?.good > 0 &&
    cfg.weather_defaults?.wave_threshold_meter?.good <
      cfg.weather_defaults?.wave_threshold_meter?.moderate,
  'Invalid app_config.json: wave_threshold_meter must satisfy 0 < good < moderate',
);

// 3. docking_points.geojson (55개소) 및 ports.json (136개소 + 35개 변침점) 무결성 검증
const dockingFc = JSON.parse(
  fs.readFileSync('public/data/docking_points.geojson', 'utf8'),
);
assert(
  dockingFc.type === 'FeatureCollection' &&
    Array.isArray(dockingFc.features) &&
    dockingFc.features.length >= 55,
  'Invalid docking_points.geojson: expected >=55 features',
);

const portsData = JSON.parse(fs.readFileSync('public/data/ports.json', 'utf8'));
assert(
  Array.isArray(portsData.ports) &&
    portsData.ports.length >= 136 &&
    Array.isArray(portsData.waypoints) &&
    portsData.waypoints.length >= 35,
  'Invalid ports.json: expected >=136 ports and >=35 waypoints',
);

const portIdSet = new Set(portsData.ports.map((p) => p.id));
const wpIdSet = new Set(portsData.waypoints.map((w) => w.id));

for (const f of dockingFc.features) {
  assert(
    portIdSet.has(f.properties.id),
    `Missing docking feature ID in ports.json: ${f.properties.id}`,
  );
}

for (const p of portsData.ports) {
  assert(
    Array.isArray(p.connectedWaypointIds) && p.connectedWaypointIds.length > 0,
    `Port ${p.id} must have at least 1 connectedWaypointId`,
  );
  for (const wpId of p.connectedWaypointIds) {
    assert(
      wpIdSet.has(wpId),
      `Port ${p.id} references unknown waypoint ID: ${wpId}`,
    );
  }
}

for (const w of portsData.waypoints) {
  assert(
    Array.isArray(w.neighbors) && w.neighbors.length > 0,
    `Waypoint ${w.id} must have at least 1 neighbor`,
  );
  for (const nbId of w.neighbors) {
    assert(
      wpIdSet.has(nbId),
      `Waypoint ${w.id} references unknown neighbor ID: ${nbId}`,
    );
  }
}

// 4. 공간정보 레이어 GeoJSON 무결성 검증
const layersDir = 'public/data/layers';
for (const file of fs.readdirSync(layersDir)) {
  if (file.endsWith('.geojson') || file.endsWith('.json')) {
    const fc = JSON.parse(fs.readFileSync(path.join(layersDir, file), 'utf8'));
    assert(
      fc.type === 'FeatureCollection' && Array.isArray(fc.features),
      `Invalid GeoJSON FeatureCollection: ${file}`,
    );
  }
}

// 5. public/backup 레거시 백업 폴더 클린 확인 (public/dev는 개발·디자인 레퍼런스 보관용으로 보존하되 SW 프리캐시에서 제외)
if (fs.existsSync('public/backup')) {
  const backupFiles = fs.readdirSync('public/backup').filter((f) => !f.startsWith('.'));
  assert(
    backupFiles.length === 0,
    `Legacy directory public/backup must be empty, found: ${backupFiles.join(', ')}`,
  );
}

// 6. PWA Service Worker (dist/sw.js) 프리캐시 매니페스트 중복 URL 및 dist/dev 미포함 무결성 검증 (빌드 산출물 존재 시)
let swPrecacheCount = 0;
if (fs.existsSync('dist/sw.js')) {
  assert(
    !fs.existsSync('dist/dev'),
    'dist/dev must not exist in production build artifacts (public/dev is preserved on disk only)',
  );
  assert(
    fs.existsSync('dist/manifest.webmanifest'),
    'dist/manifest.webmanifest must exist in production build output',
  );
  const swContent = fs.readFileSync('dist/sw.js', 'utf8');
  const urlMatches = [...swContent.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]);
  const uniqueUrls = new Set(urlMatches);
  assert(
    urlMatches.length > 0 && urlMatches.length === uniqueUrls.size,
    `Duplicate precache URLs detected in dist/sw.js: total=${urlMatches.length}, unique=${uniqueUrls.size}`,
  );
  const devUrls = urlMatches.filter((u) => u.startsWith('dev/') || u.includes('/dev/'));
  assert(
    devUrls.length === 0,
    `public/dev reference files must not be precached in dist/sw.js, found: ${devUrls.join(', ')}`,
  );
  swPrecacheCount = uniqueUrls.size;
}

console.log(
  `[Verify OK] Version ${pkg.version} (${displayMatch[1]}) | Docking: ${dockingFc.features.length} | Ports: ${portsData.ports.length} | Waypoints: ${portsData.waypoints.length} | SW Precache: ${swPrecacheCount || 'pre-build'} | Legacy Bloat: 0`,
);
