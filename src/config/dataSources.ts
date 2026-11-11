/**
 * 바다꼼꼬미 (Bada-Kkomkkomi) 외부 데이터 · API · 지도 · 자체 알고리즘 출처 단일 정본 (SSOT)
 * - 정본 문서: docs/DATA_AND_TECH_SOURCES.md & docs/ARCHITECTURE_AND_DESIGN.md
 * - 활용처: WeatherThresholdSettings(출처 센터), HomeScreen, DockingDetailSheet, PhotoGallery,
 *          RouteTimeCalculator, MarineWeatherPanel, LayerControlModal, MapView, PortSelectModal
 */

export type SourceCategoryKey =
  | 'ports_docking'
  | 'marine_weather'
  | 'map_gis'
  | 'route_algorithm'
  | 'qgis_parser'
  | 'brand_ui';

export type SourceGovernanceType =
  | 'public_official'
  | 'global_open_api'
  | 'inhouse_algorithm'
  | 'public_design_oss';

export type SourceOperationMode =
  | 'offline_embedded'
  | 'online_realtime'
  | 'hybrid_fallback';

export interface DataSourceItem {
  id: SourceCategoryKey;
  badgeLabel: string;
  governanceLabel: string;
  governanceType: SourceGovernanceType;
  title: string;
  providerSummary: string;
  operationMode: SourceOperationMode;
  operationModeLabel: string;
  keyPoints: readonly string[];
  plainExplanation: string;
  faqQuestion: string;
  faqAnswer: string;
  technicalSpecs: readonly string[];
  cautionNote?: string;
}

export interface OfflineCapabilityRow {
  featureName: string;
  isOfflineGuaranteed: boolean;
  statusBadge: string;
  detail: string;
}

/**
 * 해상 음영지역(오프라인) 동작 보장 매트릭스 (CS 오해 방지용 · 1줄 핵심 요약)
 */
export const OFFLINE_CAPABILITY_MATRIX: readonly OfflineCapabilityRow[] = [
  {
    featureName: '55개 접안지 · 136개 항포구 · 공원경계',
    isOfflineGuaranteed: true,
    statusBadge: '🟢 100% 오프라인',
    detail: '앱 설치 시 정적 데이터·모식도가 기기에 내장되어 통신 없이 즉시 열람',
  },
  {
    featureName: '바닷길(A*) 계산 · 초성 검색 · 상괭이 기록',
    isOfflineGuaranteed: true,
    statusBadge: '🟢 100% 오프라인',
    detail: '스마트폰 자체 연산 및 기기 내부 저장소(IndexedDB/localStorage) 직접 처리',
  },
  {
    featureName: 'QGIS 파일(.gpkg/.shp) · 한국 좌표계 변환',
    isOfflineGuaranteed: true,
    statusBadge: '🟢 100% 오프라인',
    detail: '브라우저 내장 파서(proj4)로 기기 안에서만 변환 (외부 서버 전송 0건)',
  },
  {
    featureName: '배경 지도 타일 (카카오맵 · 위성 · 3D 로드뷰)',
    isOfflineGuaranteed: false,
    statusBadge: '🔵 온라인 (열람 해역만 캐시)',
    detail: '열어본 해역 타일은 30일간 캐시되나 미방문 해역·3D 로드뷰는 통신 필요',
  },
  {
    featureName: '실시간 해상 기상 예보 (ECMWF 풍속 · 파고)',
    isOfflineGuaranteed: false,
    statusBadge: '🔵 실시간 전용 (캐시 배제)',
    detail: '해상 안전을 위해 오프라인 시 과거 예보를 숨기고 즉시 "미확인(?)" 표시',
  },
] as const;

/**
 * 6대 핵심 데이터 · API · 지도 · 기술 출처 레지스트리 (요점·가독성 최적화)
 */
export const DATA_SOURCE_REGISTRY: readonly DataSourceItem[] = [
  {
    id: 'ports_docking',
    badgeLabel: '항포구 · 접안지 · 공원경계',
    governanceLabel: '공공 고시 · 현장 실측',
    governanceType: 'public_official',
    title: '통영·거제 136개 항포구 · 55개 접안지 · 국립공원 구역',
    providerSummary: '국립해양조사원(KHOA) · 지자체 어항고시 · 환경부/국립공원공단(KNPS)',
    operationMode: 'offline_embedded',
    operationModeLabel: '🟢 앱 내장 (100% 오프라인)',
    keyPoints: [
      '⚓ 136개 항포구 · 55개 접안지',
      '📐 자체 제작 SVG 수심 모식도',
      '📴 바다 위 100% 오프라인 열람',
    ],
    plainExplanation:
      '해상 통신이 끊겨도 즉시 확인할 수 있도록 어항(81곳)·소규모 선착장(50곳)·조사선 거점(5곳)과 공원 경계를 앱에 내장했습니다.',
    faqQuestion: '상세창에 실제 사진 대신 컴퓨터 그림(SVG)이 있는 이유는?',
    faqAnswer:
      '오프라인 즉시 열람과 만조·간조 수심·암초 위치를 한눈에 보여주려 자체 제작한 "현장 모식도"이며, 실사 사진(.jpg/.png) 등록 시 즉시 교체됩니다.',
    technicalSpecs: [
      '해양수산부 국립해양조사원(KHOA) 기본수준면(DL) 수심·해안선(138섬) 및 기상청(KMA) 해역 기준',
      '경상남도·통영시·거제시 어항 고시 및 현장 옛 지명·별칭(강구안, 원항, 제승당항 등) 통합',
      '환경부·국립공원공단 공식 QGIS 특별보호구역 20개소 정밀 폴리곤(EPSG:5181→EPSG:4326) 및 공원 경계 내장 (QGIS 원본 .gpkg/.shp 업로드 시 즉시 추가·교체)',
    ],
  },
  {
    id: 'marine_weather',
    badgeLabel: '실시간 해상 기상',
    governanceLabel: '글로벌 수치모델 오픈 API',
    governanceType: 'global_open_api',
    title: '48시간 해상 풍속(kn) · 유의파고(m) 3단계 판정',
    providerSummary: '유럽중기예보센터(ECMWF IFS·WAM 9km) + Open-Meteo 오픈 API',
    operationMode: 'online_realtime',
    operationModeLabel: '🔵 실시간 전용 (과거 캐시 배제)',
    keyPoints: [
      '🌍 ECMWF 9km 고해상도 모델',
      '⏱️ 48시간 KST 시각 키 1:1 정합',
      '🛡️ 결측·오프라인 시 미확인(?) 처리',
    ],
    plainExplanation:
      '세계적으로 공인된 유럽중기예보센터(ECMWF)의 고해상도 바람(IFS)·파고(WAM) 수치예보를 Open-Meteo API로 실시간 조회합니다.',
    faqQuestion: '기상청 예보와 수치가 조금 다르거나 "미확인(?)"으로 뜨는 이유는?',
    faqAnswer:
      'ECMWF 9km 광역 격자 모델을 단일 고정 호출하므로 국지 예보와 미세한 차이가 있을 수 있으며, 통신 단절·결측 시 안전을 위해 과거 캐시 대신 "미확인(?)"을 표시합니다.',
    technicalSpecs: [
      '해상 10m 풍속: ECMWF IFS HRES (약 9km 격자, knots 단위 고정)',
      '유의파고: ECMWF WAM 해양 파랑 모델 (약 9km 격자, m 단위 고정)',
      '시각 정합: 배열 인덱스가 아닌 한국 표준시(Asia/Seoul) 타임스탬프 Map 1:1 매칭',
    ],
    cautionNote:
      '9km×9km 바다 격자 예보이므로 섬 뒤편·방파제 안쪽의 국지 돌풍·너울은 현장과 다를 수 있습니다. 출항 전 기상청(KMA) 공식 해상특보를 함께 확인하세요.',
  },
  {
    id: 'map_gis',
    badgeLabel: '배경 지도 · 위성 · 3D 로드뷰',
    governanceLabel: '국내 공인 지도 & 자동 폴백',
    governanceType: 'global_open_api',
    title: '해양 배경 지도 · 위성 항공사진 · 360° 3D 현장뷰',
    providerSummary: '카카오맵(국토지리정보원 NGII 기반) 주력 + 오픈스트리트맵(OSM) 폴백',
    operationMode: 'hybrid_fallback',
    operationModeLabel: '🔵 온라인 로드 + 열람 해역 캐시 · 폴백',
    keyPoints: [
      '🗺️ 국토지리정보원(NGII) 위성·지형',
      '🔄 6.5초 장애 시 OSM 자동 전환',
      '👁️ 360° 3D 현장 로드뷰 내장',
    ],
    plainExplanation:
      '국내 섬 지명·항공사진이 가장 정확한 카카오맵을 기본 사용하며, 통신·도메인 제한 시 오픈스트리트맵(OSM)으로 자동 전환됩니다.',
    faqQuestion: '카카오맵 연결이 제한된 환경에서도 지도와 접안지를 볼 수 있나요?',
    faqAnswer:
      '네. 카카오맵 SDK 응답이 지연되면 6.5초 내 OpenStreetMap + Leaflet 엔진으로 자동 전환되며, 55개 접안지와 항로선은 100% 동일하게 표시됩니다.',
    technicalSpecs: [
      '주력 엔진: Kakao Maps Web SDK v3 (일반지도·스카이뷰·하이브리드·지형도·지적편집도·3D 로드뷰)',
      '국내 항공사진·수치지형도 원천: 국토교통부 국토지리정보원(NGII) 및 카카오 공간정보',
      '비상 보조 엔진: OpenStreetMap(ODbL) 타일 + Leaflet 1.9.4 / 제보 링크: 네이버·구글 지도 표준 URL',
    ],
  },
  {
    id: 'route_algorithm',
    badgeLabel: '바닷길 항로 · 초성 검색',
    governanceLabel: '자체 개발 수학·기하 알고리즘',
    governanceType: 'inhouse_algorithm',
    title: '육지·섬 우회 바닷길 계산 및 한글 초성 검색 엔진',
    providerSummary: '외부 유료 API 없이 앱에 자체 구현한 2계층 하이브리드 A*·가시성 그래프(Visibility Graph·Theta*) 해상 탐색 엔진',
    operationMode: 'offline_embedded',
    operationModeLabel: '🟢 기기 자체 연산 (100% 오프라인)',
    keyPoints: [
      '🧭 300개 변침점 · 378개 실측해안선 우회 A*',
      '✅ 18,360개 전 항로 육지 비관통 검증',
      '🔤 무서버 한글 초성 즉시 검색',
    ],
    plainExplanation:
      '바다 길을 못 찾는 자동차 내비 API나 섬을 관통하는 직선 계산 대신, OpenStreetMap 실측 해안선 폴리곤 378개(12,794정점)를 피해 300개 해상 변침점과 C-Space 가시성 그래프로 우회하는 2계층 하이브리드 A* 엔진을 자체 개발했습니다.',
    faqQuestion: '바닷길 시간계산기는 어떤 원리로 섬을 피해 거리·도착시간을 계산하나요?',
    faqAnswer:
      '378개 본토·유무인도 실측 해안선 폴리곤(12,794정점)과 이중 공간 인덱스(Spatial Grid + Latitude Slab)를 코드에 내장하고, 출항지 외측 진입점부터 300개 변침점 그래프와 C-Space 가시성 그래프(Theta*)를 결합해 육지를 관통하지 않는 최단 항로를 1ms 미만에 계산합니다.',
    technicalSpecs: [
      '2계층 하이브리드 A* 탐색: 378개 실측 해안선 폴리곤(12,794정점) 대비 136개 항포구 전체 쌍(18,360쌍) 전수 시뮬레이션 및 육지 비관통(0건) 검증 통과',
      'Theta* String-Pulling & C-Space 가시성 우회: 외향 법선(Outward Normal) 오프셋 정점 가시성 탐색 및 양단 역주행(U턴) 자동 제거',
      '거리·침로·중점: 지구 곡면 Haversine 대권거리(1NM=1.852km), 구면 삼각법 침로(0~359°), 호장 50% 진중점',
      '한글 초성 검색: 유니코드 음절 분해 수식 자체 구현 (예: ㅅㄷㅎ → 삼덕항 즉시 검색)',
    ],
    cautionNote:
      '선속·수로 변침점 기반 참고용 추정치이며, 조류·풍랑·흘수에 따른 공식 전자해도(ECDIS) 및 선장의 현장 판단을 대체하지 않습니다.',
  },
  {
    id: 'qgis_parser',
    badgeLabel: 'QGIS 파일 · 한국 좌표계 변환',
    governanceLabel: '국제 GIS 규격 & 무서버 로컬 처리',
    governanceType: 'inhouse_algorithm',
    title: '무변환 QGIS 공간파일(.gpkg/.shp) 파서 및 국가좌표계 변환',
    providerSummary: 'OGC/ESRI 공개 규격 자체 파서 + proj4(국가좌표계) + 기기 로컬 보관',
    operationMode: 'offline_embedded',
    operationModeLabel: '🟢 브라우저 직접 처리 (외부 전송 0건)',
    keyPoints: [
      '📂 .gpkg · .shp · .kml 즉시 해독',
      '🌐 한국 좌표계(EPSG:5179/5186) 자동 변환',
      '🔒 외부 서버 전송 0건 (기기 내부 보관)',
    ],
    plainExplanation:
      'QGIS 공간파일을 별도 변환 프로그램이나 외부 서버 업로드 없이 브라우저 안에서 즉시 해독하고, 깨진 한글(CP949)과 한국 공공 좌표계를 자동 변환합니다.',
    faqQuestion: '업로드한 기관 내부 QGIS 파일이나 상괭이 기록이 외부 서버로 유출되지 않나요?',
    faqAnswer:
      '절대 외부로 전송되지 않습니다. 파싱·좌표 변환은 100% 기기 메모리 안에서만 처리되며 기기 내부(IndexedDB/localStorage)에만 보관됩니다.',
    technicalSpecs: [
      '지원 포맷: OGC GeoPackage(.gpkg SQLite3), ESRI Shapefile(.zip/.shp/.dbf/.prj), KML/KMZ, GeoJSON',
      '국가좌표계 자동 변환(proj4): EPSG:5179(UTM-K), 5186(중부), 5187(동부), 5174(베셀) → EPSG:4326(WGS84)',
      '한글 인코딩 복원: 웹 표준 TextDecoder("euc-kr")로 관공서 DBF의 CP949 한글 깨짐 자동 복원',
    ],
  },
  {
    id: 'brand_ui',
    badgeLabel: '브랜드 디자인 · 캐릭터 · 오픈소스',
    governanceLabel: '공공기관 공식 디자인 & 오픈소스',
    governanceType: 'public_design_oss',
    title: '국립공원공단 공식 브랜드 · 깃대종 색채 · 웹 표준 기술',
    providerSummary: '국립공원공단 CI · 한려해상 팔색조(NPIP AS 920) · 디지털정부 KRDS · MIT 오픈소스',
    operationMode: 'offline_embedded',
    operationModeLabel: '🟢 공공 디자인 표준 & 무료 오픈소스',
    keyPoints: [
      '🐻 국립공원 반달이 & 해양레인저 꼬미',
      '🎨 한려해상 팔색조(NPIP AS 920) 10색',
      '☀️ 선박 갑판 주간 고대비(KRDS·WCAG AA)',
    ],
    plainExplanation:
      '햇빛이 강한 바다 위 갑판에서도 선명하게 보이도록 국립공원공단 상징색과 한려해상 깃대종(팔색조) 색채 표준, 디지털정부 UI/UX 가이드라인을 적용했습니다.',
    faqQuestion: '앱의 밝은 바다색 테마와 캐릭터는 어디서 가져온 것인가요?',
    faqAnswer:
      '국립공원공단 공식 마스코트(반달이·꼬미)와 한려해상 깃대종 팔색조("알로", NPIP AS 920) 정품 컬러 팔레트를 행정안전부 디지털정부 가이드라인(KRDS)에 맞춰 설계했습니다.',
    technicalSpecs: [
      '색채 표준: 국립공원공단(KNPS) 공식 CI 3원색 + 한려해상 팔색조(NPIP AS 920) 정품 컬러 토큰(#003360, #00846C, #00A79D, #F7F4EE, #870B41)',
      '접근성 표준: 행정안전부 디지털정부 UI/UX 가이드라인(KRDS) 및 W3C WCAG 2.2 AA 명도 대비·터치 타겟(44~48px+) 준수',
      '오픈소스: React 19, Vite 8, TypeScript 7, Tailwind CSS 4, Leaflet 1.9, proj4, fflate, Lucide, Workbox (전수 무료 오픈소스)',
    ],
  },
] as const;

export interface PhotoAssetClassification {
  kind: 'diagram_svg' | 'field_photo';
  isVectorDiagram: boolean;
  badgeText: string;
  shortLabel: string;
}

/**
 * 접안지 이미지 경로(.svg vs .jpg/.png/.webp)를 분석하여
 * 자체 제작 현장 모식도(다이어그램)인지 실제 촬영 사진인지 정확히 판별하는 순수 함수 (RC-SRC-03)
 */
export function classifyDockingPhotoAsset(rawUrl: string): PhotoAssetClassification {
  const clean = (rawUrl || '').trim().split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.svg')) {
    return {
      kind: 'diagram_svg',
      isVectorDiagram: true,
      badgeText: '📐 현장 이해용 모식도 (수심·위험 도해)',
      shortLabel: '현장 모식도',
    };
  }
  return {
    kind: 'field_photo',
    isVectorDiagram: false,
    badgeText: '📷 현장 실사 사진',
    shortLabel: '실사 사진',
  };
}

export interface PhotoCollectionSummary {
  totalCount: number;
  diagramCount: number;
  realPhotoCount: number;
  sectionTitle: string;
  hasVectorDiagram: boolean;
}

/**
 * 사진 배열 전체를 분석하여 PhotoGallery 섹션 헤더 제목과 모식도 포함 여부를 반환하는 순수 함수
 */
export function summarizePhotoCollection(
  photos: readonly string[],
): PhotoCollectionSummary {
  let diagramCount = 0;
  let realPhotoCount = 0;
  for (const p of photos) {
    if (classifyDockingPhotoAsset(p).isVectorDiagram) {
      diagramCount++;
    } else {
      realPhotoCount++;
    }
  }

  let sectionTitle = '현장 접안 사진';
  if (diagramCount > 0 && realPhotoCount === 0) {
    sectionTitle = '현장 접안 모식도 (수심·위험 도해)';
  } else if (diagramCount > 0 && realPhotoCount > 0) {
    sectionTitle = '현장 접안 사진 · 모식도';
  }

  return {
    totalCount: photos.length,
    diagramCount,
    realPhotoCount,
    sectionTitle,
    hasVectorDiagram: diagramCount > 0,
  };
}

export interface LayerProvenanceMeta {
  badgeLabel: string;
  sourceDetail: string;
  isBuiltInSchematic: boolean;
}

/**
 * 공간정보 레이어의 ID 및 속성을 기반으로 데이터 출처와 성격을 반환하는 순수 함수 (RC-SRC-05)
 */
export function resolveLayerProvenance(layer: {
  id: string;
  isSystemLayer?: boolean;
  url?: string;
}): LayerProvenanceMeta {
  if (layer.id === 'docking' || layer.isSystemLayer) {
    return {
      badgeLabel: '공단 현장점검 · KHOA 기준 (55개소)',
      sourceDetail:
        '국립공원공단 현장 실측·점검 데이터 및 국립해양조사원·지자체 어항 기준 통합 내장본',
      isBuiltInSchematic: false,
    };
  }
  if (layer.id === 'protected_area') {
    return {
      badgeLabel: '국립공원공단 QGIS 정본 내장본 (20개소)',
      sourceDetail:
        '한려해상국립공원 특별보호구역 20개소(한동-01~09, 한려-01~11) QGIS 원본 Shapefile(EPSG:5181 → WGS84) 정밀 컴파일 내장본입니다.',
      isBuiltInSchematic: false,
    };
  }
  if (layer.id === 'national_park') {
    return {
      badgeLabel: '환경부·공단 경량 도식화 내장본 (QGIS 업데이트 슬롯)',
      sourceDetail:
        '공원구역 QGIS 원본(.gpkg/.shp)을 [+ 파일 등록]에서 업로드하거나 배포 시 즉시 정밀 반영되는 슬롯입니다.',
      isBuiltInSchematic: true,
    };
  }
  return {
    badgeLabel: '사용자 직접 등록 (기기 로컬 · 외부 미전송)',
    sourceDetail:
      '브라우저에서 직접 변환되어 현재 기기(IndexedDB)에만 안전하게 보관된 운영 레이어입니다.',
    isBuiltInSchematic: false,
  };
}

/**
 * 대외 보고 및 문의 공유용 출처·버전 요약 클립보드 텍스트 생성 순수 함수
 */
export function buildSourceCitationCopyText(appVersionDisplay: string): string {
  return [
    `[바다꼼꼬미 ${appVersionDisplay} 데이터 · API · 지도 · 기술 출처 요약]`,
    `1. 항포구·접안지(136개소/55개소): 해양수산부 국립해양조사원(KHOA) 수로·해안선 기준 + 지자체 어항고시 + 국립공원공단 현장 점검 데이터 (100% 오프라인 내장)`,
    `2. 실시간 해상기상(풍속·파고): 유럽중기예보센터(ECMWF IFS 9km / WAM 9km) 수치예보 모델 + Open-Meteo 무료 오픈 API (결측·오프라인 시 미확인 '?' 안전 처리)`,
    `3. 배경 지도·위성·3D 로드뷰: 카카오맵 Web SDK v3 (국토교통부 국토지리정보원 항공·수치지도 기반) + OpenStreetMap/Leaflet 비상 자동 폴백`,
    `4. 바닷길 실항로 계산·초성 검색: 통영·거제 300개 해상 변침점 및 378개 실측 해안선 폴리곤(12,794정점) 우회 2계층 하이브리드 A*·가시성 그래프 알고리즘 (외부 유료 API 미사용 · 오프라인 기기 연산)`,
    `5. QGIS 공간파일 변환: OGC GeoPackage(.gpkg)/Shapefile(.shp) 자체 파서 + 국토지리정보원 국가좌표계(proj4 EPSG:5179/5186) + CP949 한글 복원 (외부 서버 전송 0건)`,
    `6. 브랜드·UI 표준: 국립공원공단 공식 CI·캐릭터(반달이·꼬미) + 한려해상 깃대종 팔색조(NPIP AS 920) + 행정안전부 디지털정부 UI/UX 가이드라인(KRDS)`,
  ].join('\n');
}
