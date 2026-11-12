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
    fs.existsSync('docs/ARCHITECTURE_AND_DESIGN.md') &&
    fs.existsSync('src/config/dataSources.ts'),
  'Master design doc (docs/ARCHITECTURE_AND_DESIGN.md), source provenance doc (docs/DATA_AND_TECH_SOURCES.md), and SSOT module (src/config/dataSources.ts) must exist',
);
assert(
  !fs.existsSync('docs/SEA_ROUTE_LAND_CROSSING_ROOT_CAUSE_PLAN.md') &&
    !fs.existsSync('docs/SOURCE_CREDIBILITY_UX_DESIGN.md'),
  'Legacy duplicate planning documents must remain merged into docs/ARCHITECTURE_AND_DESIGN.md (LEG-22)',
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

// 3. docking_points.geojson (55개소) 및 ports.json (136개소 + 300개 변침점) + coastlinePolygons.ts (378개 실측 해안선 폴리곤) 무결성 검증
assert(
  fs.existsSync('src/data/coastlinePolygons.ts'),
  'src/data/coastlinePolygons.ts (378 real OpenStreetMap coastline polygons) must exist',
);
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
    portsData.waypoints.length >= 300,
  'Invalid ports.json: expected >=136 ports and >=300 waypoints',
);

const portIdSet = new Set(portsData.ports.map((p) => p.id));
const portById = new Map(portsData.ports.map((p) => [p.id, p]));
const wpIdSet = new Set(portsData.waypoints.map((w) => w.id));
const wpById = new Map(portsData.waypoints.map((w) => [w.id, w]));

for (const f of dockingFc.features) {
  assert(
    portIdSet.has(f.properties.id),
    `Missing docking feature ID in ports.json: ${f.properties.id}`,
  );
  const matchingPort = portById.get(f.properties.id);
  const [fLng, fLat] = f.geometry.coordinates;
  assert(
    Math.abs(matchingPort.lat - fLat) < 1e-5 && Math.abs(matchingPort.lng - fLng) < 1e-5,
    `Coordinate drift between docking_points.geojson and ports.json for ${f.properties.id}: geojson=[${fLat},${fLng}] vs ports.json=[${matchingPort.lat},${matchingPort.lng}]`,
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
    const nb = wpById.get(nbId);
    assert(
      nb && Array.isArray(nb.neighbors) && nb.neighbors.includes(w.id),
      `Asymmetric waypoint edge detected in ports.json: ${w.id} -> ${nbId} is not reciprocated`,
    );
  }
}

// 4. 공간정보 레이어 GeoJSON 무결성 검증 (레거시 가짜 직사각형 폴리곤 영구 차단 + QGIS 특별보호구역 20개소 정합성 검증)
const LEGACY_DUMMY_IDS = new Set(['NP-TY-01', 'NP-GJ-02', 'SPA-01', 'SPA-02']);
const layersDir = 'public/data/layers';
for (const file of fs.readdirSync(layersDir)) {
  if (file.endsWith('.geojson') || file.endsWith('.json')) {
    const fc = JSON.parse(fs.readFileSync(path.join(layersDir, file), 'utf8'));
    assert(
      fc.type === 'FeatureCollection' && Array.isArray(fc.features),
      `Invalid GeoJSON FeatureCollection: ${file}`,
    );
    for (const feat of fc.features) {
      const fid = String(feat.id ?? feat.properties?.id ?? '').trim();
      assert(
        !LEGACY_DUMMY_IDS.has(fid),
        `Legacy dummy polygon ID (${fid}) detected in ${file} — fake rectangular boundaries are strictly forbidden`,
      );
    }
  }
}

const protectedAreaFc = JSON.parse(
  fs.readFileSync('public/data/layers/protected_area.geojson', 'utf8'),
);
assert(
  protectedAreaFc.features.length === 20,
  `protected_area.geojson must contain all 20 Hallyeohaesang Special Protected Area features from QGIS source, got ${protectedAreaFc.features.length}`,
);

// 5. 인트로 홈 화면(HomeScreen.tsx) 및 설정·출처 모달(WeatherThresholdSettings.tsx) 모바일(320px~412px) 레이아웃·텍스트 짤림 재발 방지 가드
const homeScreenTsx = fs.readFileSync('src/components/home/HomeScreen.tsx', 'utf8');
const settingsModalTsx = fs.readFileSync(
  'src/components/navigation/WeatherThresholdSettings.tsx',
  'utf8',
);

// 4대 카드 아이콘 슬롯 높이가 전 카드 동일하게 통일되었는지 확인 (h-14 혼용으로 인한 상·하행 수직 기준선 어긋남 방지)
assert(
  !homeScreenTsx.includes('flex h-14 w-full items-center justify-center sm:h-16'),
  'HomeScreen.tsx: all 4 feature cards must share identical icon slot height without h-14 misalignment',
);
// 미니멀 포스터 리팩토링(Memo 2) 이후 구버전 다중 액션 바가 재도입되지 않았는지 확인
assert(
  !homeScreenTsx.includes('꼬미의 바다수첩 세부 기능 바로가기') &&
    !homeScreenTsx.includes('바닷길 콕콕 세부 기능 바로가기') &&
    !homeScreenTsx.includes('설정 세부 기능 바로가기'),
  'HomeScreen.tsx: multi-button action bars inside poster cards must remain removed (Memo 2)',
);
// 설정 모달 내 오프라인 동작 매트릭스 및 6대 출처 아코디언 제목에 말줄임(truncate)이 재도입되지 않았는지 확인
assert(
  !settingsModalTsx.includes('className="truncate font-extrabold text-[#003360]"') &&
    !settingsModalTsx.includes('className="truncate text-xs font-black text-[#003360] sm:text-sm"'),
  'WeatherThresholdSettings.tsx: source accordion titles and offline matrix labels must wrap cleanly ([word-break:keep-all]) instead of truncating with ellipsis',
);

// 바닷길 시간계산기 초기 빈 경로([]) 불변식, 순차·비항구·항구 정박지 선택(appendSequentialRouteWaypoint / applyResolvedWaypointSelection / applyDirectPortSelection), 실항로 곡선(leg.pathPositions) 렌더링 및 300변침점·378실측해안선 표기 정합 확인
const appTsx = fs.readFileSync('src/App.tsx', 'utf8');
const routeCalcTsx = fs.readFileSync('src/components/navigation/RouteTimeCalculator.tsx', 'utf8');
const kakaoCanvasTsx = fs.readFileSync('src/components/map/KakaoMapCanvas.tsx', 'utf8');
const leafletCanvasTsx = fs.readFileSync('src/components/map/LegacyLeafletCanvas.tsx', 'utf8');
assert(
  appTsx.includes('useState<RouteWaypoint[]>([])') &&
    !appTsx.includes('initialWorkspaceDraft.routeWaypoints') &&
    !appTsx.includes('INITIAL_WAYPOINTS'),
  'src/App.tsx: routeWaypoints must always initialize as an empty array ([]) and never restore a pre-selected route from localStorage or static constants on page load',
);
assert(
  appTsx.includes('applyDirectPortSelection') &&
    appTsx.includes('appendSequentialRouteWaypoint') &&
    appTsx.includes('applyResolvedWaypointSelection'),
  'src/App.tsx: route selection must wire applyDirectPortSelection, appendSequentialRouteWaypoint, and applyResolvedWaypointSelection',
);
assert(
  kakaoCanvasTsx.includes('leg.pathPositions') &&
    leafletCanvasTsx.includes('leg.pathPositions'),
  'KakaoMapCanvas.tsx and LegacyLeafletCanvas.tsx must render multi-vertex sea-route detour curves (leg.pathPositions, Option A)',
);
assert(
  routeCalcTsx.includes('300변침점·378실측해안선 우회') &&
    !routeCalcTsx.includes('35변침점·20섬 우회') &&
    !routeCalcTsx.includes('56변침점·67해안장벽 우회'),
  'RouteTimeCalculator.tsx: provenance badge must display 300변침점·378실측해안선 우회',
);
assert(
  routeCalcTsx.includes('if (isCollapsed)') &&
    routeCalcTsx.includes('전체 예상 소요시간') &&
    !routeCalcTsx.includes('RotateCcw'),
  'RouteTimeCalculator.tsx: must render compact summary card when isCollapsed and prevent Row 1 toolbar overflow (UI-BUG-01..04)',
);

// 6. public/backup 레거시 백업 폴더 클린 확인 (public/dev는 개발·디자인 레퍼런스 보관용으로 보존하되 SW 프리캐시에서 제외)
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

// 7. Google EGM (Elephant-Goldfish Model) 아키텍처 계약 · 문서-코드 드리프트 · 마크다운 상대경로 링크 무결성 검증
const readmeMd = fs.readFileSync('README.md', 'utf8');
const dataSourcesMd = fs.readFileSync('docs/DATA_AND_TECH_SOURCES.md', 'utf8');
const dataSourcesTs = fs.readFileSync('src/config/dataSources.ts', 'utf8');

assert(
  readmeMd.includes(`[${displayMatch[1]}]`) && readmeMd.includes(`(${displayMatch[1]})`),
  `README.md must reference current APP_VERSION_DISPLAY (${displayMatch[1]})`,
);
assert(
  dataSourcesMd.includes(displayMatch[1]),
  `docs/DATA_AND_TECH_SOURCES.md must reference current APP_VERSION_DISPLAY (${displayMatch[1]})`,
);
assert(
  deployGuideMd.includes('변침점 300개소') && !deployGuideMd.includes('변침점 35개소'),
  'DEPLOY_GUIDE.md must reference 변침점 300개소 (no legacy 변침점 35개소)',
);
assert(
  !dataSourcesTs.includes('docs/SOURCE_CREDIBILITY_UX_DESIGN.md'),
  'src/config/dataSources.ts must not reference removed docs/SOURCE_CREDIBILITY_UX_DESIGN.md',
);

assert(
  !fs.existsSync('docs/ROUTE_PORT_SELECTION_UX_PROPOSAL.md'),
  'Temporary proposal docs/ROUTE_PORT_SELECTION_UX_PROPOSAL.md must be merged and removed',
);

const egmRequiredFiles = [
  'AGENTS.md',
  '_agents/skills/bada-kkomkkomi-elephant/SKILL.md',
  'docs/designs/SITEMAP.md',
];
for (const egmFile of egmRequiredFiles) {
  assert(fs.existsSync(egmFile), `Required EGM file is missing: ${egmFile}`);
}

const agentsMd = fs.readFileSync('AGENTS.md', 'utf8');
const sitemapMd = fs.readFileSync('docs/designs/SITEMAP.md', 'utf8');
for (const requiredSection of [
  'EGM artifact directory: .dev/docs',
  '## System Overview',
  '## Subdirectories & System Boundaries',
  '## Global Invariants',
  '## Global Side Effects',
  '## System Verification',
]) {
  assert(
    agentsMd.includes(requiredSection),
    `AGENTS.md must contain EGM Hay section: ${requiredSection}`,
  );
}

for (const dir of ['src/services', 'src/hooks']) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    assert(
      readmeMd.includes(file),
      `README.md directory tree is missing ${dir}/${file}`,
    );
    assert(
      sitemapMd.includes(file),
      `docs/designs/SITEMAP.md contract index is missing ${dir}/${file}`,
    );
  }
}

const markdownDocsToVerify = [
  'README.md',
  'AGENTS.md',
  'DEPLOY_GUIDE.md',
  'docs/ARCHITECTURE_AND_DESIGN.md',
  'docs/DATA_AND_TECH_SOURCES.md',
  'docs/ROUTE_BERTHING_UX_ANALYSIS_REPORT.md',
  'docs/designs/SITEMAP.md',
];
const mdLinkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
for (const docPath of markdownDocsToVerify) {
  const content = fs.readFileSync(docPath, 'utf8');
  const docDir = path.dirname(docPath);
  for (const match of content.matchAll(mdLinkRegex)) {
    const rawTarget = match[1].trim().split('#')[0];
    if (
      !rawTarget ||
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('file://') ||
      rawTarget.startsWith('conversation://')
    ) {
      continue;
    }
    const resolvedPath = path.resolve(docDir, rawTarget);
    assert(
      fs.existsSync(resolvedPath),
      `Broken relative markdown link in ${docPath}: (${match[1]}) -> ${resolvedPath} does not exist`,
    );
  }
}

console.log(
  `[Verify OK] Version ${pkg.version} (${displayMatch[1]}) | Docking: ${dockingFc.features.length} | Ports: ${portsData.ports.length} | Waypoints: ${portsData.waypoints.length} | EGM Contracts: OK | SW Precache: ${swPrecacheCount || 'pre-build'} | Legacy Bloat: 0`,
);
