import type { Feature, FeatureCollection, Point } from 'geojson';

/**
 * 5가지 커스텀 마커 색상 규격
 * - red: 고위험 / 암초·폐로프 주의 (특수 주의 접안지)
 * - amber: 조석·부표줄·슬립웨이 주의 (조건부 접안지)
 * - green: 상시 안전 접안 (부잔교·폰툰 완비)
 * - blue: 관공선·중형 작업선 전용부두
 * - purple: 임시 조사·긴급 대피 포인트
 */
export type MarkerColor = 'red' | 'amber' | 'green' | 'blue' | 'purple';

export interface DockingPointProperties {
  id: string;
  name: string;
  purpose: string;
  tide_info: string;
  hazard: string;
  color: MarkerColor;
  verified_date: string;
  photos: string[];
}

export type DockingFeature = Feature<Point, DockingPointProperties>;

export interface DockingFeatureCollection extends FeatureCollection<Point, DockingPointProperties> {
  metadata?: {
    version?: string;
    region?: string;
    updated_at?: string;
    operator_note?: string;
  };
}

export interface MarkerColorTheme {
  key: MarkerColor;
  label: string;
  shortLabel: string;
  hex: string;
  ringHex: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  description: string;
}

export const MARKER_COLOR_MAP: Record<MarkerColor, MarkerColorTheme> = {
  red: {
    key: 'red',
    label: '위험·암초 주의',
    shortLabel: '위험주의',
    hex: '#ef4444',
    ringHex: '#fca5a5',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-300',
    borderClass: 'border-red-500/60',
    description: '수중 암초·폐로프 등 고위험 요소 존재',
  },
  amber: {
    key: 'amber',
    label: '조석·항로 주의',
    shortLabel: '조석주의',
    hex: '#f59e0b',
    ringHex: '#fcd34d',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    borderClass: 'border-amber-500/60',
    description: '간조 수심·청태·양식장 부표줄 주의',
  },
  green: {
    key: 'green',
    label: '상시 안전 접안',
    shortLabel: '안전접안',
    hex: '#10b981',
    ringHex: '#6ee7b7',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    borderClass: 'border-emerald-500/60',
    description: '부잔교(폰툰) 등 조석 무관 안전 접안',
  },
  blue: {
    key: 'blue',
    label: '관공선·전용부두',
    shortLabel: '전용부두',
    hex: '#0ea5e9',
    ringHex: '#7dd3fc',
    badgeBg: 'bg-sky-500/20',
    badgeText: 'text-sky-300',
    borderClass: 'border-sky-500/60',
    description: '중형 조사선·크레인 작업 가능 부두',
  },
  purple: {
    key: 'purple',
    label: '임시·비상 포인트',
    shortLabel: '비상거점',
    hex: '#a855f7',
    ringHex: '#d8b4fe',
    badgeBg: 'bg-purple-500/20',
    badgeText: 'text-purple-300',
    borderClass: 'border-purple-500/60',
    description: '기상 악화 시 긴급 대피 또는 임시 계류',
  },
};

export const ALL_MARKER_COLORS: MarkerColor[] = ['red', 'amber', 'green', 'blue', 'purple'];

/**
 * 초기 기본 표시 등급 ('red': 위험·암초 주의) 제외한 부가 선택 등급 목록
 */
export const SECONDARY_MARKER_COLORS: MarkerColor[] = ['amber', 'green', 'blue', 'purple'];

/**
 * 해상 안전 의사결정 기준 마커/카드 정렬 우선순위 (낮을수록 최우선 노출)
 */
export const MARKER_PRIORITY_ORDER: Record<MarkerColor, number> = {
  red: 0,
  amber: 1,
  green: 2,
  blue: 3,
  purple: 4,
};

