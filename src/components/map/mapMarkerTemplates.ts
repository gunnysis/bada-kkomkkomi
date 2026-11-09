import type { MarkerColor } from '../../types/docking';
import { MARKER_COLOR_MAP } from '../../types/docking';
import type { MarinePort } from '../../types/port';

export interface MarkerTemplateSpec {
  html: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  /** Kakao CustomOverlay용 0~1 비율 앵커 */
  xAnchorRatio: number;
  yAnchorRatio: number;
}

/**
 * 정적/동적 JSON 데이터의 문자열을 HTML 템플릿에 삽입할 때 XSS 및 태그 깨짐을 방지하는 중앙 이스케이프 헬퍼
 * (docs/intro_hub_ux_proposal.md P1 보안 명세 반영)
 */
export function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 1. 커스텀 접안 마커 (5색)
 */
export function buildDockingMarkerSpec(
  color: MarkerColor,
  pointCode: string,
  isSelected: boolean,
): MarkerTemplateSpec {
  const safeCode = escapeHtml(pointCode);
  const theme = MARKER_COLOR_MAP[color] ?? MARKER_COLOR_MAP.blue;
  const scaleStyle = isSelected ? 'transform: scale(1.16);' : '';
  const selectedHalo = isSelected
    ? `<circle cx="26" cy="22" r="21" fill="none" stroke="${theme.ringHex}" stroke-width="3.5" stroke-dasharray="5 3" />`
    : '';

  const html = `
    <div class="bada-marker-hit-target" style="${scaleStyle}">
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          margin-bottom: 2px;
          padding: 1px 6px;
          border-radius: 6px;
          background: #020617;
          border: 1.5px solid ${isSelected ? '#ffffff' : theme.hex};
          color: #f8fafc;
          font-size: 10px;
          font-weight: 900;
          line-height: 1.2;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.65);
        ">${safeCode}</div>
        <svg width="44" height="44" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.65));">
          ${selectedHalo}
          <path d="M26 4C16.611 4 9 11.611 9 21C9 33.25 26 48 26 48C26 48 43 33.25 43 21C43 11.611 35.389 4 26 4Z" fill="${theme.hex}" stroke="#ffffff" stroke-width="3" />
          <circle cx="26" cy="21" r="7.5" fill="#0b192c" stroke="#ffffff" stroke-width="2" />
          <circle cx="26" cy="21" r="3.2" fill="#ffffff" />
        </svg>
      </div>
    </div>
  `;

  return {
    html,
    width: 52,
    height: 58,
    anchorX: 26,
    anchorY: 54,
    xAnchorRatio: 0.5,
    yAnchorRatio: 54 / 58,
  };
}

/**
 * 1-B. 바닷길 콕콕용 항포구 / 소규모 선착장 마커 아이콘
 * (확대 시 이름 라벨 표시, 축소 시 깔끔한 도트)
 */
export function buildNavPortPinSpec(
  port: MarinePort,
  showLabel: boolean,
): MarkerTemplateSpec {
  const isSmallBerth = port.subCategory === 'small_berth' || port.category === 'docking';
  const rawShortName = port.name.length > 8 ? `${port.name.slice(0, 8)}…` : port.name;
  const shortName = escapeHtml(rawShortName);
  const safeTitle = escapeHtml(port.name);
  const color = isSmallBerth ? '#f59e0b' : '#38bdf8';
  const bg = isSmallBerth ? '#451a03' : '#082f49';

  if (!showLabel) {
    const dotHtml = `
      <div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; cursor: pointer;" title="${safeTitle}">
        <div style="
          width: 11px;
          height: 11px;
          border-radius: 9999px;
          background: ${bg};
          border: 2px solid ${color};
          box-shadow: 0 1px 4px rgba(0,0,0,0.8);
        "></div>
      </div>
    `;
    return {
      html: dotHtml,
      width: 22,
      height: 22,
      anchorX: 11,
      anchorY: 11,
      xAnchorRatio: 0.5,
      yAnchorRatio: 0.5,
    };
  }

  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
      <div style="
        padding: 1px 5px;
        border-radius: 5px;
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid ${color};
        color: #f8fafc;
        font-size: 9px;
        font-weight: 800;
        white-space: nowrap;
        margin-bottom: 2px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.65);
      ">${shortName}</div>
      <div style="
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        background: ${bg};
        border: 2.5px solid ${color};
        box-shadow: 0 2px 6px rgba(0,0,0,0.75);
      "></div>
    </div>
  `;

  return {
    html,
    width: 44,
    height: 32,
    anchorX: 22,
    anchorY: 26,
    xAnchorRatio: 0.5,
    yAnchorRatio: 26 / 32,
  };
}

/**
 * 2. 상괭이 관찰 마커
 */
export function buildPorpoiseSpec(count: number): MarkerTemplateSpec {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.round(count)) : 1;
  const html = `
    <div class="bada-marker-hit-target" style="cursor: pointer;">
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          margin-bottom: 2px;
          padding: 1px 6px;
          border-radius: 9999px;
          background: #0d9488;
          border: 1.5px solid #99f6e4;
          color: #ffffff;
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.55);
        ">상괭이 ${safeCount}마리</div>
        <div style="
          width: 38px;
          height: 38px;
          border-radius: 9999px;
          background: #14b8a6;
          border: 3px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.6);
        ">🐬</div>
      </div>
    </div>
  `;
  return {
    html,
    width: 48,
    height: 54,
    anchorX: 24,
    anchorY: 48,
    xAnchorRatio: 0.5,
    yAnchorRatio: 48 / 54,
  };
}

/**
 * 3. 항해 경로 드래그 마커 (출발 🟢 / 경유 🟡 / 도착 🔴)
 */
export function buildRouteWaypointSpec(
  type: 'start' | 'waypoint' | 'end',
  label: string,
  orderIdx: number,
): MarkerTemplateSpec {
  const rawShortLabel = label.length > 12 ? `${label.slice(0, 12)}…` : label;
  const shortLabel = escapeHtml(rawShortLabel);
  const bg =
    type === 'start' ? '#10b981' : type === 'waypoint' ? '#f59e0b' : '#ef4444';
  const roleTag =
    type === 'start' ? '출발' : type === 'end' ? '도착' : `경유${orderIdx}`;
  const html = `
    <div class="bada-draggable-overlay" style="display: flex; flex-direction: column; align-items: center; cursor: grab;">
      <div style="
        padding: 2px 7px;
        border-radius: 7px;
        background: #020617;
        border: 2px solid ${bg};
        color: #ffffff;
        font-size: 10px;
        font-weight: 900;
        margin-bottom: 3px;
        white-space: nowrap;
        box-shadow: 0 3px 8px rgba(0,0,0,0.75);
      ">[${roleTag}] ${shortLabel}</div>
      <div style="
        width: 38px;
        height: 38px;
        border-radius: 9999px;
        background: ${bg};
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 900;
        color: #020617;
      ">${type === 'start' ? '출' : type === 'end' ? '착' : orderIdx}</div>
    </div>
  `;
  return {
    html,
    width: 56,
    height: 56,
    anchorX: 28,
    anchorY: 50,
    xAnchorRatio: 0.5,
    yAnchorRatio: 50 / 56,
  };
}

/**
 * 4. 구간 선 위 예상 소요시간(분) & 방위각 배지
 */
export function buildRouteLegBadgeSpec(
  durationMinutes: number,
  distanceNm: number,
  bearingDeg: number,
  cardinal: string,
): MarkerTemplateSpec {
  const mins = Math.round(durationMinutes);
  const nmStr = distanceNm.toFixed(1);
  const safeCardinal = escapeHtml(cardinal);
  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    ">
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        border-radius: 9999px;
        background: rgba(2, 6, 23, 0.92);
        border: 2px solid #38bdf8;
        color: #f8fafc;
        font-size: 11px;
        font-weight: 900;
        white-space: nowrap;
        box-shadow: 0 3px 10px rgba(0,0,0,0.75);
      ">
        <span style="color: #fbbf24; font-size: 12px;">${mins}분</span>
        <span style="color: #94a3b8;">·</span>
        <span style="color: #bae6fd;">${nmStr}NM</span>
        <span style="color: #64748b; font-size: 10px;">(${bearingDeg}°${safeCardinal})</span>
      </div>
    </div>
  `;
  return {
    html,
    width: 140,
    height: 28,
    anchorX: 70,
    anchorY: 14,
    xAnchorRatio: 0.5,
    yAnchorRatio: 0.5,
  };
}
/**
 * 5. 해상기상 상태 3단계 신호등 마커
 */
export function buildWeatherPinSpec(
  grade: 'good' | 'moderate' | 'bad' | 'unknown',
): MarkerTemplateSpec {
  const color =
    grade === 'good'
      ? '#10b981'
      : grade === 'moderate'
        ? '#94a3b8'
        : grade === 'bad'
          ? '#ef4444'
          : '#475569';
  const label =
    grade === 'good'
      ? '좋음'
      : grade === 'moderate'
        ? '보통'
        : grade === 'bad'
          ? '나쁨'
          : '미확인 (?)';
  const innerSymbol = grade === 'unknown' ? '?' : '⚓';

  const html = `
    <div class="bada-draggable-overlay" style="display: flex; flex-direction: column; align-items: center; cursor: grab;">
      <div style="
        padding: 3px 9px;
        border-radius: 9999px;
        background: #020617;
        border: 2px solid ${color};
        color: #ffffff;
        font-size: 11px;
        font-weight: 900;
        margin-bottom: 3px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.7);
      ">기상: ${label}</div>
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 9999px;
        background: ${color};
        border: 3.5px solid #ffffff;
        box-shadow: 0 0 18px ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 900;
        color: #ffffff;
      ">${innerSymbol}</div>
    </div>
  `;
  return {
    html,
    width: 56,
    height: 62,
    anchorX: 28,
    anchorY: 56,
    xAnchorRatio: 0.5,
    yAnchorRatio: 56 / 62,
  };
}

/**
 * 6. GPS 내 위치 펄스 마커
 */
export function buildGpsPulseSpec(): MarkerTemplateSpec {
  const html = `
    <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
      <span class="bada-gps-pulse-ring" style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(56, 189, 248, 0.45); border: 2px solid #38bdf8;"></span>
      <span style="position: relative; width: 18px; height: 18px; border-radius: 9999px; background: #0ea5e9; border: 3.5px solid #ffffff; box-shadow: 0 0 12px rgba(14, 165, 233, 0.95);"></span>
    </div>
  `;
  return {
    html,
    width: 44,
    height: 44,
    anchorX: 22,
    anchorY: 22,
    xAnchorRatio: 0.5,
    yAnchorRatio: 0.5,
  };
}
/**
 * 7. QGIS 공간정보 레이어 Point/MultiPoint 피처 마커
 */
export function buildSpatialLayerPointSpec(
  color: string,
  label: string,
  radius = 7,
  showLabel = true,
): MarkerTemplateSpec {
  const safeColor = escapeHtml(color || '#10b981');
  const rawShort = label.length > 14 ? `${label.slice(0, 14)}…` : label;
  const safeLabel = escapeHtml(rawShort);
  const diameter = Math.max(12, Math.min(24, radius * 2));

  const labelHtml =
    showLabel && safeLabel
      ? `<div style="
          padding: 1px 6px;
          border-radius: 5px;
          background: rgba(2, 6, 23, 0.92);
          border: 1.5px solid ${safeColor};
          color: #f8fafc;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
          margin-bottom: 2px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.7);
        ">${safeLabel}</div>`
      : '';

  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
      ${labelHtml}
      <div style="
        width: ${diameter}px;
        height: ${diameter}px;
        border-radius: 9999px;
        background: ${safeColor};
        border: 2.5px solid #ffffff;
        box-shadow: 0 2px 7px rgba(0,0,0,0.8);
      "></div>
    </div>
  `;

  return {
    html,
    width: 44,
    height: showLabel && safeLabel ? 36 : diameter + 6,
    anchorX: 22,
    anchorY: showLabel && safeLabel ? 30 : Math.round((diameter + 6) / 2),
    xAnchorRatio: 0.5,
    yAnchorRatio: showLabel && safeLabel ? 30 / 36 : 0.5,
  };
}

/**
 * 8. QGIS 공간정보 레이어 Polygon/Line 중심점 라벨 오버레이
 */
export function buildSpatialLayerLabelSpec(
  color: string,
  label: string,
): MarkerTemplateSpec {
  const safeColor = escapeHtml(color || '#10b981');
  const rawShort = label.length > 18 ? `${label.slice(0, 18)}…` : label;
  const safeLabel = escapeHtml(rawShort);

  const html = `
    <div style="pointer-events: none; display: flex; align-items: center; justify-content: center;">
      <div style="
        padding: 1.5px 7px;
        border-radius: 6px;
        background: rgba(11, 25, 44, 0.88);
        border: 1.5px solid ${safeColor};
        color: #f8fafc;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.7);
      ">${safeLabel}</div>
    </div>
  `;

  return {
    html,
    width: 110,
    height: 22,
    anchorX: 55,
    anchorY: 11,
    xAnchorRatio: 0.5,
    yAnchorRatio: 0.5,
  };
}
