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
 * 접안지 등급별 GIS 오버레이 zIndex 산출 헬퍼
 * - 복수 등급 또는 전체(55개소) 동시 표출 시에도 '위험주의(red)' 마커가 일반 마커에 가려지지 않도록 최상위 비선택 우선순위를 부여합니다.
 */
export function getDockingMarkerZIndex(
  color: MarkerColor,
  isSelected: boolean,
): number {
  if (isSelected) return 550;
  if (color === 'red') return 380;
  if (color === 'amber') return 340;
  return 300;
}

/**
 * Leaflet 폴백 엔진용 zIndexOffset 산출 헬퍼
 */
export function getDockingMarkerLeafletZOffset(
  color: MarkerColor,
  isSelected: boolean,
): number {
  if (isSelected) return 550;
  if (color === 'red') return 280;
  if (color === 'amber') return 140;
  return 0;
}

/**
 * 1. 커스텀 접안 마커 (5색 · '위험주의(red)' 이중 경보 링 및 ⚠️ 고대비 배지 강화)
 */
export function buildDockingMarkerSpec(
  color: MarkerColor,
  pointCode: string,
  isSelected: boolean,
): MarkerTemplateSpec {
  const safeCode = escapeHtml(pointCode);
  const theme = MARKER_COLOR_MAP[color] ?? MARKER_COLOR_MAP.blue;
  const isHazardRed = color === 'red';
  const scaleStyle = isSelected
    ? 'transform: scale(1.16);'
    : isHazardRed
      ? 'transform: scale(1.04);'
      : '';
  const selectedHalo = isSelected
    ? `<circle cx="26" cy="22" r="21" fill="none" stroke="${theme.ringHex}" stroke-width="3.5" stroke-dasharray="5 3" />`
    : isHazardRed
      ? `<circle cx="26" cy="21" r="20.5" fill="none" stroke="#fca5a5" stroke-opacity="0.85" stroke-width="2.5" stroke-dasharray="4 2" />`
      : '';

  const badgeBg = isHazardRed ? '#450a0a' : '#020617';
  const badgeBorder = isSelected
    ? '#ffffff'
    : isHazardRed
      ? '#fca5a5'
      : theme.hex;
  const badgePrefix = isHazardRed ? '⚠️ ' : '';
  const innerCoreSvg = isHazardRed
    ? `
      <circle cx="26" cy="21" r="8.2" fill="#450a0a" stroke="#ffffff" stroke-width="2.2" />
      <path d="M26 16.2V21.5" stroke="#fef2f2" stroke-width="2.6" stroke-linecap="round" />
      <circle cx="26" cy="24.5" r="1.4" fill="#fef2f2" />
    `
    : `
      <circle cx="26" cy="21" r="7.5" fill="#0b192c" stroke="#ffffff" stroke-width="2" />
      <circle cx="26" cy="21" r="3.2" fill="#ffffff" />
    `;

  const html = `
    <div class="bada-marker-hit-target" style="${scaleStyle}">
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          margin-bottom: 2px;
          padding: 1px 6px;
          border-radius: 6px;
          background: ${badgeBg};
          border: 1.5px solid ${badgeBorder};
          color: #f8fafc;
          font-size: 10px;
          font-weight: 900;
          line-height: 1.2;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.75);
        ">${badgePrefix}${safeCode}</div>
        <svg width="44" height="44" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.72));">
          ${selectedHalo}
          <path d="M26 4C16.611 4 9 11.611 9 21C9 33.25 26 48 26 48C26 48 43 33.25 43 21C43 11.611 35.389 4 26 4Z" fill="${theme.hex}" stroke="#ffffff" stroke-width="3" />
          ${innerCoreSvg}
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
          background: #ffffff;
          border: 3px solid #14b8a6;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0,0,0,0.6);
        "><img src="${import.meta.env.BASE_URL}images/brand/icon_porpoise.png" alt="" style="width: 24px; height: 24px; object-fit: contain;" /></div>
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
 * - 경유지(type === 'waypoint') 마커에는 지도 위에서 즉시 취소(삭제)할 수 있는 [×] 인라인 버튼을 내장합니다.
 */
export function buildRouteWaypointSpec(
  type: 'start' | 'waypoint' | 'end',
  label: string,
  orderIdx: number,
  waypointId?: string,
): MarkerTemplateSpec {
  const rawShortLabel = label.length > 12 ? `${label.slice(0, 12)}…` : label;
  const shortLabel = escapeHtml(rawShortLabel);
  const bg =
    type === 'start' ? '#10b981' : type === 'waypoint' ? '#f59e0b' : '#ef4444';
  const roleTag =
    type === 'start' ? '출발' : type === 'end' ? '도착' : `경유${orderIdx}`;
  const safeWpId = waypointId ? escapeHtml(waypointId) : '';
  const removeBtnHtml =
    type === 'waypoint' && safeWpId
      ? `<button
          type="button"
          data-remove-waypoint-id="${safeWpId}"
          aria-label="${roleTag} ${shortLabel} 경유지 취소"
          title="이 경유지 취소(삭제)"
          style="
            margin-left: 5px;
            min-width: 24px;
            min-height: 24px;
            padding: 0 5px;
            border-radius: 6px;
            background: #ef4444;
            border: 1.5px solid #fecaca;
            color: #ffffff;
            font-size: 11px;
            font-weight: 900;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: auto;
          "
        >✕</button>`
      : '';

  const html = `
    <div class="bada-draggable-overlay" style="display: flex; flex-direction: column; align-items: center; cursor: grab; user-select: none; -webkit-user-select: none;">
      <div style="
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 8px;
        background: #020617;
        border: 2px solid ${bg};
        color: #ffffff;
        font-size: 10px;
        font-weight: 900;
        margin-bottom: 3px;
        white-space: nowrap;
        box-shadow: 0 3px 8px rgba(0,0,0,0.75);
      "><span>[${roleTag}] ${shortLabel}</span>${removeBtnHtml}</div>
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
 * 4. 구간 선 위 예상 소요시간(분) · 거리(NM) · 회전 침로 화살표 배지
 * - Modern Web Guidance (individual-transform-properties): 개별 `rotate` CSS 속성으로 침로 화살표를 회전합니다.
 * - 배지 클릭 시 `data-select-leg-index` 속성을 통해 해당 구간을 양방향 하이라이트합니다.
 */
export function buildRouteLegBadgeSpec(
  durationMinutes: number,
  distanceNm: number,
  bearingDeg: number,
  cardinal: string,
  options?: {
    legIndex?: number;
    safetyLevel?: 'safe' | 'caution' | 'danger';
    isSelected?: boolean;
  },
): MarkerTemplateSpec {
  const mins = Math.round(durationMinutes);
  const nmStr = distanceNm.toFixed(1);
  const safeCardinal = escapeHtml(cardinal);
  const roundedDeg = ((Math.round(bearingDeg) % 360) + 360) % 360;
  const isSelected = Boolean(options?.isSelected);
  const safetyLevel = options?.safetyLevel ?? 'safe';
  const legIndexAttr =
    typeof options?.legIndex === 'number'
      ? `data-select-leg-index="${options.legIndex}"`
      : '';

  const borderColor = isSelected
    ? '#34d399'
    : safetyLevel === 'danger'
      ? '#f59e0b'
      : safetyLevel === 'caution'
        ? '#38bdf8'
        : '#22d3ee';
  const arrowBg = isSelected
    ? '#10b981'
    : safetyLevel === 'danger'
      ? '#f59e0b'
      : '#0ea5e9';
  const boxShadow = isSelected
    ? '0 0 0 2px rgba(52, 211, 153, 0.35), 0 4px 12px rgba(0,0,0,0.85)'
    : '0 3px 10px rgba(0,0,0,0.78)';

  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    ">
      <button
        type="button"
        ${legIndexAttr}
        title="구간 상세 포커스 (${nmStr}NM · 약 ${mins}분 · 침로 ${roundedDeg}° ${safeCardinal})"
        style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px 3px 5px;
          border-radius: 9999px;
          background: rgba(2, 6, 23, 0.94);
          border: ${isSelected ? '2.5px' : '2px'} solid ${borderColor};
          color: #f8fafc;
          font-size: 11px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          box-shadow: ${boxShadow};
          cursor: pointer;
        "
      >
        <span
          aria-hidden="true"
          style="
            width: 17px;
            height: 17px;
            border-radius: 9999px;
            background: ${arrowBg};
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            rotate: ${roundedDeg}deg;
          "
        >
          <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2.5L16.2 16.2L10 12.8L3.8 16.2L10 2.5Z" fill="#020617" />
          </svg>
        </span>
        <span style="color: ${isSelected ? '#6ee7b7' : '#fbbf24'}; font-size: 12px;">${mins}분</span>
        <span style="color: #64748b;">·</span>
        <span style="color: #e0f2fe;">${nmStr}NM</span>
        <span style="color: #94a3b8; font-size: 10px;">${roundedDeg}°${safeCardinal}</span>
      </button>
    </div>
  `;
  return {
    html,
    width: 158,
    height: 30,
    anchorX: 79,
    anchorY: 15,
    xAnchorRatio: 0.5,
    yAnchorRatio: 0.5,
  };
}

/**
 * 4-B. 폴리라인 위 등간격 진행 방향 쉐브론 화살표(➤) 마커
 * - Modern Web Guidance (individual-transform-properties): 개별 `rotate` CSS 속성을 사용하여
 *   진행 방위각(`bearingDeg`)으로 회전된 고대비 해상 침로 화살표를 렌더링합니다.
 */
export function buildRouteDirectionArrowSpec(
  bearingDeg: number,
  safetyLevel: 'safe' | 'caution' | 'danger' = 'safe',
  isSelected = false,
): MarkerTemplateSpec {
  const roundedDeg = ((Math.round(bearingDeg) % 360) + 360) % 360;
  const size = isSelected ? 24 : 20;
  const half = size / 2;

  const borderColor = isSelected
    ? '#34d399'
    : safetyLevel === 'danger'
      ? '#fbbf24'
      : '#22d3ee';
  const fillColor = isSelected
    ? '#6ee7b7'
    : safetyLevel === 'danger'
      ? '#fde68a'
      : '#67e8f9';

  const html = `
    <div
      aria-hidden="true"
      style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        user-select: none;
      "
    >
      <div
        style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 9999px;
          background: rgba(6, 28, 36, 0.92);
          border: 1.8px solid ${borderColor};
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          rotate: ${roundedDeg}deg;
        "
      >
        <svg width="${isSelected ? 14 : 12}" height="${isSelected ? 14 : 12}" viewBox="0 0 20 20" fill="none">
          <path d="M10 2.4L16.4 16.2L10 12.6L3.6 16.2L10 2.4Z" fill="${fillColor}" />
        </svg>
      </div>
    </div>
  `;

  return {
    html,
    width: size,
    height: size,
    anchorX: half,
    anchorY: half,
    xAnchorRatio: 0.5,
    yAnchorRatio: 0.5,
  };
}

/**
 * 4-C. 해상 변침점(수로) 가이드 소형 캡슐 (zoom >= 12 노출)
 */
export function buildSeaWaypointGuideSpec(
  name: string,
  isSelected = false,
): MarkerTemplateSpec {
  const shortName = name.length > 14 ? `${name.slice(0, 14)}…` : name;
  const safeName = escapeHtml(shortName);
  const borderColor = isSelected ? '#34d399' : 'rgba(56, 189, 248, 0.65)';
  const dotColor = isSelected ? '#34d399' : '#38bdf8';

  const html = `
    <div
      aria-hidden="true"
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        user-select: none;
      "
    >
      <div style="
        padding: 1.5px 6px;
        border-radius: 9999px;
        background: rgba(6, 28, 36, 0.88);
        border: 1px solid ${borderColor};
        color: #bae6fd;
        font-size: 9.5px;
        font-weight: 800;
        white-space: nowrap;
        margin-bottom: 2px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.68);
      ">◆ ${safeName}</div>
      <div style="
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: ${dotColor};
        border: 1.5px solid #020617;
        box-shadow: 0 0 6px ${dotColor};
      "></div>
    </div>
  `;

  return {
    html,
    width: 120,
    height: 28,
    anchorX: 60,
    anchorY: 23,
    xAnchorRatio: 0.5,
    yAnchorRatio: 23 / 28,
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
  const innerSymbol =
    grade === 'unknown'
      ? '?'
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`;

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
